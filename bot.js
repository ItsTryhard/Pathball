// bot.js - bot: minimax + alfa-beta + iteracyjne pogłębianie, ocena pozycji siecią neuronową.
// Bez pliku weights.json bot używa klasycznej oceny (odległość od własnej i od bramki rywala).
// Obliczenia idą w Web Workerze (plik engine.js, ten sam silnik jest w train.html). Ładuj PO script.js.

(function () {
    // ===== Silnik w osobnym pliku (Web Worker) =====
    const worker = new Worker("engine.js?v=" + Date.now());
    window.botWorker = worker;

    worker.onerror = function (e) {
        console.warn("Bot worker error:", e.message);
    };

    worker.onmessage = function (e) {
        if (e.data.type !== "move") return;
        if (e.data.id !== bot.requestId || !bot.active) return;   // przestarzała odpowiedź
        bot.lastDepth = e.data.depth;
        bot.readyMove = e.data.move;
        bot.tryPlay(e.data.id);
    };

    // Wagi sieci: weights.json z repo, a przy adresie ...?net=local wagi zapisane przez train.html
    async function loadWeights() {
        if (window.PATHBALL_TRAINER) return;
        try {
            let json = null;
            if (location.search.indexOf("net=local") !== -1) {
                json = JSON.parse(localStorage.getItem("pathballNet"));
            } else {
                const r = await fetch("weights.json", { cache: "no-cache" });
                if (r.ok) json = await r.json();
            }
            if (json) worker.postMessage({ type: "setWeights", weights: json });
        } catch (err) {
            // brak wag = klasyczna ocena
        }
    }
    loadWeights();

    // ===== Strona główna =====
    const bot = {
        active: false,
        player: 2,                      // bot gra jako gracz 2 (czerwony)
        timeLimit: BALL_MOVE_DURATION,  // limit czasu na ruch w ms (tyle co animacja)
        tolerance: 0.3,                 // losowość wśród ruchów o prawie równej ocenie
        useNN: true,                    // false = zawsze klasyczna ocena
        lastDepth: 0,                   // do podglądu: jak głęboko bot doszedł w ostatnim ruchu
        requestId: 0,
        readyMove: null,
        timer: null,

        start() {
            this.active = true;
        },

        stop() {
            this.active = false;
            this.requestId++;
            this.readyMove = null;
            clearTimeout(this.timer);
        },

        // Wywoływane z updateTurn(), czyli tuż po ruchu przeciwnika
        // (animacja dopiero się zaczyna). Bot od razu zaczyna liczyć w workerze.
        onTurn() {
            if (!this.active || gameOver || currentPlayer !== this.player) return;

            clearTimeout(this.timer);
            this.readyMove = null;
            const id = ++this.requestId;

            worker.postMessage({
                type: "move",
                id: id,
                ball: { x: ball.x, y: ball.y },
                lines: lines.map(l => ({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 })),
                currentPlayer: currentPlayer,
                player: this.player,
                timeLimit: this.timeLimit,
                tolerance: this.tolerance,
                useNN: this.useNN
            });
        },

        // Gra ruch dopiero, gdy ruch jest policzony i animacja się skończyła
        tryPlay(id) {
            if (
                id !== this.requestId || !this.active || gameOver ||
                currentPlayer !== this.player || !this.readyMove
            ) return;

            if (ballAnimation) {
                this.timer = setTimeout(() => this.tryPlay(id), 10);
                return;
            }

            const move = this.readyMove;
            this.readyMove = null;
            moveBall(move.x, move.y);
        }
    };

    window.bot = bot;
})();

