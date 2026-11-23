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
// W bazie jest jedno "miejsce w poczekalni": matchmaking/waiting = { id, ts }.
// Kto przyjdzie, gdy miejsce jest wolne, zajmuje je i czeka.
// Kto przyjdzie, gdy ktoś już czeka, zwalnia miejsce, tworzy pokój
// i wpisuje jego kod do matchmaking/matches/<id czekającego>. Obaj wchodzą do pokoju.
const WAITING_PATH = "matchmaking/waiting";
const MATCHES_PATH = "matchmaking/matches";
const HEARTBEAT_MS = 15 * 1000;          // co tyle czekający odświeża swój wpis
const QUEUE_STALE_MS = 45 * 1000;        // wpis starszy niż to = gracz zniknął
const OPPONENT_TIMEOUT_MS = 15 * 1000;   // tyle czekamy, aż przeciwnik wejdzie do pokoju

const online = { active: false, room: null, me: 0, searching: false, matched: false };
window.online = online;

let queue = [];       // ruchy czekające na wykonanie
let unsubMoves = null;
let unsubPlayers = null;
let pump = null;

// Stan wyszukiwania przeciwnika
const mm = { id: null, heartbeat: null, unsubMatch: null, retryTimer: null };
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
            const winner = m.p === 1 ? 2 : 1;
            endGameDialog(winner, "Player " + m.p + " surrendered.", newGame);
        } else {
            moveBall(m.x, m.y);
        }
    }, 50);
}

// Zajmuje wolne miejsce (1 = niebieski, 2 = czerwony); 0 = pokój pełny
async function claimSeat(code) {
    let seat = 0;
    await runTransaction(ref(db, `rooms/${code}/players`), cur => {
        cur = cur || {};
        if (!cur[1]) { seat = 1; cur[1] = true; return cur; }
        if (!cur[2]) { seat = 2; cur[2] = true; return cur; }
        seat = 0;
        return; // przerwij – pokój pełny
    });
    return seat;
}

const randomCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

// Wejście do pokoju. matched = gra z kolejki (pilnujemy obecności przeciwnika).
async function joinRoom(code, matched) {
    const seat = await claimSeat(code);
    if (!seat) return 0;

    online.active = true;
    online.room = code;
    online.me = seat;
    online.matched = matched;
    queue = [];

    onDisconnect(ref(db, `rooms/${code}/players/${seat}`)).remove();
    touch(code);

    hideLobby();
    newGame();
    updateActionButton();

    unsubMoves = onChildAdded(ref(db, `rooms/${code}/moves`), snap => {
        queue.push(snap.val());
    });
    startPump();
    watchPlayers(code, matched);
    return seat;
}

// Pilnuje, kto jest w pokoju: czeka na przeciwnika i wykrywa jego wyjście
function watchPlayers(code, matched) {
    let opponentSeen = false;
    let timeout = null;

    if (matched) {
        timeout = setTimeout(async () => {
            if (opponentSeen || online.room !== code) return;
            // przeciwnik nie dotarł – wracamy do kolejki
            await leaveRoom();
            findMatch("Opponent didn't connect. Searching again…");
        }, OPPONENT_TIMEOUT_MS);
    }

    unsubPlayers = onValue(ref(db, `rooms/${code}/players`), snap => {
        if (online.room !== code) return;
        const players = snap.val() || {};
        const opponentHere = Boolean(players[3 - online.me]);

        if (opponentHere && !opponentSeen) {
            opponentSeen = true;
            clearTimeout(timeout);
            if (matched) {
                const color = online.me === 1 ? "blue" : "red";
                setTimeout(() => alert(`Opponent found! You are Player ${online.me} (${color}).`), 0);
            }
        } else if (!opponentHere && opponentSeen && matched) {
            opponentSeen = false;
            leaveRoom().then(() => showLobby("Your opponent left the game."));
        }
    });
}

// ===== Kolejka =====
async function findMatch(message = "Searching for an opponent…") {
    if (online.searching || online.active) return;
    cleanupStaleRooms();

    online.searching = true;
    const myId = push(ref(db, MATCHES_PATH)).key;   // sam klucz, nic nie zapisuje
    myIds.add(myId);
    mm.id = myId;
    showLobby(message, true);

    let opponentId = null;
    try {
        await runTransaction(ref(db, WAITING_PATH), cur => {
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
    onDisconnect(ref(db, WAITING_PATH)).remove();
    onDisconnect(ref(db, `${MATCHES_PATH}/${myId}`)).remove();

    mm.unsubMatch = onValue(ref(db, `${MATCHES_PATH}/${myId}`), async snap => {
        const code = snap.val();
        if (!code || mm.id !== myId) return;
        stopSearch();
        remove(ref(db, `${MATCHES_PATH}/${myId}`));
        await joinRoom(code, true);
    });

    mm.heartbeat = setInterval(() => heartbeat(myId), HEARTBEAT_MS);
}

// Odświeża wpis w poczekalni. Jeśli ktoś go zabrał, a zaproszenie nie przyszło,
// wracamy do kolejki od nowa.
async function heartbeat(myId) {
    let mine = false;
    await runTransaction(ref(db, WAITING_PATH), cur => {
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
    online.searching = false;
    mm.id = null;
    clearInterval(mm.heartbeat);
    clearTimeout(mm.retryTimer);
    if (mm.unsubMatch) mm.unsubMatch();
    mm.unsubMatch = null;
    if (!myId) return Promise.resolve();

    onDisconnect(ref(db, WAITING_PATH)).cancel();
    onDisconnect(ref(db, `${MATCHES_PATH}/${myId}`)).cancel();
    return runTransaction(ref(db, WAITING_PATH), cur => {
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
    alert(`Room code: ${code}\nYou are Player ${seat}.`);
}

window.playOnline = function () {
    showLobby();
};

document.getElementById("lobbyQuick").onclick = () => findMatch();
document.getElementById("lobbyCreate").onclick = () => playPrivate("");
document.getElementById("lobbyJoin").onclick = () => {
    const code = (prompt("Room code:") || "").trim();
    if (code) playPrivate(code);
};
lobbyCancel.onclick = cancelSearch;

online.click = (x, y) => {
    if (currentPlayer !== online.me) return;            // nie twoja tura
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
