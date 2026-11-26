const gameScreen = document.getElementById("gameScreen");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const COLS = 9;
let ROWS = 11;          // 11 w zwykłych trybach, 9 w trybie 4 graczy (kwadrat)

const STEP = 90;
let START_X = 30;       // w trybie 4 graczy większy margines na boczne bramki
const START_Y = 120;
const BALL_MOVE_DURATION = 300;

let GOAL_LEFT = 3;    // zmieniane przez setGameMode() (tryb "wide": bramki na całą szerokość)
let GOAL_RIGHT = 5;
const GOAL_DEPTH = 1;
let PORTRAIT_CANVAS_WIDTH = 780;
let PORTRAIT_CANVAS_HEIGHT = 1140;

const TOP_GOAL_Y = -GOAL_DEPTH;
let BOTTOM_GOAL_Y = ROWS - 1 + GOAL_DEPTH;

// Tryb 4 graczy: bramki boczne (słupki w wierszach GOAL_TOP i GOAL_BOTTOM, tylna ściana w kolumnie -1 i COLS)
let GOAL_TOP = 3;
let GOAL_BOTTOM = 5;
let LEFT_GOAL_X = -GOAL_DEPTH;
let RIGHT_GOAL_X = COLS - 1 + GOAL_DEPTH;

let isLandscape = window.matchMedia("(orientation: landscape)").matches;
let ball = { x: 4, y: 5 };
let currentPlayer = 1;

let scores = [0, 0];   // punkty graczy 1..4 (w trybach dwuosobowych tylko dwa)

let lines = [];
let visitedPoints = new Map();
let gameOver = false;
let ballAnimation = null;
let pendingNextPlayer = null;
let pointEndTimer = null;
let gameMode = "normal";   // "normal", "double" albo "wide" (patrz GAME_MODES), tylko gra z przyjacielem i online
let turnMoves = 0;         // zwykłe (bez odbicia) ruchy wykonane w bieżącej turze

// Tryby gry: "normal", "double" (2 ruchy z rzędu), "wide" (bramki szerokie na całe boisko)
const GAME_MODES = ["normal", "double", "wide", "four", "wrap"];
const MODE_LABELS = { normal: "Normal", double: "2 moves in a row", wide: "Wide goals", four: "4 players", wrap: "Wrap-around" };
let playerCount = 2;       // 2 albo 4 (tryb "four")

function seatsForMode(mode) {
    return mode === "four" ? 4 : 2;
}

// Następny gracz w kolejności tur (1 -> 2 -> ... -> ostatni -> 1)
function nextPlayerAfter(player) {
    return player % playerCount + 1;
}

