import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
    getDatabase, ref, push, set, get, remove, query, orderByChild, endAt, limitToFirst,
    onChildAdded, onValue, onDisconnect, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

const app = initializeApp({
    apiKey: "AIzaSyCzEV2gAMv-ncevuJ3wps-ksGPl6K0MBAk",
    authDomain: "pathball-9d69e.firebaseapp.com",
    databaseURL: "https://pathball-9d69e-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "pathball-9d69e",
    appId: "1:337231326041:web:a51c0df385b1aafbd77a48"
});
const db = getDatabase(app);

// Pokój bez graczy i bez aktywności dłużej niż tyle zostaje usunięty
const STALE_MS = 15 * 60 * 1000;

// ===== Kolejka (matchmaking) =====
// W bazie jest jedno "miejsce w poczekalni" na tryb: matchmaking/queues/<tryb> = { id, ts }.
// Kto przyjdzie, gdy miejsce jest wolne, zajmuje je i czeka.
// Kto przyjdzie, gdy ktoś już czeka, zwalnia miejsce, tworzy pokój
// i wpisuje jego kod do matchmaking/matches/<id czekającego>. Obaj wchodzą do pokoju.
// Osobna poczekalnia dla każdego trybu gry ("normal", "double"), żeby gracze trafiali na kogoś z tym samym trybem.
const queuePath = mode => `matchmaking/queues/${mode}`;
const MATCHES_PATH = "matchmaking/matches";
const HEARTBEAT_MS = 15 * 1000;          // co tyle czekający odświeża swój wpis
const QUEUE_STALE_MS = 45 * 1000;        // wpis starszy niż to = gracz zniknął
const OPPONENT_TIMEOUT_MS = 15 * 1000;   // tyle czekamy, aż przeciwnik wejdzie do pokoju

const online = { active: false, room: null, me: 0, searching: false, matched: false, maxPlayers: 2, allHere: true };
window.online = online;

let queue = [];       // ruchy czekające na wykonanie
let unsubMoves = null;
let unsubPlayers = null;
let pump = null;

// Stan wyszukiwania przeciwnika
const GROUP_SIZE = 4;   // tryb 4 graczy: tylu graczy potrzeba do rozpoczęcia gry z kolejki
const mm = { id: null, queue: null, multi: false, queueData: null, heartbeat: null, unsubMatch: null, unsubCount: null, countTimer: null, retryTimer: null };
const myIds = new Set();   // wszystkie identyfikatory wyszukiwań z tej karty (żeby nie sparować się z samym sobą)

// Czas serwera (różnica zegarów klientów nie psuje wykrywania starych wpisów)
let serverOffset = 0;
onValue(ref(db, ".info/serverTimeOffset"), s => { serverOffset = s.val() || 0; });
const serverNow = () => Date.now() + serverOffset;

// ===== Ekran wyboru (lobby) =====
const lobby = document.getElementById("onlineLobby");
const lobbyStatus = document.getElementById("lobbyStatus");
const lobbyChoices = document.getElementById("lobbyChoices");
const lobbyCancel = document.getElementById("lobbyCancel");

// Gdy lobby jest otwarte (wybór trybu albo szukanie przeciwnika), chowamy planszę i resztę ekranu gry.
// Samo lobby (i wszystko w nim) zostaje widoczne.
const lobbyStyle = document.createElement("style");
lobbyStyle.textContent = `
    body.lobby-open #gameScreen { visibility: hidden; }
    body.lobby-open #onlineLobby,
    body.lobby-open #onlineLobby * { visibility: visible; }
`;
document.head.appendChild(lobbyStyle);

// Przycisk wyjścia do menu w lobby (dodawany tylko, jeśli lobby nie ma własnego),
// bo przycisk z ekranu gry jest teraz schowany.
if (!lobby.querySelector('[onclick*="backToMenu"], a[href], #lobbyBack, .backButton')) {
    const lobbyBack = document.createElement("button");
    lobbyBack.className = "backButton";
    lobbyBack.textContent = "Back to menu";
    lobbyBack.onclick = () => backToMenu();
    (lobbyChoices.parentElement || lobby).appendChild(lobbyBack);
}

