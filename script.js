const gameScreen = document.getElementById("gameScreen");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const COLS = 9;
const ROWS = 11;

const STEP = 90;
const START_X = 30;
const START_Y = 120;
const BALL_MOVE_DURATION = 300;

const GOAL_LEFT = 3;
const GOAL_RIGHT = 5;
const GOAL_DEPTH = 1;
const PORTRAIT_CANVAS_WIDTH = 780;
const PORTRAIT_CANVAS_HEIGHT = 1140;

const TOP_GOAL_Y = -GOAL_DEPTH;
const BOTTOM_GOAL_Y = ROWS - 1 + GOAL_DEPTH;

let isLandscape = window.matchMedia("(orientation: landscape)").matches;
let ball = { x: 4, y: 5 };
let currentPlayer = 1;

let score1 = 0;
let score2 = 0;

let lines = [];
let visitedPoints = new Map();
let gameOver = false;
let ballAnimation = null;
let pendingNextPlayer = null;
let pointEndTimer = null;

const COLORS = {
    1: "#2563eb",
    2: "#ef4444"
};

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
    if (window.online && window.online.active) await window.online.leave();
    window.location.href = "index.html";
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
        score1,
        score2,
        lines,
        visitedPoints: Array.from(visitedPoints.entries()),
        gameOver,
        pendingNextPlayer
    }));
}

function isValidSavedGame(saved) {
    return Boolean(
        saved &&
        saved.version === 1 &&
        saved.ball &&
        Number.isInteger(saved.ball.x) &&
        Number.isInteger(saved.ball.y) &&
        isInsideFieldOrGoal(saved.ball.x, saved.ball.y) &&
        (saved.currentPlayer === 1 || saved.currentPlayer === 2) &&
        Number.isInteger(saved.score1) &&
        saved.score1 >= 0 &&
        Number.isInteger(saved.score2) &&
        saved.score2 >= 0 &&
        Array.isArray(saved.lines) &&
        saved.lines.every(line =>
            line &&
            Number.isInteger(line.x1) &&
            Number.isInteger(line.y1) &&
            Number.isInteger(line.x2) &&
            Number.isInteger(line.y2) &&
            isInsideFieldOrGoal(line.x1, line.y1) &&
            isInsideFieldOrGoal(line.x2, line.y2) &&
            Math.abs(line.x1 - line.x2) <= 1 &&
            Math.abs(line.y1 - line.y2) <= 1 &&
            (line.x1 !== line.x2 || line.y1 !== line.y2) &&
            (line.player === 1 || line.player === 2)
        ) &&
        Array.isArray(saved.visitedPoints) &&
        saved.visitedPoints.every(entry =>
            Array.isArray(entry) &&
            entry.length === 2 &&
            typeof entry[0] === "string" &&
            (entry[1] === 1 || entry[1] === 2)
        ) &&
        typeof saved.gameOver === "boolean" &&
        (
            saved.pendingNextPlayer === null ||
            saved.pendingNextPlayer === 1 ||
            saved.pendingNextPlayer === 2
        ) &&
        (!saved.gameOver || saved.pendingNextPlayer !== null)
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

    if (!isValidSavedGame(saved)) {
        console.warn("Saved game has an invalid format.");
        return false;
    }

    ball = saved.ball;
    currentPlayer = saved.currentPlayer;
    score1 = saved.score1;
    score2 = saved.score2;
    lines = saved.lines;
    visitedPoints = new Map(saved.visitedPoints);
    gameOver = saved.gameOver;
    pendingNextPlayer = saved.pendingNextPlayer;
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
    if (!loadGame()) newGame();
}

// NEW GAME

function newGame() {
    clearTimeout(pointEndTimer);
    pointEndTimer = null;
    pendingNextPlayer = null;
    ballAnimation = null;
    ball = { x: 4, y: 5 };
    currentPlayer = 1;

    score1 = 0;
    score2 = 0;

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
    ball = { x: 4, y: 5 };
    lines = [];
    ballAnimation = null;
    currentPlayer = nextPlayer;
    pendingNextPlayer = null;

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
        if (confirm("Surrender? Your opponent will win.")) {
            window.online.surrender();
        }
    } else if (window.bot && window.bot.active) {
        if (confirm("Surrender? The bot will win.")) {
            alert("You surrendered. The bot wins!");
            newGame();
        }
    } else {
        newGame();
    }
}

// POSITION

function getPosition(x, y) {
    return {
        x: START_X + x * STEP,
        y: START_Y + y * STEP
    };
}

function isGoalPosition(x, y) {
    return (
        x > GOAL_LEFT &&
        x < GOAL_RIGHT &&
        (y === TOP_GOAL_Y || y === BOTTOM_GOAL_Y)
    );
}

function isGoalBackCorner(x, y) {
    return (
        (y === TOP_GOAL_Y || y === BOTTOM_GOAL_Y) &&
        (x === GOAL_LEFT || x === GOAL_RIGHT)
    );
}

function isInsideFieldOrGoal(x, y) {
    if (x < 0 || x >= COLS) return false;

    if (y >= 0 && y < ROWS) return true;

    // Top goal
    if (
        y >= TOP_GOAL_Y &&
        y < 0 &&
        x >= GOAL_LEFT &&
        x <= GOAL_RIGHT
    ) {
        return true;
    }

    // Bottom goal
    if (
        y > ROWS - 1 &&
        y <= BOTTOM_GOAL_Y &&
        x >= GOAL_LEFT &&
        x <= GOAL_RIGHT
    ) {
        return true;
    }

    return false;
}

function isHumanTurn() {
    if (window.bot && bot.active) return currentPlayer !== bot.player;
    if (window.online && online.active) return currentPlayer === online.me;
    return true;
}

