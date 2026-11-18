import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
    getDatabase, ref, push, set, get, remove, query, orderByChild, endAt, limitToFirst,
    onChildAdded, onDisconnect, runTransaction, serverTimestamp
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

const online = { active: false, room: null, me: 0 };
window.online = online;

let queue = [];       // ruchy czekające na wykonanie
let unsubMoves = null;
let pump = null;

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
            alert("Player " + m.p + " surrendered. Player " + winner + " wins!");
            newGame();
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

window.playOnline = async function () {
    cleanupStaleRooms();   // sprzątanie w tle

    let code = (prompt("Kod pokoju (zostaw puste, żeby utworzyć nowy):") || "")
        .trim().toUpperCase();
    if (!code) code = Math.random().toString(36).slice(2, 6).toUpperCase();

    const seat = await claimSeat(code);
    if (!seat) { alert("Pokój jest pełny."); return; }

    online.active = true;
    online.room = code;
    online.me = seat;
    queue = [];

    onDisconnect(ref(db, `rooms/${code}/players/${seat}`)).remove();
    touch(code);

    newGame();

    unsubMoves = onChildAdded(ref(db, `rooms/${code}/moves`), snap => {
        queue.push(snap.val());
    });
    startPump();

    alert(`Kod pokoju: ${code}\nJesteś graczem ${seat}.`);
};

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

online.leave = async () => {
    if (!online.active) return;

    const room = online.room;
    const seat = online.me;

    online.active = false;
    queue = [];
    if (unsubMoves) unsubMoves();
    clearInterval(pump);

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
};