function showLobby(status = "", searching = false) {
    if (window.hideGameOver) window.hideGameOver();
    document.body.classList.add("lobby-open");
    lobby.classList.remove("hidden");
    lobbyStatus.textContent = status;
    lobbyStatus.classList.toggle("searching", searching);
    lobbyChoices.classList.toggle("hidden", searching);
    lobbyCancel.classList.toggle("hidden", !searching);
}

function hideLobby() {
    document.body.classList.remove("lobby-open");
    lobby.classList.add("hidden");
}

// ===== Kod pokoju na ekranie gry (zamiast alertu) =====
// Pokazujemy go w linii z podpowiedzią pod planszą (".instructions"), a po wyjściu z pokoju
// przywracamy dawny tekst. Dotknięcie linii kopiuje kod do schowka.
const roomStyle = document.createElement("style");
roomStyle.textContent = `
    .instructions.roomCode {
        color: #e2e8f0;
        font-size: 16px;
        font-weight: 700;
        line-height: 1.5;
        white-space: pre-line;
        cursor: pointer;
    }
`;
document.head.appendChild(roomStyle);

let roomState = null;   // { code, seat, present, max } albo null, gdy nie jesteśmy w pokoju prywatnym

function renderRoomCode(flash) {
    let el = document.querySelector(".instructions");

    if (!roomState) {
        if (!el) return;
        if (el.dataset.original !== undefined) el.textContent = el.dataset.original;
        el.classList.remove("roomCode");
        el.title = "";
        el.onclick = null;
        return;
    }

    if (!el) {
        el = document.createElement("p");
        el.className = "instructions";
        document.getElementById("turnInfo").after(el);
    }
    if (el.dataset.original === undefined) el.dataset.original = el.textContent;

    const { code, seat, present, max } = roomState;
    const color = COLOR_NAMES[seat - 1];
    const people = max > 2
        ? `${present}/${max} players`
        : (present >= max ? "opponent connected" : "waiting for opponent");
    const status = `You are Player ${seat} (${color}) · ${people}` +
        (gameMode !== "normal" && gameMode !== "four" ? " · " + MODE_LABELS[gameMode] : "");

    el.textContent = `Room code: ${code}\n` + (flash || status);
    el.classList.add("roomCode");
    el.title = "Tap to copy the code";
    el.onclick = () => {
        if (!roomState || !navigator.clipboard) return;
        navigator.clipboard.writeText(roomState.code).then(() => {
            renderRoomCode("Code copied!");
            setTimeout(() => renderRoomCode(), 1200);
        }).catch(() => {});
    };
}

function showRoomCode(code, seat, present, max) {
    roomState = { code, seat, present, max };
    renderRoomCode();
}

function hideRoomCode() {
    roomState = null;
    renderRoomCode();
}

// Zapisuje czas ostatniej aktywności w pokoju
function touch(code) {
    set(ref(db, `rooms/${code}/lastActive`), serverTimestamp());
}

// Usuwa stare pokoje, w których nikogo nie ma (maks. 20 naraz)
async function cleanupStaleRooms() {
    try {
        const q = query(
            ref(db, "rooms"),
            orderByChild("lastActive"),
            endAt(Date.now() - STALE_MS),
            limitToFirst(20)
        );
        const snap = await get(q);
        snap.forEach(child => {
            if (!child.val().players) remove(child.ref);
        });
    } catch (e) {
        console.warn("Cleanup failed:", e);
    }
}

// Wykonuje ruchy po kolei, dopiero gdy poprzedni się skończył
function startPump() {
    clearInterval(pump);
    pump = setInterval(() => {
        if (ballAnimation || gameOver || queue.length === 0) return;
        const m = queue.shift();
        if (m.t === "reset") {
            newGame();
        } else if (m.t === "surrender") {
            if (playerCount === 4) {
                finishPoint(0, "Player " + m.p + " surrendered and loses a point.", m.p);
            } else {
                const winner = m.p === 1 ? 2 : 1;
                endGameDialog(winner, "Player " + m.p + " surrendered.", newGame);
            }
        } else {
            moveBall(m.x, m.y);
        }
    }, 50);
}

// Zajmuje wolne miejsce (1 = niebieski, 2 = czerwony); 0 = pokój pełny
async function claimSeat(code, maxSeats = 2) {
    let seat = 0;
    await runTransaction(ref(db, `rooms/${code}/players`), cur => {
        cur = cur || {};
        for (let s = 1; s <= maxSeats; s++) {
            if (!cur[s]) { seat = s; cur[s] = true; return cur; }
        }
        seat = 0;
        return; // przerwij – pokój pełny
    });
    return seat;
}

