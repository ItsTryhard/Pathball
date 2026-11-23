// gameover.js - okienko "Game over": kto wygrał, wynik oraz przyciski Rematch i Back to menu.
// Wczytywane przez endGameDialog() w script.js dopiero wtedy, gdy gra się kończy.

(function () {
    const BLUE = "#2563eb";
    const RED = "#ef4444";

    const style = document.createElement("style");
    style.textContent = `
        .gameOverOverlay {
            position: fixed;
            inset: 0;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(8, 13, 24, 0.82);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
        }

        .gameOverCard {
            width: min(100%, 360px);
            padding: 28px 22px 24px;
            text-align: center;
            color: #f8fafc;
            border: 1px solid rgba(148, 163, 184, 0.25);
            border-radius: 24px;
            background: linear-gradient(145deg, rgba(24, 35, 57, 0.96), rgba(11, 18, 32, 0.98));
            box-shadow: 0 32px 90px rgba(0, 0, 0, 0.5);
        }

        .gameOverTitle {
            margin: 0 0 8px;
            color: #93c5fd;
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0.28em;
        }

        .gameOverWinner {
            margin: 4px 0 6px;
            font-size: 32px;
            font-weight: 800;
        }

        .gameOverDetail {
            margin: 0 0 4px;
            color: #a7b3c7;
            font-size: 14px;
        }

        .gameOverScore {
            margin: 10px 0 20px;
            font-size: 20px;
            font-weight: 800;
        }

        .gameOverCard button {
            display: block;
            width: 210px;
            margin: 8px auto 0;
        }

        .gameOverCard .gameOverRematch {
            background: linear-gradient(135deg, #16a34a, #15803d);
        }

        .gameOverCard .gameOverBack {
            border-color: rgba(148, 163, 184, 0.2);
            background: rgba(51, 65, 85, 0.8);
            box-shadow: none;
        }
    `;
    document.head.appendChild(style);

    let overlay = null;

    function winnerText(winner) {
        if (window.bot && window.bot.active) {
            return winner === window.bot.player ? "Bot wins!" : "You win!";
        }
        if (window.online && window.online.active) {
            return winner === window.online.me ? "You win!" : "Your opponent wins!";
        }
        return "Player " + winner + " wins!";
    }

    function colored(text, color) {
        const span = document.createElement("span");
        span.textContent = text;
        span.style.color = color;
        return span;
    }

    window.hideGameOver = function () {
        if (overlay) {
            overlay.remove();
            overlay = null;
        }
    };

    // winner: 1 lub 2, message: krótki opis (np. "GOAL! Player 1 wins the point!"),
    // onRematch: co zrobić po kliknięciu Rematch
    window.showGameOver = function ({ winner, message, score1, score2, onRematch }) {
        window.hideGameOver();

        const title = document.createElement("p");
        title.className = "gameOverTitle";
        title.textContent = "GAME OVER";

        const winnerEl = document.createElement("div");
        winnerEl.className = "gameOverWinner";
        winnerEl.textContent = winnerText(winner);
        winnerEl.style.color = winner === 1 ? BLUE : RED;

        const detail = document.createElement("p");
        detail.className = "gameOverDetail";
        detail.textContent = message || "";

        const score = document.createElement("div");
        score.className = "gameOverScore";
        score.append(colored(String(score1), BLUE), " : ", colored(String(score2), RED));

        const rematch = document.createElement("button");
        rematch.className = "gameOverRematch";
        rematch.textContent = "Rematch";
        rematch.onclick = () => {
            window.hideGameOver();
            onRematch();
        };

        const back = document.createElement("button");
        back.className = "gameOverBack";
        back.textContent = "Back to menu";
        back.onclick = () => {
            window.hideGameOver();
            backToMenu();
        };

        const card = document.createElement("div");
        card.className = "gameOverCard";
        card.append(title, winnerEl, detail, score, rematch, back);

        overlay = document.createElement("div");
        overlay.className = "gameOverOverlay";
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        rematch.focus();
    };
})();