// DRAWING

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#dce9d5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    if (isLandscape) {
        ctx.translate(canvas.width, 0);
        ctx.rotate(Math.PI / 2);
    }

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

    // Vertical field lines
    for (let x = 0; x < COLS; x++) {
        const top = getPosition(x, 0);
        const bottom = getPosition(x, ROWS - 1);

        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bottom.x, bottom.y);
        ctx.stroke();
    }

    // Goal backgrounds show the opposing player's color.
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = COLORS[2];

    ctx.fillRect(
        START_X + GOAL_LEFT * STEP,
        START_Y - STEP,
        (GOAL_RIGHT - GOAL_LEFT) * STEP,
        STEP
    );

    ctx.fillStyle = COLORS[1];

    ctx.fillRect(
        START_X + GOAL_LEFT * STEP,
        START_Y + (ROWS - 1) * STEP,
        (GOAL_RIGHT - GOAL_LEFT) * STEP,
        STEP
    );

    ctx.globalAlpha = 1;

    // Goal walls
    ctx.strokeStyle = "#527b4a";
    ctx.lineWidth = 7;

    // Top goal
    ctx.beginPath();
    ctx.moveTo(START_X + GOAL_LEFT * STEP, START_Y);
    ctx.lineTo(START_X + GOAL_LEFT * STEP, START_Y - STEP);

    ctx.moveTo(START_X + GOAL_RIGHT * STEP, START_Y);
    ctx.lineTo(START_X + GOAL_RIGHT * STEP, START_Y - STEP);

    ctx.moveTo(START_X + GOAL_LEFT * STEP, START_Y - STEP);
    ctx.lineTo(START_X + GOAL_RIGHT * STEP, START_Y - STEP);
    ctx.stroke();

    // Bottom goal
    ctx.beginPath();
    ctx.moveTo(
        START_X + GOAL_LEFT * STEP,
        START_Y + (ROWS - 1) * STEP
    );
    ctx.lineTo(
        START_X + GOAL_LEFT * STEP,
        START_Y + ROWS * STEP
    );

    ctx.moveTo(
        START_X + GOAL_RIGHT * STEP,
        START_Y + (ROWS - 1) * STEP
    );
    ctx.lineTo(
        START_X + GOAL_RIGHT * STEP,
        START_Y + ROWS * STEP
    );

    ctx.moveTo(
        START_X + GOAL_LEFT * STEP,
        START_Y + ROWS * STEP
    );
    ctx.lineTo(
        START_X + GOAL_RIGHT * STEP,
        START_Y + ROWS * STEP
    );
    ctx.stroke();

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

    ctx.beginPath();
    ctx.moveTo(gl, tl.y);
    ctx.lineTo(tl.x, tl.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.lineTo(gl, bl.y);

    ctx.moveTo(gr, tr.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(gr, br.y);
    ctx.stroke();

    // Used paths
    lines.forEach(line => {
        const a = getPosition(line.x1, line.y1);
        const b = getPosition(line.x2, line.y2);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);

        ctx.strokeStyle = COLORS[line.player];
        ctx.lineWidth = 11;
        ctx.lineCap = "round";
        ctx.stroke();
    });

    // Grid points
    for (let y = TOP_GOAL_Y; y <= BOTTOM_GOAL_Y; y++) {
        for (let x = 0; x < COLS; x++) {
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
    // Left and right field walls
    if (x === 0 || x === COLS - 1) return true;

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

    return false;
}

function isAlongSameWall(oldX, oldY, x, y) {
    // Left and right field walls
    if (oldX === 0 && x === 0) return true;
    if (oldX === COLS - 1 && x === COLS - 1) return true;

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

    return false;
}

// MOVE BALL

function isLegalMove(x, y) {
    const dx = x - ball.x;
    const dy = y - ball.y;

    if (
        Math.abs(dx) > 1 ||
        Math.abs(dy) > 1 ||
        (dx === 0 && dy === 0)
    ) {
        return false;
    }

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
            const x = ball.x + dx;
            const y = ball.y + dy;

            if (isLegalMove(x, y)) {
                moves.push({ x, y });
            }
        }
    }

    return moves;
}

function animateBall(fromX, fromY, toX, toY) {
    const animation = {
        fromX,
        fromY,
        toX,
        toY,
        player: currentPlayer,
        progress: 0,
        startedAt: null
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

function finishPoint(winner, message) {
    if (winner === 1) {
        score1++;
    } else {
        score2++;
    }

    updateScore();
    gameOver = true;
    document.getElementById("turnInfo").textContent = message;
    draw();
    pendingNextPlayer = currentPlayer === 1 ? 2 : 1;
    saveGame();

    pointEndTimer = setTimeout(() => {
        alert(message);
        completePoint(pendingNextPlayer);
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
        const winner = y === TOP_GOAL_Y ? 1 : 2;
        finishPoint(winner, "GOAL! Player " + winner + " wins the point!");
        return;
    }

    // Bounce or change turn
    if (!bounce) {
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        updateBackground();
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
    const x = Math.round((logicalX - START_X) / STEP);
    const y = Math.round((logicalY - START_Y) / STEP);

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
    document.getElementById("score1").textContent = score1;
    document.getElementById("score2").textContent = score2;
}

function updateTurn() {
    const turnInfo = document.getElementById("turnInfo");
    turnInfo.textContent = "Player " + currentPlayer + "'s turn";
    turnInfo.classList.remove("turn-change");
    void turnInfo.offsetWidth;
    turnInfo.classList.add("turn-change");

    document.querySelectorAll(".player").forEach((player, index) => {
        player.classList.toggle("active", index + 1 === currentPlayer);
    });

    if (window.bot) bot.onTurn();
}