// Tryb pokoju prywatnego jest zapisany w bazie (rooms/<kod>/mode), żeby obaj gracze grali tak samo.
// Pierwszy gracz w pokoju ustala tryb (jeśli ktoś już go ustalił, przejmuje go),
// drugi czeka chwilę na zapis trybu i go przejmuje.
const validMode = value => (["double", "wide", "four"].includes(value) ? value : "normal");

async function readRoomMode(code) {
    for (let i = 0; i < 10; i++) {
        const snap = await get(ref(db, `rooms/${code}/mode`));
        if (snap.exists()) return validMode(snap.val());
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    return "normal";
}

async function syncRoomMode(code, seat) {
    if (seat === 1) {
        const res = await runTransaction(ref(db, `rooms/${code}/mode`), cur => cur || gameMode);
        setGameMode(validMode(res.snapshot.val()));
    } else {
        setGameMode(await readRoomMode(code));
    }
}

const randomCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

// Wejście do pokoju. matched = gra z kolejki (pilnujemy obecności przeciwnika).
async function joinRoom(code, matched) {
    // Ile miejsc ma pokój: w pokoju prywatnym wynika z jego trybu (jeśli pokój już istnieje)
    let maxSeats = seatsForMode(gameMode);
    if (!matched) {
        const existing = await get(ref(db, `rooms/${code}/mode`));
        if (existing.exists()) maxSeats = seatsForMode(validMode(existing.val()));
    }

    const seat = await claimSeat(code, maxSeats);
    if (!seat) return 0;

    onDisconnect(ref(db, `rooms/${code}/players/${seat}`)).remove();

    if (!matched) {
        await syncRoomMode(code, seat);   // w kolejce tryb wynika z wybranej poczekalni

        if (seat > seatsForMode(gameMode)) {
            // pokój ma mniej miejsc, niż zajęliśmy (wyścig przy zakładaniu pokoju): zwalniamy miejsce
            onDisconnect(ref(db, `rooms/${code}/players/${seat}`)).cancel();
            await set(ref(db, `rooms/${code}/players/${seat}`), null);
            return 0;
        }
    }

    online.active = true;
    online.room = code;
    online.me = seat;
    online.matched = matched;
    online.maxPlayers = seatsForMode(gameMode);
    online.allHere = online.maxPlayers === 2;   // w grze 4-osobowej ruchy ruszają, gdy są wszyscy
    queue = [];

    touch(code);

    hideLobby();
    newGame();
    updateActionButton();
    if (matched) hideRoomCode(); else showRoomCode(code, seat, 1, online.maxPlayers);

    unsubMoves = onChildAdded(ref(db, `rooms/${code}/moves`), snap => {
        queue.push(snap.val());
    });
    startPump();
    watchPlayers(code, matched);
    return seat;
}

// Pilnuje, kto jest w pokoju: czeka na wszystkich graczy i wykrywa wyjście któregoś z nich
function watchPlayers(code, matched) {
    let everyoneSeen = false;
    let timeout = null;
    const max = online.maxPlayers;

    if (matched) {
        timeout = setTimeout(async () => {
            if (everyoneSeen || online.room !== code) return;
            // nie wszyscy dotarli – wracamy do kolejki
            await leaveRoom();
            findMatch(max > 2
                ? "Players didn't connect. Searching again…"
                : "Opponent didn't connect. Searching again…");
        }, OPPONENT_TIMEOUT_MS);
    }

    unsubPlayers = onValue(ref(db, `rooms/${code}/players`), snap => {
        if (online.room !== code) return;
        const players = snap.val() || {};

        let present = 0;
        for (let seat = 1; seat <= max; seat++) {
            if (players[seat]) present++;
        }

        const allHere = present === max;
        online.allHere = allHere;
        if (!matched) showRoomCode(code, online.me, present, max);

        if (allHere && !everyoneSeen) {
            everyoneSeen = true;
            clearTimeout(timeout);
            if (matched) {
                const color = COLOR_NAMES[online.me - 1];
                setTimeout(() => alert(
                    `${max > 2 ? "Players found" : "Opponent found"}! You are Player ${online.me} (${color}).` +
                    (gameMode !== "normal" && gameMode !== "four" ? "\nMode: " + MODE_LABELS[gameMode] + "." : "")
                ), 0);
            }
        } else if (!allHere && everyoneSeen && matched) {
            everyoneSeen = false;
            leaveRoom().then(() => showLobby(max > 2 ? "A player left the game." : "Your opponent left the game."));
        }
    });
}

// ===== Kolejka =====
async function findMatch(message) {
    if (online.searching || online.active) return;
    if (seatsForMode(gameMode) > 2) return findMatchGroup(message);
    if (!message) message = "Searching for an opponent…";
    cleanupStaleRooms();

    online.searching = true;
    const myId = push(ref(db, MATCHES_PATH)).key;   // sam klucz, nic nie zapisuje
    myIds.add(myId);
    mm.id = myId;
    const waitPath = queuePath(gameMode);   // poczekalnia dla wybranego trybu
    mm.queue = waitPath;
    showLobby(message, true);

    let opponentId = null;
    try {
        await runTransaction(ref(db, waitPath), cur => {
            opponentId = null;
            // wpis z wcześniejszego wyszukiwania z tej samej karty to nie przeciwnik
            if (cur && !myIds.has(cur.id) && serverNow() - cur.ts < QUEUE_STALE_MS) {
                opponentId = cur.id;   // ktoś czeka – zabieramy go
                return null;
            }
            return { id: myId, ts: serverNow() };   // czekamy my
        });
    } catch (e) {
        console.warn("Queue failed:", e);
        stopSearch();
        showLobby("Couldn't join the queue. Try again.");
        return;
    }

    if (!online.searching || mm.id !== myId) return;   // anulowano w międzyczasie

    if (opponentId) {
        // Tworzymy pokój i zapraszamy czekającego
        const code = randomCode();
        stopSearch();
        await set(ref(db, `${MATCHES_PATH}/${opponentId}`), code);
        await joinRoom(code, true);
        return;
    }

    // Czekamy w poczekalni
    onDisconnect(ref(db, waitPath)).remove();
    onDisconnect(ref(db, `${MATCHES_PATH}/${myId}`)).remove();

    mm.unsubMatch = onValue(ref(db, `${MATCHES_PATH}/${myId}`), async snap => {
        const code = snap.val();
        if (!code || mm.id !== myId) return;
        stopSearch();
        remove(ref(db, `${MATCHES_PATH}/${myId}`));
        await joinRoom(code, true);
    });

    mm.heartbeat = setInterval(() => heartbeat(myId, waitPath), HEARTBEAT_MS);
}

// ===== Kolejka grupowa (tryb 4 graczy) =====
// Poczekalnia to lista: matchmaking/queues/<tryb>/<id> = { ts }. Kto przyjdzie jako ostatni potrzebny
// (czwarty), zabiera trzech czekających, tworzy pokój i wpisuje jego kod do matchmaking/matches/<id>.

async function findMatchGroup(message) {
    cleanupStaleRooms();

    online.searching = true;
    const myId = push(ref(db, MATCHES_PATH)).key;   // sam klucz, nic nie zapisuje
    myIds.add(myId);
    mm.id = myId;
    mm.multi = true;
    const waitPath = queuePath(gameMode);
    mm.queue = waitPath;
    showLobby(message || "Searching for players…", true);

    let invited = null;
    try {
        await runTransaction(ref(db, waitPath), cur => {
            invited = null;
            const now = serverNow();
            const fresh = {};

            // zostają tylko świeże wpisy; wpisy z tej karty (wcześniejsze wyszukiwania) są wyrzucane
            for (const id of Object.keys(cur || {})) {
                const entry = cur[id];
                if (entry && typeof entry.ts === "number" && now - entry.ts < QUEUE_STALE_MS && !myIds.has(id)) {
                    fresh[id] = entry;
                }
            }

            const waiting = Object.keys(fresh);
            if (waiting.length + 1 >= GROUP_SIZE) {
                // grupa jest pełna: zabieramy najdłużej czekających
                waiting.sort((a, b) => fresh[a].ts - fresh[b].ts);
                invited = waiting.slice(0, GROUP_SIZE - 1);
                for (const id of invited) delete fresh[id];
            } else {
                fresh[myId] = { ts: now };   // czekamy my
            }

            return Object.keys(fresh).length ? fresh : null;
        });
    } catch (e) {
        console.warn("Queue failed:", e);
        stopSearch();
        showLobby("Couldn't join the queue. Try again.");
        return;
    }

    if (!online.searching || mm.id !== myId) return;   // anulowano w międzyczasie

    if (invited) {
        // Tworzymy pokój i zapraszamy pozostałych
        const code = randomCode();
        stopSearch();
        await Promise.all(invited.map(id => set(ref(db, `${MATCHES_PATH}/${id}`), code)));
        await joinRoom(code, true);
        return;
    }

    // Czekamy w poczekalni
    onDisconnect(ref(db, `${waitPath}/${myId}`)).remove();
    onDisconnect(ref(db, `${MATCHES_PATH}/${myId}`)).remove();

    mm.unsubMatch = onValue(ref(db, `${MATCHES_PATH}/${myId}`), async snap => {
        const code = snap.val();
        if (!code || mm.id !== myId) return;
        stopSearch();
        remove(ref(db, `${MATCHES_PATH}/${myId}`));
        await joinRoom(code, true);
    });

    showQueueCount(1);
    watchQueueCount(waitPath);
    mm.heartbeat = setInterval(() => heartbeatGroup(myId, waitPath), HEARTBEAT_MS);
}

// Napis "x/4 players": ile osób jest w kolejce (razem z nami)
function showQueueCount(count) {
    lobbyStatus.textContent = `Searching for players… ${count}/${GROUP_SIZE} players`;
}

function watchQueueCount(waitPath) {
    const render = data => {
        const now = serverNow();
        let count = 0;

        for (const id of Object.keys(data || {})) {
            const entry = data[id];
            if (entry && typeof entry.ts === "number" && now - entry.ts < QUEUE_STALE_MS) count++;
        }

        if (online.searching && mm.multi) showQueueCount(Math.min(count, GROUP_SIZE));
    };

    mm.unsubCount = onValue(ref(db, waitPath), snap => {
        mm.queueData = snap.val();
        render(mm.queueData);
    });
    mm.countTimer = setInterval(() => render(mm.queueData), 5000);   // wpisy "starzeją się" także bez zmian w bazie
}

// Odświeża swój wpis w poczekalni grupowej. Jeśli wpis zniknął, a zaproszenie nie przyszło,
// wracamy do kolejki od nowa.
async function heartbeatGroup(myId, waitPath) {
    let mine = false;
    await runTransaction(ref(db, waitPath), cur => {
        mine = Boolean(cur && cur[myId]);
        if (!mine) return cur;                  // nie zwracamy undefined (patrz heartbeat)
        cur[myId] = { ts: serverNow() };
        return cur;
    }).catch(() => {});

    if (mine || mm.id !== myId) return;

    clearTimeout(mm.retryTimer);
    mm.retryTimer = setTimeout(() => {
        if (mm.id !== myId || !online.searching) return;   // zaproszenie przyszło
        stopSearch();
        findMatch();
    }, 3000);
}

// Odświeża wpis w poczekalni. Jeśli ktoś go zabrał, a zaproszenie nie przyszło,
// wracamy do kolejki od nowa.
async function heartbeat(myId, waitPath) {
    let mine = false;
    await runTransaction(ref(db, waitPath), cur => {
        mine = Boolean(cur && cur.id === myId);
        // Nie zwracamy undefined (to przerywa transakcję bez sprawdzenia serwera, gdy lokalna
        // pamięć jest pusta). Zwrócenie cur = "nic nie zmieniaj", a baza sprawdzi prawdziwą wartość.
        if (!mine) return cur;
        return { id: myId, ts: serverNow() };
    }).catch(() => {});

    if (mine || mm.id !== myId) return;

    clearTimeout(mm.retryTimer);
    mm.retryTimer = setTimeout(() => {
        if (mm.id !== myId || !online.searching) return; // zaproszenie przyszło
        stopSearch();
        findMatch();
    }, 3000);
}

// Kończy wyszukiwanie (lokalnie) i zwalnia miejsce w poczekalni, jeśli jest nasze.
// Zwraca obietnicę, żeby można było poczekać na usunięcie wpisu (np. przed wyjściem do menu).
function stopSearch() {
    const myId = mm.id;
    const waitPath = mm.queue;
    const multi = mm.multi;
    online.searching = false;
    mm.id = null;
    mm.multi = false;
    clearInterval(mm.heartbeat);
    clearInterval(mm.countTimer);
    clearTimeout(mm.retryTimer);
    if (mm.unsubMatch) mm.unsubMatch();
    if (mm.unsubCount) mm.unsubCount();
    mm.unsubMatch = null;
    mm.unsubCount = null;
    if (!myId) return Promise.resolve();

    if (multi) {
        onDisconnect(ref(db, `${waitPath}/${myId}`)).cancel();
        onDisconnect(ref(db, `${MATCHES_PATH}/${myId}`)).cancel();
        return runTransaction(ref(db, waitPath), cur => {
            if (!cur || !cur[myId]) return cur;     // nie nasz wpis albo pusto: nic nie zmieniaj
            delete cur[myId];
            return Object.keys(cur).length ? cur : null;
        }).catch(() => {});
    }

    onDisconnect(ref(db, waitPath)).cancel();
    onDisconnect(ref(db, `${MATCHES_PATH}/${myId}`)).cancel();
    return runTransaction(ref(db, waitPath), cur => {
        // usuń tylko swój wpis; w innym wypadku zwróć cur (nie undefined, patrz heartbeat)
        return cur && cur.id === myId ? null : cur;
    }).catch(() => {});
}

function cancelSearch() {
    stopSearch();
    showLobby();
}

// ===== Pokoje prywatne (kod) =====
async function playPrivate(code) {
    cleanupStaleRooms();
    if (!code) code = randomCode();
    code = code.trim().toUpperCase();

    const seat = await joinRoom(code, false);
    if (!seat) { showLobby("That room is full."); return; }
}

window.playOnline = function () {
    showLobby();
};

// Quick match i tworzenie pokoju: najpierw wybór trybu (Cancel zostawia lobby bez zmian)
document.getElementById("lobbyQuick").onclick = () => chooseGameMode(true, () => findMatch());
document.getElementById("lobbyCreate").onclick = () => chooseGameMode(true, () => playPrivate(""));
document.getElementById("lobbyJoin").onclick = () => {
    const code = (prompt("Room code:") || "").trim();
    if (code) {
        setGameMode("normal");   // dołączając, tryb bierzemy z pokoju (tu: wartość domyślna dla pustego pokoju)
        playPrivate(code);
    }
};
lobbyCancel.onclick = cancelSearch;

online.click = (x, y) => {
    if (currentPlayer !== online.me) return;            // nie twoja tura
    if (!online.allHere) return;                        // w grze 4-osobowej czekamy na wszystkich graczy
    if (ballAnimation || gameOver || queue.length) return;
    if (!isLegalMove(x, y)) return;
    push(ref(db, `rooms/${online.room}/moves`), { t: "move", x, y });
    touch(online.room);
};

online.surrender = () => {
    push(ref(db, `rooms/${online.room}/moves`), { t: "surrender", p: online.me });
    touch(online.room);
};

// Wyjście z pokoju (bez przechodzenia do menu)
async function leaveRoom() {
    if (!online.active) return;

    const room = online.room;
    const seat = online.me;

    online.active = false;
    online.room = null;
    online.matched = false;
    queue = [];
    if (unsubMoves) unsubMoves();
    if (unsubPlayers) unsubPlayers();
    unsubMoves = unsubPlayers = null;
    clearInterval(pump);
    hideRoomCode();
    updateActionButton();

    onDisconnect(ref(db, `rooms/${room}/players/${seat}`)).cancel();

    try {
        // Zwolnij swoje miejsce; jeśli to był ostatni gracz, usuń cały pokój
        const res = await runTransaction(ref(db, `rooms/${room}/players`), cur => {
            cur = cur || {};
            delete cur[seat];
            return Object.keys(cur).length ? cur : null;
        });
        if (!res.snapshot.exists()) await remove(ref(db, `rooms/${room}`));
    } catch (e) {
        console.warn("Leave failed:", e);
    }
}

online.leave = async () => {
    if (online.searching) await stopSearch();
    await leaveRoom();
};
