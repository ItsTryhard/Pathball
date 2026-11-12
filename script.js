
const mainMenu = document.getElementById("mainMenu");
const gameScreen = document.getElementById("gameScreen");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const COLS = 9; // 8 pól szerokości
const ROWS = 11; // 10 pól wysokości

const STEP = 90;
const START_X = 90;
const START_Y = 180;

let ball = { x: 4, y: 5 };
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
    ball = { x: 4, y: 5 };
    currentPlayer = 1;
    score1 = 0;
    score2 = 0;
    lines = [];
    gameOver = false;

    updateScore();
    updateTurn();
    draw();
}

// POSITION

function getPosition(x, y) {
    return {
        x: START_X + x * STEP,
        y: START_Y + y * STEP
    };
}

// DRAWING

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = "#dce9d5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#78916f";
    ctx.lineWidth = 4;

    // Horizontal field lines
    for (let y = 0; y < ROWS; y++) {
        const p1 = getPosition(0, y);
        const p2 = getPosition(COLS - 1, y);

        ctx.beginPath();

        // Leave openings for the goals
        if (y === 0 || y === ROWS - 1) {
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(getPosition(3, y).x, p1.y);

            ctx.moveTo(getPosition(5, y).x, p1.y);
            ctx.lineTo(p2.x, p2.y);
        } else {
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
        }

        ctx.stroke();
    }

    // Vertical field lines
    for (let x = 0; x < COLS; x++) {
        ctx.beginPath();

        const top = getPosition(x, 0);
        const bottom = getPosition(x, ROWS - 1);

        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bottom.x, bottom.y);

        ctx.stroke();
    }

    // Goals: 2 fields wide, 1 field deep
    ctx.strokeStyle = "#527b4a";
    ctx.lineWidth = 7;

    // Top goal
    ctx.beginPath();
    ctx.moveTo(360, 180);
    ctx.lineTo(360, 90);
    ctx.lineTo(540, 90);
    ctx.lineTo(540, 180);
    ctx.stroke();

    // Bottom goal
    ctx.beginPath();
    ctx.moveTo(360, 1080);
    ctx.lineTo(360, 1170);
    ctx.lineTo(540, 1170);
    ctx.lineTo(540, 1080);
    ctx.stroke();

    // Goal background
    ctx.fillStyle = "#a5c99a";
    ctx.fillRect(363, 93, 174, 84);
    ctx.fillRect(363, 1083, 174, 84);

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
        edgeKey(line.x1, line.y1, line.x2, line.y2) === key
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

    if (
        Math.abs(dx) > 1 ||
        Math.abs(dy) > 1 ||
        (dx === 0 && dy === 0)
    ) {
        return;
    }

    if (
        x < 0 || x >= COLS ||
        y < 0 || y >= ROWS
    ) {
        return;
    }

    if (hasLine(ball.x, ball.y, x, y)) {
        return;
    }

    const oldX = ball.x;
    const oldY = ball.y;

    const bounce = hasUsedLineAt(x, y);

    lines.push({
        x1: oldX,
        y1: oldY,
        x2: x,
        y2: y,
        player: currentPlayer
    });

    ball.x = x;
    ball.y = y;

    // Goal
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

        const scorer = currentPlayer;

        setTimeout(() => {
            alert("GOAL! Player " + scorer + " scores!");

            ball = { x: 4, y: 5 };
            lines = [];
            currentPlayer = scorer === 1 ? 2 : 1;

            gameOver = false;

            updateTurn();
            draw();
        }, 300);

        return;
    }

    // Bounce
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