// Punkt startowy piłki: środek boiska
function startPoint() {
    return { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
}

// Ustawia tryb gry razem z szerokością bramek (słupki w rogach boiska w trybie "wide")
function setGameMode(mode) {
    gameMode = GAME_MODES.includes(mode) ? mode : "normal";
    playerCount = seatsForMode(gameMode);
    const four = playerCount === 4;

    // Bramki u góry i na dole: szerokie na całe boisko ("wide") albo zwykłe
    GOAL_LEFT = gameMode === "wide" ? 0 : 3;
    GOAL_RIGHT = gameMode === "wide" ? COLS - 1 : 5;

    // Tryb 4 graczy: kwadrat 9x9 z czterema bramkami
    ROWS = four ? 9 : 11;
    BOTTOM_GOAL_Y = ROWS - 1 + GOAL_DEPTH;
    GOAL_TOP = 3;
    GOAL_BOTTOM = 5;
    LEFT_GOAL_X = -GOAL_DEPTH;
    RIGHT_GOAL_X = COLS - 1 + GOAL_DEPTH;
    // tryb "wrap": szerszy margines po bokach, żeby piłka mogła wyjechać poza krawędź
    START_X = four ? 120 : (gameMode === "wrap" ? 75 : 30);
    PORTRAIT_CANVAS_WIDTH = four ? 960 : (gameMode === "wrap" ? 870 : 780);
    PORTRAIT_CANVAS_HEIGHT = four ? 960 : 1140;

    applyGameOrientation();
    updateScoreboard();
}

// Karty wyników: w trybie 4 graczy doklejamy karty gracza 3 (zielony) i 4 (żółty), w pozostałych je chowamy
function updateScoreboard() {
    const container = document.querySelector(".score");
    if (!container) return;

    if (!document.getElementById("fourPlayerStyle")) {
        const style = document.createElement("style");
        style.id = "fourPlayerStyle";
        style.textContent = `
            .score.four { flex-wrap: wrap; gap: 8px; }
            .score.four .player { padding: 6px 10px; font-size: 13px; }
            .score.four .player strong { font-size: 18px; margin-left: 2px; }
        `;
        document.head.appendChild(style);
    }

    const four = playerCount === 4;
    container.classList.toggle("four", four);

    for (let n = 3; n <= 4; n++) {
        let card = document.getElementById("playerCard" + n);

        if (!card && four) {
            card = document.createElement("div");
            card.className = "player";
            card.id = "playerCard" + n;
            card.style.setProperty("--player-color", COLORS[n]);

            const dot = document.createElement("span");
            dot.style.cssText = "width:13px;height:13px;border-radius:50%;background:" + COLORS[n];

            const value = document.createElement("strong");
            value.id = "score" + n;
            value.textContent = "0";

            card.append(dot, "Player " + n, value);
            container.appendChild(card);
        }

        if (card) card.style.display = four ? "" : "none";
    }
}
const COLORS = {
    1: "#2563eb",   // niebieski
    2: "#ef4444",   // czerwony
    3: "#16a34a",   // zielony (tryb 4 graczy)
    4: "#eab308"    // żółty (tryb 4 graczy)
};
const COLOR_NAMES = ["blue", "red", "green", "yellow"];

function applyGameOrientation() {
    gameScreen.classList.toggle("landscape", isLandscape);
    canvas.width = isLandscape ? PORTRAIT_CANVAS_HEIGHT : PORTRAIT_CANVAS_WIDTH;
    canvas.height = isLandscape ? PORTRAIT_CANVAS_WIDTH : PORTRAIT_CANVAS_HEIGHT;

    const orientationButton = document.getElementById("orientationToggle");
    orientationButton.setAttribute("aria-pressed", String(isLandscape));
    orientationButton.setAttribute(
        "aria-label",
        isLandscape ? "Switch to portrait layout" : "Switch to landscape layout"
    );
    orientationButton.title = isLandscape
        ? "Switch to portrait layout"
        : "Switch to landscape layout";

    // Boisko 4 graczy jest kwadratem, zwykłe boisko jest wysokim prostokątem (kształt z CSS)
    const container = canvas.parentElement;
    if (container && container.style) {
        // Zwykły kształt boiska pochodzi z CSS; tryby z innym rozmiarem płótna (4 graczy, wrap) ustawiają go tu
        const custom = playerCount === 4 || gameMode === "wrap";
        container.style.aspectRatio = custom ? canvas.width + " / " + canvas.height : "";
        container.style.width = custom && isLandscape
            ? "min(100%, calc((100dvh - 24px) * " + canvas.width + " / " + canvas.height + "))"
            : "";
    }
}

function toggleOrientation() {
    isLandscape = !isLandscape;
    applyGameOrientation();
    draw();
}

applyGameOrientation();

// BACKGROUND

function updateBackground() {
    document.body.style.removeProperty("background-color");
    document.body.style.removeProperty("transition");
    gameScreen.style.setProperty("--turn-color", COLORS[currentPlayer]);
}

async function backToMenu() {
    if (window.bot) window.bot.stop();
    if (window.online && (window.online.active || window.online.searching)) await window.online.leave();
    window.location.href = "index.html";
}

// Tryby gry (okienko wyboru) są tylko w grze z przyjacielem, czyli na stronie friend.html
function isFriendGame() {
    return !window.bot && !window.online &&
        /(^|\/)friend(\.html)?\/?$/.test(window.location.pathname);
}

// Ile zwykłych ruchów trwa tura: "double" = 2 ruchy z rzędu (odbicia nadal dają ruch dodatkowy)
function movesPerTurn() {
    return gameMode === "double" ? 2 : 1;
}

function getSavedGameKey() {
    if (window.online) return null;
    return window.bot ? "pathball.bot.game" : "pathball.friend.game";
}

function saveGame() {
    const key = getSavedGameKey();
    if (!key) return;

    localStorage.setItem(key, JSON.stringify({
        version: 1,
        ball,
        currentPlayer,
        score1: scores[0],
        score2: scores[1],
        scores,
        lines,
        visitedPoints: Array.from(visitedPoints.entries()),
        gameOver,
        pendingNextPlayer,
        mode: gameMode,
        turnMoves
    }));
}

function isValidSavedGame(saved) {
    const players = saved && saved.mode === "four" ? 4 : 2;
    const scoreList = saved && (Array.isArray(saved.scores) ? saved.scores : [saved.score1, saved.score2]);
    const validPlayer = value => Number.isInteger(value) && value >= 1 && value <= players;

    return Boolean(
        saved &&
        saved.version === 1 &&
        saved.ball &&
        Number.isInteger(saved.ball.x) &&
        Number.isInteger(saved.ball.y) &&
        isInsideFieldOrGoal(saved.ball.x, saved.ball.y) &&
        validPlayer(saved.currentPlayer) &&
        Array.isArray(scoreList) &&
        scoreList.length === players &&
        scoreList.every(Number.isInteger) &&
        (players === 4 || scoreList.every(value => value >= 0)) &&
        Array.isArray(saved.lines) &&
        saved.lines.every(line =>
            line &&
            Number.isInteger(line.x1) &&
            Number.isInteger(line.y1) &&
            Number.isInteger(line.x2) &&
            Number.isInteger(line.y2) &&
            isInsideFieldOrGoal(line.x1, line.y1) &&
            isInsideFieldOrGoal(line.x2, line.y2) &&
            (Math.abs(line.x1 - line.x2) <= 1 ||
                (saved.mode === "wrap" && Math.abs(line.x1 - line.x2) === COLS - 1)) &&
            Math.abs(line.y1 - line.y2) <= 1 &&
            (line.x1 !== line.x2 || line.y1 !== line.y2) &&
            validPlayer(line.player)
        ) &&
        Array.isArray(saved.visitedPoints) &&
        saved.visitedPoints.every(entry =>
            Array.isArray(entry) &&
            entry.length === 2 &&
            typeof entry[0] === "string" &&
            validPlayer(entry[1])
        ) &&
        typeof saved.gameOver === "boolean" &&
        (saved.pendingNextPlayer === null || validPlayer(saved.pendingNextPlayer)) &&
        (!saved.gameOver || saved.pendingNextPlayer !== null) &&
        (saved.mode === undefined || GAME_MODES.includes(saved.mode)) &&
        (saved.turnMoves === undefined || (Number.isInteger(saved.turnMoves) && saved.turnMoves >= 0))
    );
}

function loadGame() {
    const key = getSavedGameKey();
    if (!key) return false;

    const stored = localStorage.getItem(key);
    if (!stored) return false;

    let saved;
    try {
        saved = JSON.parse(stored);
    } catch (error) {
        console.warn("Saved game could not be parsed:", error);
        return false;
    }

    // Geometria bramek zależy od trybu, więc tryb ustawiamy przed sprawdzeniem zapisu
    const previousMode = gameMode;
    if (saved && GAME_MODES.includes(saved.mode)) setGameMode(saved.mode);

    if (!isValidSavedGame(saved)) {
        setGameMode(previousMode);
        console.warn("Saved game has an invalid format.");
        return false;
    }

    ball = saved.ball;
    currentPlayer = saved.currentPlayer;
    scores = Array.isArray(saved.scores) ? saved.scores.slice() : [saved.score1, saved.score2];
    lines = saved.lines;
    visitedPoints = new Map(saved.visitedPoints);
    gameOver = saved.gameOver;
    pendingNextPlayer = saved.pendingNextPlayer;
    setGameMode(saved.mode);
    turnMoves = saved.turnMoves || 0;
    ballAnimation = null;

    if (gameOver) {
        completePoint(pendingNextPlayer);
    } else {
        updateActionButton();
        updateScore();
        updateBackground();
        updateTurn();
        draw();
    }

    return true;
}

function initializeGame() {
    if (loadGame()) return;

    if (isFriendGame()) {
        // Nowa gra z przyjacielem: najpierw wybór trybu
        updateActionButton();
        draw();
        chooseGameMode(false, newGame);
    } else {
        newGame();
    }
}

let gameOverScript = null;   // wczytanie gameover.js (tylko raz)

function loadGameOverUI() {
    if (window.showGameOver) return Promise.resolve(true);
    if (!gameOverScript) {
        gameOverScript = new Promise(resolve => {
            const s = document.createElement("script");
            s.src = "gameover.js";
            s.onload = () => resolve(true);
            s.onerror = () => resolve(false);
            document.head.appendChild(s);
        });
    }
    return gameOverScript;
}

// Koniec gry: okienko Game over (gameover.js). Gdyby się nie wczytało, zwykły alert.
function endGameDialog(winner, message, onRematch, loser) {
    gameOver = true;    // plansza zamrożona do czasu wyboru Rematch / Back to menu
    loadGameOverUI().then(ok => {
        if (ok) {
            showGameOver({ winner, loser, message, scores: scores.slice(), onRematch });
        } else {
            alert(message);
            onRematch();
        }
    });
}

// Okienko wyboru trybu (gameover.js). canCancel: dolny przycisk to Cancel (nic się nie zmienia),
// w przeciwnym razie Back to menu. Gdyby okienko się nie wczytało, zostaje obecny tryb.
function chooseGameMode(canCancel, onChosen) {
    loadGameOverUI().then(ok => {
        if (!ok || !window.showModeSelect) {
            onChosen();
            return;
        }

        showModeSelect({
            current: gameMode,
            cancelLabel: canCancel ? "Cancel" : undefined,
            onCancel: canCancel ? () => {} : undefined,
            onChoose: id => {
                setGameMode(id);
                onChosen();
            }
        });
    });
}

// NEW GAME

function newGame() {
    clearTimeout(pointEndTimer);
    pointEndTimer = null;
    pendingNextPlayer = null;
    turnMoves = 0;
    ballAnimation = null;
    ball = startPoint();
    currentPlayer = 1;

    scores = new Array(playerCount).fill(0);

    lines = [];
    visitedPoints = new Map([[`${ball.x},${ball.y}`, currentPlayer]]);
    gameOver = false;

    updateActionButton();
    updateScore();
    updateTurn();
    updateBackground();
    draw();
    saveGame();
}

function completePoint(nextPlayer) {
    ball = startPoint();
    lines = [];
    ballAnimation = null;
    currentPlayer = nextPlayer;
    pendingNextPlayer = null;
    turnMoves = 0;

    visitedPoints = new Map([[`${ball.x},${ball.y}`, currentPlayer]]);

    updateBackground();
    gameOver = false;
    updateScore();
    updateTurn();
    draw();
    saveGame();
}

// Online and bot games: the button is a red "Surrender". Friend games: "New game".
function isSurrenderMode() {
    return Boolean(
        (window.online && window.online.active) ||
        (window.bot && window.bot.active)
    );
}

function updateActionButton() {
    const button = document.querySelector(".newGame");
    const surrender = isSurrenderMode();

    button.textContent = surrender ? "Surrender" : "New game";
    button.classList.toggle("surrender", surrender);
}

function restartClick() {
    if (window.online && window.online.active) {
        if (confirm(playerCount === 4 ? "Surrender? You will lose a point." : "Surrender? Your opponent will win.")) {
            window.online.surrender();
        }
    } else if (window.bot && window.bot.active) {
        if (confirm("Surrender? The bot will win.")) {
            endGameDialog(window.bot.player, "You surrendered. The bot wins!", newGame);
        }
    } else {
        // gra z przyjacielem: przy nowej grze można zmienić tryb
        chooseGameMode(true, newGame);
    }
}

// POSITION

function getPosition(x, y) {
    return {
        x: START_X + x * STEP,
        y: START_Y + y * STEP
    };
}

// Do którego gracza należy bramka: w grze dwuosobowej górna do gracza 2, dolna do gracza 1;
// w grze czteroosobowej (zgodnie z ruchem wskazówek zegara): dół 1, lewa 2, góra 3, prawa 4
function sideOwner(side) {
    if (side === "bottom") return 1;
    if (side === "left") return 2;
    if (side === "top") return playerCount === 4 ? 3 : 2;
    return 4;
}

// Właściciel bramki, w której leży punkt (0 = to nie jest pole bramkowe)
function goalOwnerAt(x, y) {
    if (x > GOAL_LEFT && x < GOAL_RIGHT) {
        if (y === TOP_GOAL_Y) return sideOwner("top");
        if (y === BOTTOM_GOAL_Y) return sideOwner("bottom");
    }

    if (playerCount === 4 && y > GOAL_TOP && y < GOAL_BOTTOM) {
        if (x === LEFT_GOAL_X) return sideOwner("left");
        if (x === RIGHT_GOAL_X) return sideOwner("right");
    }

    return 0;
}

function isGoalPosition(x, y) {
    return goalOwnerAt(x, y) !== 0;
}

function isGoalBackCorner(x, y) {
    if (
        (y === TOP_GOAL_Y || y === BOTTOM_GOAL_Y) &&
        (x === GOAL_LEFT || x === GOAL_RIGHT)
    ) {
        return true;
    }

    return (
        playerCount === 4 &&
        (x === LEFT_GOAL_X || x === RIGHT_GOAL_X) &&
        (y === GOAL_TOP || y === GOAL_BOTTOM)
    );
}

function isInsideFieldOrGoal(x, y) {
    // The field itself
    if (x >= 0 && x < COLS && y >= 0 && y < ROWS) return true;

    // Top goal and bottom goal
    if (x >= GOAL_LEFT && x <= GOAL_RIGHT) {
        if (y >= TOP_GOAL_Y && y < 0) return true;
        if (y > ROWS - 1 && y <= BOTTOM_GOAL_Y) return true;
    }

    // Left goal and right goal (4 players)
    if (playerCount === 4 && y >= GOAL_TOP && y <= GOAL_BOTTOM) {
        if (x >= LEFT_GOAL_X && x < 0) return true;
        if (x > COLS - 1 && x <= RIGHT_GOAL_X) return true;
    }

    return false;
}

function isHumanTurn() {
    if (window.bot && bot.active) return currentPlayer !== bot.player;
    if (window.online && online.active) return currentPlayer === online.me;
    return true;
}

// DRAWING

// Prostokąt tła i ściany bramki w współrzędnych siatki (side: "top" | "bottom" | "left" | "right")
function goalGeometry(side) {
    if (side === "top") {
        return {
            rect: [GOAL_LEFT, TOP_GOAL_Y, GOAL_RIGHT, 0],
            walls: [
                [GOAL_LEFT, 0, GOAL_LEFT, TOP_GOAL_Y],
                [GOAL_RIGHT, 0, GOAL_RIGHT, TOP_GOAL_Y],
                [GOAL_LEFT, TOP_GOAL_Y, GOAL_RIGHT, TOP_GOAL_Y]
            ]
        };
    }

    if (side === "bottom") {
        return {
            rect: [GOAL_LEFT, ROWS - 1, GOAL_RIGHT, BOTTOM_GOAL_Y],
            walls: [
                [GOAL_LEFT, ROWS - 1, GOAL_LEFT, BOTTOM_GOAL_Y],
                [GOAL_RIGHT, ROWS - 1, GOAL_RIGHT, BOTTOM_GOAL_Y],
                [GOAL_LEFT, BOTTOM_GOAL_Y, GOAL_RIGHT, BOTTOM_GOAL_Y]
            ]
        };
    }

    if (side === "left") {
        return {
            rect: [LEFT_GOAL_X, GOAL_TOP, 0, GOAL_BOTTOM],
            walls: [
                [0, GOAL_TOP, LEFT_GOAL_X, GOAL_TOP],
                [0, GOAL_BOTTOM, LEFT_GOAL_X, GOAL_BOTTOM],
                [LEFT_GOAL_X, GOAL_TOP, LEFT_GOAL_X, GOAL_BOTTOM]
            ]
        };
    }

    return {
        rect: [COLS - 1, GOAL_TOP, RIGHT_GOAL_X, GOAL_BOTTOM],
        walls: [
            [COLS - 1, GOAL_TOP, RIGHT_GOAL_X, GOAL_TOP],
            [COLS - 1, GOAL_BOTTOM, RIGHT_GOAL_X, GOAL_BOTTOM],
            [RIGHT_GOAL_X, GOAL_TOP, RIGHT_GOAL_X, GOAL_BOTTOM]
        ]
    };
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#dce9d5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    if (isLandscape) {
        ctx.translate(canvas.width, 0);
        ctx.rotate(Math.PI / 2);
    }

    const four = playerCount === 4;

    // Horizontal field lines
    ctx.strokeStyle = "#78916f";
    ctx.lineWidth = 4;

    for (let y = 0; y < ROWS; y++) {
        const p1 = getPosition(0, y);
        const p2 = getPosition(COLS - 1, y);

        ctx.beginPath();

        if (y === 0 || y === ROWS - 1) {
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(getPosition(GOAL_LEFT, y).x, p1.y);

            ctx.moveTo(getPosition(GOAL_RIGHT, y).x, p1.y);
            ctx.lineTo(p2.x, p2.y);
        } else {
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
        }

        ctx.stroke();
    }

    // Vertical field lines (in the 4-player mode the side edges have openings for the goals)
    for (let x = 0; x < COLS; x++) {
        const top = getPosition(x, 0);
        const bottom = getPosition(x, ROWS - 1);

        ctx.beginPath();

        if (four && (x === 0 || x === COLS - 1)) {
            ctx.moveTo(top.x, top.y);
            ctx.lineTo(top.x, getPosition(x, GOAL_TOP).y);

            ctx.moveTo(bottom.x, getPosition(x, GOAL_BOTTOM).y);
            ctx.lineTo(bottom.x, bottom.y);
        } else {
            ctx.moveTo(top.x, top.y);
            ctx.lineTo(bottom.x, bottom.y);
        }

        ctx.stroke();
    }

    // Goals: background in the owner's color, then the posts and the back wall
    const sides = four ? ["bottom", "left", "top", "right"] : ["top", "bottom"];

    ctx.globalAlpha = 0.3;

    for (const side of sides) {
        const goal = goalGeometry(side);
        const a = getPosition(goal.rect[0], goal.rect[1]);
        const b = getPosition(goal.rect[2], goal.rect[3]);

        ctx.fillStyle = COLORS[sideOwner(side)];
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }

    ctx.globalAlpha = 1;

    ctx.strokeStyle = "#527b4a";
    ctx.lineWidth = 7;

    for (const side of sides) {
        ctx.beginPath();

        for (const [x1, y1, x2, y2] of goalGeometry(side).walls) {
            const a = getPosition(x1, y1);
            const b = getPosition(x2, y2);

            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        }

        ctx.stroke();
    }

    // Field border (same style as the goal walls)
    ctx.strokeStyle = "#527b4a";
    ctx.lineWidth = 7;
    ctx.lineCap = "square";

    const tl = getPosition(0, 0);
    const bl = getPosition(0, ROWS - 1);
    const tr = getPosition(COLS - 1, 0);
    const br = getPosition(COLS - 1, ROWS - 1);
    const gl = getPosition(GOAL_LEFT, 0).x;
    const gr = getPosition(GOAL_RIGHT, 0).x;
    const sideGoalTop = getPosition(0, GOAL_TOP).y;
    const sideGoalBottom = getPosition(0, GOAL_BOTTOM).y;

    const wrap = gameMode === "wrap";

    ctx.beginPath();
    ctx.moveTo(gl, tl.y);
    ctx.lineTo(tl.x, tl.y);
    if (wrap) {
        ctx.moveTo(bl.x, bl.y);     // tryb wrap: bez bocznej ściany
    } else {
        if (four) {
            ctx.lineTo(tl.x, sideGoalTop);
            ctx.moveTo(tl.x, sideGoalBottom);
        }
        ctx.lineTo(bl.x, bl.y);
    }
    ctx.lineTo(gl, bl.y);

    ctx.moveTo(gr, tr.y);
    ctx.lineTo(tr.x, tr.y);
    if (wrap) {
        ctx.moveTo(br.x, br.y);
    } else {
        if (four) {
            ctx.lineTo(tr.x, sideGoalTop);
            ctx.moveTo(tr.x, sideGoalBottom);
        }
        ctx.lineTo(br.x, br.y);
    }
    ctx.lineTo(gr, br.y);
    ctx.stroke();

    // Tryb wrap: przerywane boczne linie pokazują, że prowadzą na drugą stronę boiska
    if (wrap) {
        ctx.strokeStyle = "#0ea5e9";
        ctx.lineWidth = 5;
        ctx.lineCap = "butt";
        ctx.setLineDash([14, 12]);

        ctx.beginPath();
        ctx.moveTo(tl.x, tl.y);
        ctx.lineTo(bl.x, bl.y);
        ctx.moveTo(tr.x, tr.y);
        ctx.lineTo(br.x, br.y);
        ctx.stroke();

        ctx.setLineDash([]);
    }

    // Used paths
    lines.forEach(line => {
        const a = getPosition(line.x1, line.y1);
        const b = getPosition(line.x2, line.y2);
        const wrapStep = Math.abs(line.x1 - line.x2) > 1
            ? stepBetween(line.x1, line.y1, line.x2, line.y2)
            : null;

        ctx.beginPath();

        if (wrapStep) {
            // linia przez boczną krawędź: wyjście z jednej strony i wejście z drugiej
            const exit = getPosition(line.x1 + wrapStep[0] * 0.5, line.y1 + wrapStep[1] * 0.5);
            const enter = getPosition(line.x2 - wrapStep[0] * 0.5, line.y2 - wrapStep[1] * 0.5);

            ctx.moveTo(a.x, a.y);
            ctx.lineTo(exit.x, exit.y);
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(enter.x, enter.y);
        } else {
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        }

        ctx.strokeStyle = COLORS[line.player];
        ctx.lineWidth = 11;
        ctx.lineCap = "round";
        ctx.stroke();
    });

    // Grid points
    for (let y = TOP_GOAL_Y; y <= BOTTOM_GOAL_Y; y++) {
        for (let x = LEFT_GOAL_X; x <= RIGHT_GOAL_X; x++) {
            if (!isInsideFieldOrGoal(x, y)) continue;

            const p = getPosition(x, y);
            const firstPlayer = visitedPoints.get(`${x},${y}`);

            ctx.beginPath();
            ctx.arc(p.x, p.y, firstPlayer ? 8 : 6, 0, Math.PI * 2);
            ctx.fillStyle = firstPlayer ? COLORS[firstPlayer] : "#58734f";
            ctx.fill();
        }
    }

    // Highlight legal destinations only on the human player's turn
    if (isHumanTurn()) getLegalMoves().forEach(({ x, y }) => {
        const p = getPosition(x, y);

        ctx.beginPath();
        ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(34, 197, 94, 0.3)";
        ctx.fill();
        ctx.strokeStyle = "#15803d";
        ctx.lineWidth = 3;
        ctx.stroke();
    });

    // Tryb wrap: znaczniki wyjścia przy krawędzi dla ruchów na drugą stronę
    if (isHumanTurn() && gameMode === "wrap") getLegalMoves().forEach(({ x, y }) => {
        const step = Math.abs(x - ball.x) > 1 ? stepBetween(ball.x, ball.y, x, y) : null;
        if (!step) return;

        const exit = getPosition(ball.x + step[0] * 0.5, ball.y + step[1] * 0.5);

        ctx.beginPath();
        ctx.arc(exit.x, exit.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(34, 197, 94, 0.3)";
        ctx.fill();
        ctx.strokeStyle = "#15803d";
        ctx.lineWidth = 3;
        ctx.stroke();
    });

    // Ball
    let ballX = ball.x;
    let ballY = ball.y;
    let ballScale = 1;
    let liftHeight = 0;

    if (ballAnimation) {
        const progress = ballAnimation.progress;
        const easedProgress = progress * progress * (3 - 2 * progress);
        const lift = Math.sin(Math.PI * easedProgress);

        ballX = ballAnimation.fromX +
            (ballAnimation.toX - ballAnimation.fromX) * easedProgress;

        ballY = ballAnimation.fromY +
            (ballAnimation.toY - ballAnimation.fromY) * easedProgress;

        // przejście przez boczną krawędź: piłka wyjeżdża z jednej strony i wjeżdża z drugiej
        if (ballAnimation.wrapDir) {
            const [wdx, wdy] = ballAnimation.wrapDir;
            const half = progress < 0.5 ? progress * 2 : (progress - 0.5) * 2;
            const t = half * half * (3 - 2 * half);

            if (progress < 0.5) {
                ballX = ballAnimation.fromX + wdx * 0.5 * t;
                ballY = ballAnimation.fromY + wdy * 0.5 * t;
            } else {
                ballX = ballAnimation.toX - wdx * 0.5 * (1 - t);
                ballY = ballAnimation.toY - wdy * 0.5 * (1 - t);
            }
        }

        ballScale = 1 + 0.4 * lift;
        liftHeight = 22 * lift;
    }

    const p = getPosition(ballX, ballY);

    if (liftHeight > 0) {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 15, 20, 7, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 0, 0, ${0.22 * (1 - liftHeight / 32)})`;
        ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y - liftHeight, 21 * ballScale, 0, Math.PI * 2);

    ctx.fillStyle = COLORS[ballAnimation ? ballAnimation.player : currentPlayer];
    ctx.fill();

    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.restore();
}

// CHECK USED LINES

function edgeKey(x1, y1, x2, y2) {
    const a = `${x1},${y1}`;
    const b = `${x2},${y2}`;

    return [a, b].sort().join("|");
}

function hasLine(x1, y1, x2, y2) {
    const key = edgeKey(x1, y1, x2, y2);

    return lines.some(line =>
        edgeKey(
            line.x1,
            line.y1,
            line.x2,
            line.y2
        ) === key
    );
}

function hasUsedLineAt(x, y) {
    return lines.some(line =>
        (line.x1 === x && line.y1 === y) ||
        (line.x2 === x && line.y2 === y)
    );
}

// WALLS

function isWallPosition(x, y) {
    // Left and right field walls (in the 4-player mode with an opening for the side goals)
    // (tryb "wrap": boczne linie nie są ścianami, tylko przejściami na drugą stronę)
    if ((x === 0 || x === COLS - 1) && gameMode !== "wrap") {
        if (playerCount === 4 && y > GOAL_TOP && y < GOAL_BOTTOM) return false;
        return true;
    }

    // Goal corners where the posts meet the field boundary
    if (
        (y === 0 || y === ROWS - 1) &&
        (x === GOAL_LEFT || x === GOAL_RIGHT)
    ) {
        return true;
    }

    // Top and bottom field walls, except goal openings
    if (y === 0 || y === ROWS - 1) {
        return !(x >= GOAL_LEFT && x <= GOAL_RIGHT);
    }

    // Side walls of top goal
    if (
        y < 0 &&
        y > TOP_GOAL_Y &&
        (x === GOAL_LEFT || x === GOAL_RIGHT)
    ) {
        return true;
    }

    // Side walls of bottom goal
    if (
        y > ROWS - 1 &&
        y < BOTTOM_GOAL_Y &&
        (x === GOAL_LEFT || x === GOAL_RIGHT)
    ) {
        return true;
    }

    // Back walls
    if (y === TOP_GOAL_Y || y === BOTTOM_GOAL_Y) {
        return true;
    }

    // Back walls of the side goals (4 players)
    if (playerCount === 4 && (x === LEFT_GOAL_X || x === RIGHT_GOAL_X)) {
        return true;
    }

    return false;
}

function isAlongSameWall(oldX, oldY, x, y) {
    const four = playerCount === 4;
    const inSideMouth = value => value >= GOAL_TOP && value <= GOAL_BOTTOM;
    const insideSideGoalMouth = four && inSideMouth(oldY) && inSideMouth(y);

    // Left and right field walls (moving along the open mouth of a side goal is allowed)
    if (gameMode !== "wrap") {
        if (oldX === 0 && x === 0 && !insideSideGoalMouth) return true;
        if (oldX === COLS - 1 && x === COLS - 1 && !insideSideGoalMouth) return true;
    }

    // Top field wall
    if (
        oldY === 0 && y === 0 &&
        !(oldX >= GOAL_LEFT && oldX <= GOAL_RIGHT &&
          x >= GOAL_LEFT && x <= GOAL_RIGHT)
    ) {
        return true;
    }

    // Bottom field wall
    if (
        oldY === ROWS - 1 && y === ROWS - 1 &&
        !(oldX >= GOAL_LEFT && oldX <= GOAL_RIGHT &&
          x >= GOAL_LEFT && x <= GOAL_RIGHT)
    ) {
        return true;
    }

    // Top goal left and right walls
    if (
        oldX === GOAL_LEFT && x === GOAL_LEFT &&
        oldY <= 0 && y <= 0 &&
        (oldY < 0 || y < 0)
    ) return true;

    if (
        oldX === GOAL_RIGHT && x === GOAL_RIGHT &&
        oldY <= 0 && y <= 0 &&
        (oldY < 0 || y < 0)
    ) return true;

    // Bottom goal left and right walls
    if (
        oldX === GOAL_LEFT && x === GOAL_LEFT &&
        oldY >= ROWS - 1 && y >= ROWS - 1 &&
        (oldY > ROWS - 1 || y > ROWS - 1)
    ) return true;

    if (
        oldX === GOAL_RIGHT && x === GOAL_RIGHT &&
        oldY >= ROWS - 1 && y >= ROWS - 1 &&
        (oldY > ROWS - 1 || y > ROWS - 1)
    ) return true;

    // Goal back walls
    if (
        (oldY === TOP_GOAL_Y && y === TOP_GOAL_Y) ||
        (oldY === BOTTOM_GOAL_Y && y === BOTTOM_GOAL_Y)
    ) {
        return true;
    }

    // Side goals (4 players): posts and back walls
    if (four) {
        for (const post of [GOAL_TOP, GOAL_BOTTOM]) {
            if (oldY === post && y === post && oldX <= 0 && x <= 0 && (oldX < 0 || x < 0)) return true;
            if (oldY === post && y === post && oldX >= COLS - 1 && x >= COLS - 1 && (oldX > COLS - 1 || x > COLS - 1)) return true;
        }

        if (
            (oldX === LEFT_GOAL_X && x === LEFT_GOAL_X) ||
            (oldX === RIGHT_GOAL_X && x === RIGHT_GOAL_X)
        ) {
            return true;
        }
    }

    return false;
}

// MOVE BALL

// Przesunięcie o jedno pole z (x1,y1) do (x2,y2) albo null, jeśli pola nie sąsiadują.
// W trybie "wrap" lewa i prawa krawędź sąsiadują ze sobą (jak w Snake), więc dx = +/-(COLS-1) to ruch o jedno pole.
function stepBetween(x1, y1, x2, y2) {
    let dx = x2 - x1;
    const dy = y2 - y1;

    if (gameMode === "wrap") {
        if (dx === COLS - 1) dx = -1;
        else if (dx === -(COLS - 1)) dx = 1;
    }

    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) return null;
    return [dx, dy];
}

function isLegalMove(x, y) {
    if (!stepBetween(ball.x, ball.y, x, y)) return false;

    return (
        !gameOver &&
        isInsideFieldOrGoal(x, y) &&
        !isGoalBackCorner(x, y) &&
        !isAlongSameWall(ball.x, ball.y, x, y) &&
        !hasLine(ball.x, ball.y, x, y)
    );
}

function getLegalMoves() {
    const moves = [];

    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            let x = ball.x + dx;
            const y = ball.y + dy;

            // wrap: z lewej krawędzi na prawą i odwrotnie
            if (gameMode === "wrap") x = (x + COLS) % COLS;

            if (isLegalMove(x, y)) {
                moves.push({ x, y });
            }
        }
    }

    return moves;
}

// Tryb "wrap": ruch przez boczną krawędź, którego znacznik wyjścia (pół pola za krawędzią) jest pod (rx, ry)
// we współrzędnych siatki. Zwraca legalny ruch albo null.
function wrapMoveAt(rx, ry) {
    if (gameMode !== "wrap") return null;

    for (const move of getLegalMoves()) {
        if (Math.abs(move.x - ball.x) <= 1) continue;

        const [dx, dy] = stepBetween(ball.x, ball.y, move.x, move.y);
        if (Math.hypot(rx - (ball.x + dx * 0.5), ry - (ball.y + dy * 0.5)) < 0.4) return move;
    }

    return null;
}

function animateBall(fromX, fromY, toX, toY) {
    const animation = {
        fromX,
        fromY,
        toX,
        toY,
        player: currentPlayer,
        progress: 0,
        startedAt: null,
        // ruch przez boczną krawędź: kierunek wyjścia (inaczej null)
        wrapDir: Math.abs(toX - fromX) > 1 ? stepBetween(fromX, fromY, toX, toY) : null
    };

    ballAnimation = animation;

    function renderFrame(timestamp) {
        if (ballAnimation !== animation) return;

        if (animation.startedAt === null) {
            animation.startedAt = timestamp;
        }

        animation.progress = Math.min(
            (timestamp - animation.startedAt) / BALL_MOVE_DURATION,
            1
        );

        draw();

        if (animation.progress < 1) {
            requestAnimationFrame(renderFrame);
        } else {
            ballAnimation = null;
            draw();
        }
    }

    requestAnimationFrame(renderFrame);
}

// winner: gracz, który zdobywa punkt (0 = nikt), loser: gracz, który traci punkt (tylko tryb 4 graczy)
function finishPoint(winner, message, loser) {
    if (winner) scores[winner - 1]++;
    if (loser) scores[loser - 1]--;

    updateScore();
    gameOver = true;
    document.getElementById("turnInfo").textContent = message;
    draw();
    pendingNextPlayer = nextPlayerAfter(currentPlayer);
    saveGame();

    pointEndTimer = setTimeout(() => {
        endGameDialog(winner, message, () => completePoint(pendingNextPlayer), loser);
    }, BALL_MOVE_DURATION + 180);
}

function moveBall(x, y) {
    if (ballAnimation || !isLegalMove(x, y)) return;

    const oldX = ball.x;
    const oldY = ball.y;
    const destinationKey = `${x},${y}`;

    // Bounce from walls or used paths
    const bounce =
        hasUsedLineAt(x, y) ||
        isWallPosition(x, y);

    // Save movement
    lines.push({
        x1: oldX,
        y1: oldY,
        x2: x,
        y2: y,
        player: currentPlayer
    });

    ball.x = x;
    ball.y = y;

    if (!visitedPoints.has(destinationKey)) {
        visitedPoints.set(destinationKey, currentPlayer);
    }

    animateBall(oldX, oldY, x, y);

    // GOAL
    if (isGoalPosition(x, y)) {
        if (playerCount === 2) {
            const winner = y === TOP_GOAL_Y ? 1 : 2;
            finishPoint(winner, "GOAL! Player " + winner + " wins the point!");
        } else {
            // 4 graczy: kto wprowadzi piłkę do cudzej bramki, zdobywa punkt; do własnej traci punkt
            const owner = goalOwnerAt(x, y);

            if (owner === currentPlayer) {
                finishPoint(0, "Own goal! Player " + currentPlayer + " loses a point.", currentPlayer);
            } else {
                finishPoint(
                    currentPlayer,
                    "GOAL! Player " + currentPlayer + " scores in Player " + owner + "'s goal!"
                );
            }
        }

        return;
    }

    // Bounce keeps the turn. Otherwise the move counts, and the turn passes
    // once all moves of the turn are used (1 in normal mode, 2 in "2 moves in a row").
    if (!bounce) {
        turnMoves++;
        if (turnMoves >= movesPerTurn()) {
            turnMoves = 0;
            currentPlayer = nextPlayerAfter(currentPlayer);
            updateBackground();
        }
    }

    if (getLegalMoves().length === 0 && playerCount === 4) {
        // 4 graczy: kto nie ma ruchu, traci punkt
        finishPoint(
            0,
            "Player " + currentPlayer + " has no legal moves and loses a point.",
            currentPlayer
        );

        return;
    }

    if (getLegalMoves().length === 0) {
        const loser = currentPlayer;
        const winner = loser === 1 ? 2 : 1;

        finishPoint(
            winner,
            "Player " + winner + " wins the point! Player " +
                loser + " has no legal moves."
        );

        return;
    }

    updateTurn();
    draw();
    saveGame();
}

// CLICK ON CANVAS

canvas.addEventListener("click", function(event) {
    const rect = canvas.getBoundingClientRect();

    const mouseX =
        (event.clientX - rect.left) *
        canvas.width / rect.width;

    const mouseY =
        (event.clientY - rect.top) *
        canvas.height / rect.height;

    const logicalX = isLandscape ? mouseY : mouseX;
    const logicalY = isLandscape ? canvas.width - mouseX : mouseY;
    let x = Math.round((logicalX - START_X) / STEP);
    let y = Math.round((logicalY - START_Y) / STEP);

    // Tryb wrap: dotknięcie znacznika wyjścia przy krawędzi też przenosi piłkę na drugą stronę
    const portal = wrapMoveAt((logicalX - START_X) / STEP, (logicalY - START_Y) / STEP);
    if (portal) {
        x = portal.x;
        y = portal.y;
    }

    if (!isInsideFieldOrGoal(x, y)) return;
    if (!isHumanTurn()) return;

    if (window.online && window.online.active) {
        window.online.click(x, y);
    } else {
        moveBall(x, y);
    }
});

// UPDATE UI

function updateScore() {
    for (let player = 1; player <= playerCount; player++) {
        const element = document.getElementById("score" + player);
        if (element) element.textContent = scores[player - 1];
    }
}

function updateTurn() {
    const turnInfo = document.getElementById("turnInfo");
    let text = "Player " + currentPlayer + "'s turn";
    if (movesPerTurn() > 1) text += " (move " + (turnMoves + 1) + "/" + movesPerTurn() + ")";
    turnInfo.textContent = text;
    turnInfo.classList.remove("turn-change");
    void turnInfo.offsetWidth;
    turnInfo.classList.add("turn-change");

    document.querySelectorAll(".player").forEach((player, index) => {
        player.classList.toggle("active", index + 1 === currentPlayer);
    });

    if (window.bot) bot.onTurn();
}
