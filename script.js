
const mainMenu = document.getElementById("mainMenu");
const gameScreen = document.getElementById("gameScreen");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const COLS = 9;       // 8 pól szerokości
const ROWS = 11;      // 10 pól wysokości

const STEP = 90;
const START_X = 90;
const START_Y = 180;

const GOAL_LEFT = 3;
const GOAL_RIGHT = 5;
const GOAL_DEPTH = 1;

const TOP_GOAL_Y = -GOAL_DEPTH;
const BOTTOM_GOAL_Y = ROWS - 1 + GOAL_DEPTH;

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

function isGoalPosition(x, y) {
    return (
        x >= GOAL_LEFT &&
        x <= GOAL_RIGHT &&
        (y === TOP_GOAL_Y || y === BOTTOM_GOAL_Y)
    );
}

function isInsideFieldOrGoal(x, y) {
    if (x < 0 || x >= COLS) return false;

    if (y >= 0 && y < ROWS) return true;

    // Górna bramka
    if (
        y >= TOP_GOAL_Y &&
        y < 0 &&
        x >= GOAL_LEFT &&
        x <= GOAL_RIGHT
    ) {
        return true;
    }

    // Dolna bramka
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

// DRAWING

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#dce9d5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Field lines
    ctx.strokeStyle = "#78916f";
    ctx.lineWidth = 4;

    // Horizontal lines
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

    // Vertical lines
    for (let x = 0; x < COLS; x++) {
        const top = getPosition(x, 0);
        const bottom = getPosition(x, ROWS - 1);

        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bottom.x, bottom.y);
        ctx.stroke();
    }

    // Goal backgrounds
    ctx.fillStyle = "#a5c99a";

    ctx.fillRect(
        GOAL_LEFT * STEP + START_X,
        START_Y - STEP,
        (GOAL_RIGHT - GOAL_LEFT) * STEP,
        STEP
    );

    ctx.fillRect(
        GOAL_LEFT * STEP + START_X,
        START_Y + (ROWS - 1) * STEP,
        (GOAL_RIGHT - GOAL_LEFT) * STEP,
        STEP
    );

    // Goal walls
    ctx.strokeStyle = "#527b4a";
    ctx.lineWidth = 7;

    // Top goal: side walls and back wall
    ctx.beginPath();
    ctx.moveTo(getPosition(GOAL_LEFT, 0).x, START_Y);
    ctx.lineTo(getPosition(GOAL_LEFT, TOP_GOAL_Y).x,
               getPosition(GOAL_LEFT, TOP_GOAL_Y).y);

    ctx.moveTo(getPosition(GOAL_RIGHT, 0).x, START_Y);
    ctx.lineTo(getPosition(GOAL_RIGHT, TOP_GOAL_Y).x,
               getPosition(GOAL_RIGHT, TOP_GOAL_Y).y);

    ctx.moveTo(getPosition(GOAL_LEFT, TOP_GOAL_Y).x,
               getPosition(GOAL_LEFT, TOP_GOAL_Y).y);
    ctx.lineTo(getPosition(GOAL_RIGHT, TOP_GOAL_Y).x,
               getPosition(GOAL_RIGHT, TOP_GOAL_Y).y);
    ctx.stroke();

    // Bottom goal
    ctx.beginPath();
    ctx.moveTo(getPosition(GOAL_LEFT, ROWS - 1).x,
               getPosition(GOAL_LEFT, ROWS - 1).y);
    ctx.lineTo(getPosition(GOAL_LEFT, BOTTOM_GOAL_Y).x,
               getPosition(GOAL_LEFT, BOTTOM_GOAL_Y).y);

    ctx.moveTo(getPosition(GOAL_RIGHT, ROWS - 1).x,
               getPosition(GOAL_RIGHT, ROWS - 1).y);
    ctx.lineTo(getPosition(GOAL_RIGHT, BOTTOM_GOAL_Y).x,
               getPosition(GOAL_RIGHT, BOTTOM_GOAL_Y).y);

    ctx.moveTo(getPosition(GOAL_LEFT, BOTTOM_GOAL_Y).x,
               getPosition(GOAL_LEFT, BOTTOM_GOAL_Y).y);
    ctx.lineTo(getPosition(GOAL_RIGHT, BOTTOM_GOAL_Y).x,
               getPosition(GOAL_RIGHT, BOTTOM_GOAL_Y).y);
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

    // Grid points inside field and goals
    for (let y = TOP_GOAL_Y; y <= BOTTOM_GOAL_Y; y++) {
        for (let x = 0; x < COLS; x++) {
            if (!isInsideFieldOrGoal(x, y)) continue;

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

    ctx.fillStyle = COLORS[currentPlayer];
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

// WALLS

function isWallPosition(x, y) {
    // Left and right field walls
    if (x === 0 || x === COLS - 1) return true;

    // Top and bottom field walls, except goal openings
    if (y === 0 || y === ROWS - 1) {
        return !(x >= GOAL_LEFT && x <= GOAL_RIGHT);
    }

    // Back walls of goals
    if (y === TOP_GOAL_Y || y === BOTTOM_GOAL_Y) {
        return true;
    }

    return false;
}

function isAlongSameWall(oldX, oldY, x, y) {
    // Cannot walk along left wall
    if (oldX === 0 && x === 0) return true;

    // Cannot walk along right wall
    if (oldX === COLS - 1 && x === COLS - 1) return true;

    // Cannot walk along top wall
    if (oldY === 0 && y === 0 &&
        !(oldX >= GOAL_LEFT && oldX <= GOAL_RIGHT &&
          x >= GOAL_LEFT && x <= GOAL_RIGHT)) {
        return true;
    }

    // Cannot walk along bottom wall
    if (oldY === ROWS - 1 && y === ROWS - 1 &&
        !(oldX >= GOAL_LEFT && oldX <= GOAL_RIGHT &&
          x >= GOAL_LEFT && x <= GOAL_RIGHT)) {
        return true;
    }

    // Cannot walk along back wall of goal
    if (
        (oldY === TOP_GOAL_Y && y === TOP_GOAL_Y) ||
        (oldY === BOTTOM_GOAL_Y && y === BOTTOM_GOAL_Y)
    ) {
        return true;
    }

    return false;
}

// MOVE BALL

function moveBall(x, y) {
    if (gameOver) return;

    const dx = x - ball.x;
    const dy = y - ball.y;

    // Only neighboring points
    if (
        Math.abs(dx) > 1 ||
        Math.abs(dy) > 1 ||
        (dx === 0 && dy === 0)
    ) {
        return;
    }

    if (!isInsideFieldOrGoal(x, y)) return;

    // Cannot walk along walls
    if (isAlongSameWall(ball.x, ball.y, x, y)) return;

    // Cannot use the same line twice
    if (hasLine(ball.x, ball.y, x, y)) return;

    const oldX = ball.x;
    const oldY = ball.y;

    const bounce = hasUsedLineAt(x, y) || isWallPosition(x, y);

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

    // GOAL: reached the back wall
    if (isGoalPosition(x, y)) {
        if (currentPlayer === 1) {
            score1++;
        } else {
            score2++;
        }

        updateScore();

        gameOver = true;

        const scorer = currentPlayer;

        document.getElementById("turnInfo").textContent =
            "Player " + scorer + " scored!";

        draw();

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

    // Bounce or change turn
    if (!bounce) {
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

    if (!isInsideFieldOrGoal(x, y)) return;

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
