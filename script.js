
const mainMenu = document.getElementById("mainMenu");
const gameScreen = document.getElementById("gameScreen");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const COLS = 9;
const ROWS = 11;

const STEP = 90;
const START_X = 90;
const START_Y = 180;
const BALL_MOVE_DURATION = 300;

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
let visitedPoints = new Map();
let gameOver = false;
let ballAnimation = null;

const COLORS = {
    1: "#2563eb",
    2: "#ef4444"
};

// BACKGROUND

function updateBackground() {
    document.body.style.transition =
        `background-color ${BALL_MOVE_DURATION}ms ease`;

    document.body.style.backgroundColor = COLORS[currentPlayer];
}

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
    ballAnimation = null;
    ball = { x: 4, y: 5 };
    currentPlayer = 1;

    score1 = 0;
    score2 = 0;

    lines = [];
    visitedPoints = new Map([[`${ball.x},${ball.y}`, currentPlayer]]);
    gameOver = false;

    updateScore();
    updateTurn();
    updateBackground();
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

// DRAWING

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#dce9d5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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

    // Highlight legal destinations for the current player
    getLegalMoves().forEach(({ x, y }) => {
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

    setTimeout(() => {
        alert(message);

        ball = { x: 4, y: 5 };
        lines = [];
        ballAnimation = null;
        currentPlayer = currentPlayer === 1 ? 2 : 1;

        visitedPoints = new Map([[`${ball.x},${ball.y}`, currentPlayer]]);

        updateBackground();
        gameOver = false;

        updateTurn();
        draw();
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
Y && y === TOP_GOAL_Y) ||
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

    setTimeout(() => {
        alert(message);

        ball = { x: 4, y: 5 };
        lines = [];
        ballAnimation = null;
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        visitedPoints = new Map([[`${ball.x},${ball.y}`, currentPlayer]]);
        gameOver = false;

        updateTurn();
        draw();
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
