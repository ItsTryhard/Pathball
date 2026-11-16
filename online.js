import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
    getDatabase, ref, push, set, onChildAdded, onDisconnect, runTransaction
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

// 1) WKLEJ TUTAJ SWOJE firebaseConfig z konsoli Firebase
const app = initializeApp({
    apiKey: "AIzaSyCzEV2gAMv-ncevuJ3wps-ksGPl6K0MBAk",
    authDomain: "pathball-9d69e.firebaseapp.com",
    databaseURL: "https://pathball-9d69e-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "pathball-9d69e",
    appId: "1:337231326041:web:a51c0df385b1aafbd77a48"
});
const db = getDatabase(app);

const online = { active: false, room: null, me: 0 };
window.online = online;

let queue = [];       // ruchy czekające na wykonanie
let unsubMoves = null;
let pump = null;

// Wykonuje ruchy po kolei, dopiero gdy poprzedni się skończył
function startPump() {
    clearInterval(pump);
    pump = setInterval(() => {
        if (ballAnimation || gameOver || queue.length === 0) return;
        const m = queue.shift();
        if (m.t === "reset") newGame();
        else moveBall(m.x, m.y);
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
