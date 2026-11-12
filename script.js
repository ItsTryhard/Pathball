
const mainMenu = document.getElementById("mainMenu");
const gameScreen = document.getElementById("gameScreen");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const COLS = 9;
const ROWS = 13;

const STEP = 90;
const START_X = 90;
const START_Y = 100;

let ball = { x: 4, y: 6 };

let currentPlayer = 1;

let score1 = 0;
let score2 = 0;

let lines = [];

let gameOver = false;

const COLORS = {
    1: "#2563eb",
    2: "#ef4444"
};

// MENU

function playFriend() {
    mainMenu.classList.add("hidden");
    gameScreen.classList.remove("hidden");

    newGame();
}

function playBot() {
    alert("Bot mode coming soon!");
}

function backToMenu() {
    gameScreen.classList.add("hidden");
    mainMenu.classList.remove("hidden");
}

// NEW GAME

function newGame() {
    ball = { x: 4, y: 6 };

    currentPlayer = 1;

    score1 = 0;
    score2 = 0;

    lines = [];

    gameOver = false;

    updateScore();
    updateTurn();
    draw();
}

// DRAWING

function getPosition(x, y) {
    return {
        x: START_X + x * STEP,
        y: START_Y + y * STEP
    };
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background

    ctx.fillStyle = "#dce9d5";
    ctx.fillRect(0, 0, 900, 1280);

    // Field lines

    ctx.strokeStyle = "#78916f";
    ctx.lineWidth = 4;

    // Horizontal lines

    for (let y = 0; y < ROWS; y++) {
        ctx.beginPath();

        for (let x = 0; x < COLS; x++) {
            const p = getPosition(x, y);

            if (x === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }

        ctx.stroke();
    }

    // Vertical lines

    for (let x = 0; x < COLS; x++) {
        ctx.beginPath();

        for (let y = 0; y < ROWS; y++) {
            const p = getPosition(x, y);

            if (y === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }

        ctx.stroke();
    }

    // Goals

    ctx.fillStyle = "#a5c99a";

    ctx.fillRect(270, 0, 360, 100);
    ctx.fillRect(270, 1180, 360, 100);

    ctx.strokeStyle = "#527b4a";
    ctx.lineWidth = 7;

    ctx.strokeRect(270, 0, 360, 100);
    ctx.strokeRect(270, 1180, 360, 100);

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

    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const p = getPosition(x, y);

            ctx.beginPath();
            ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);

            ctx.fillStyle = "#58734f";
            ctx.fill();
        }
    }

    // Ball

    const p = getPosition(ball.x, ball.y);

    ctx.beginPath();
    ctx.arc(p.x, p.y, 21, 0, Math.PI * 2);

    ctx.fillStyle = "#ffffff";
    ctx.fill();

    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 5;
    ctx.stroke();
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
            line.x1, line.y1,
            line.x2, line.y2
        ) === key
    );
}

function hasUsedLineAt(x, y) {
    return lines.some(line =>
        (line.x1 === x && line.y1 === y) ||
        (line.x2 === x && line.y2 === y)
    );
}

// MOVE BALL

function moveBall(x, y) {

    if (gameOver) return;

    const dx = x - ball.x;
    const dy = y - ball.y;

    // Must move to a neighboring point

    if (
        Math.abs(dx) > 1 ||
        Math.abs(dy) > 1 ||
        (dx === 0 && dy === 0)
    ) {
        return;
    }

    // Cannot leave the field

    if (
        x < 0 || x >= COLS ||
        y < 0 || y >= ROWS
    ) {
        return;
    }

    // Cannot use the same line twice

    if (hasLine(ball.x, ball.y, x, y)) {
        return;
    }

    const oldX = ball.x;
    const oldY = ball.y;

    // Check whether destination already had a used line

    const bounce = hasUsedLineAt(x, y);

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

    // Goal!

    if (x === 4 && (y === 0 || y === ROWS - 1)) {

        if (currentPlayer === 1) {
            score1++;
        } else {
            score2++;
        }

        updateScore();

        gameOver = true;

        document.getElementById("turnInfo").textContent =
            "Player " + currentPlayer + " scored!";

        draw();

        setTimeout(() => {
            alert("GOAL! Player " + currentPlayer + " scores!");

            ball = { x: 4, y: 6 };
            lines = [];
            currentPlayer = currentPlayer === 1 ? 2 : 1;

            gameOver = false;

            updateTurn();
            draw();

        }, 300);

        return;
    }

    // Bounce off walls or used paths

    const wall =
        x === 0 ||
        x === COLS - 1 ||
        y === 0 ||
        y === ROWS - 1;

    if (!bounce && !wall) {
        currentPlayer = currentPlayer === 1 ? 2 : 1;
    }

    updateTurn();
    draw();
}

// CLICK ON CANVAS

canvas.addEventListener("click", function(event) {

    const rect = canvas.getBoundingClientRect();

    const mouseX =
        (event.clientX - rect.left) * canvas.width / rect.width;

    const mouseY =
        (event.clientY - rect.top) * canvas.height / rect.height;

    const x = Math.round((mouseX - START_X) / STEP);
    const y = Math.round((mouseY - START_Y) / STEP);

    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) {
        return;
    }

    moveBall(x, y);
});

// UPDATE UI

function updateScore() {
    document.getElementById("score1").textContent = score1;
    document.getElementById("score2").textContent = score2;
}

function updateTurn() {
    document.getElementById("turnInfo").textContent =
        "Player " + currentPlayer + "'s turn";
}
