// bot.js - bot Minimax + alfa-beta z iteracyjnym pogłębianiem i limitem czasu.
// Obliczenia idą w Web Workerze, równolegle z animacją piłki,
// więc bot rusza dokładnie wtedy, gdy animacja się kończy.
// Ładuj PO script.js (korzysta z jego funkcji i stałych).

(function () {
    // ===== Kod wykonywany w Web Workerze =====
    function workerMain() {
        const N = (ROWS + 2) * COLS;               // punkty z y od -1 do ROWS
        const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
        const OFF = DIRS.map(([dx, dy]) => dy * COLS + dx);
        const WIN = 10000;
        const MAX_DEPTH = 30;                      // zabezpieczenie, gdy pozycja jest prosta
        const idx = (x, y) => (y + 1) * COLS + x;
        const gx = (COLS - 1) / 2;

        // Tablice wyliczone raz na starcie, żeby przeszukiwanie było szybkie
        const allowed = new Uint8Array(N * 8);     // czy ruch w kierunku d jest geometrycznie dozwolony
        const wallPt = new Uint8Array(N);          // czy punkt jest na ścianie (odbicie)
        const goalPt = new Uint8Array(N);          // kto wygrywa po wejściu tu: 1 = górna bramka, 2 = dolna
        const evalT = { 1: new Float64Array(N), 2: new Float64Array(N) };

        for (let y = TOP_GOAL_Y; y <= BOTTOM_GOAL_Y; y++) {
            for (let x = 0; x < COLS; x++) {
                if (!isInsideFieldOrGoal(x, y)) continue;
                const i = idx(x, y);

                wallPt[i] = isWallPosition(x, y) ? 1 : 0;
                if (isGoalPosition(x, y)) goalPt[i] = y === TOP_GOAL_Y ? 1 : 2;

                for (let d = 0; d < 8; d++) {
                    const nx = x + DIRS[d][0];
                    const ny = y + DIRS[d][1];
                    if (
                        isInsideFieldOrGoal(nx, ny) &&
                        !isGoalBackCorner(nx, ny) &&
                        !isAlongSameWall(x, y, nx, ny)
                    ) {
                        allowed[i * 8 + d] = 1;
                    }
                }

                // Funkcja oceniająca: odległość od własnej bramki minus odległość od bramki rywala.
                // Gracz 1 broni dolnej bramki, a strzela w górną; gracz 2 odwrotnie.
                const dTop = Math.hypot(x - gx, y - TOP_GOAL_Y);
                const dBottom = Math.hypot(x - gx, y - BOTTOM_GOAL_Y);
                evalT[1][i] = dBottom - dTop;
                evalT[2][i] = dTop - dBottom;
            }
        }

        const used = new Uint8Array(N * 8);        // użyte krawędzie (zapisane z obu stron)
        const touched = new Uint8Array(N);         // ile użytych linii dotyka punktu
        const bufD = [];
        const bufS = [];
        for (let i = 0; i <= MAX_DEPTH; i++) {
            bufD.push(new Int8Array(8));
            bufS.push(new Float64Array(8));
        }

        let botP = 2;
        let ev = evalT[2];
        let nodes = 0;
        let deadline = 0;
        let timedOut = false;
        let lastDepth = 0;

        // Minimax z alfa-beta. Wynik zawsze z punktu widzenia bota.
        // Uwaga: po odbiciu ten sam gracz rusza się dalej, więc tury nie muszą się przeplatać.
        function search(pos, player, depth, alpha, beta) {
            // Co 1024 węzły sprawdzamy czas
            if ((++nodes & 1023) === 0 && performance.now() > deadline) timedOut = true;
            if (timedOut) return 0;

            const maximizing = player === botP;
            const base = pos * 8;
            const dirs = bufD[depth];
            const sc = bufS[depth];
            let n = 0;

            // Generowanie ruchów, posortowanych od najlepszego (lepsze odcięcia)
            for (let d = 0; d < 8; d++) {
                if (!allowed[base + d] || used[base + d]) continue;
                const dest = pos + OFF[d];
                const g = goalPt[dest];
                const s = g
                    ? (g === player ? 1e6 : -1e6)
                    : (maximizing ? ev[dest] : -ev[dest]);

                let j = n++;
                while (j > 0 && sc[j - 1] < s) {
                    sc[j] = sc[j - 1];
                    dirs[j] = dirs[j - 1];
                    j--;
                }
                sc[j] = s;
                dirs[j] = d;
            }

            // Brak ruchów = gracz na ruchu przegrywa punkt
            if (n === 0) return maximizing ? -(WIN + depth) : WIN + depth;

            let best = maximizing ? -Infinity : Infinity;

            for (let k = 0; k < n; k++) {
                const d = dirs[k];
                const dest = pos + OFF[d];
                const g = goalPt[dest];
                let score;

                if (g) {
                    // gol: im szybciej, tym lepiej (większy depth = szybciej)
                    score = g === botP ? WIN + depth : -(WIN + depth);
                } else {
                    const bounce = touched[dest] > 0 || wallPt[dest] === 1;

                    used[base + d] = 1;
                    used[dest * 8 + 7 - d] = 1;
                    touched[pos]++;
                    touched[dest]++;

                    score = depth === 1
                        ? ev[dest]
                        : search(dest, bounce ? player : 3 - player, depth - 1, alpha, beta);

                    used[base + d] = 0;
                    used[dest * 8 + 7 - d] = 0;
                    touched[pos]--;
                    touched[dest]--;

                    if (timedOut) return 0;
                }

                if (maximizing) {
                    if (score > best) best = score;
                    if (best > alpha) alpha = best;
                } else {
                    if (score < best) best = score;
                    if (best < beta) beta = best;
                }

                if (alpha >= beta) break;
            }

            return best;
        }

        // Iteracyjne pogłębianie: głębokość 1, 2, 3... aż skończy się czas.
        // Używamy wyniku ostatniej w pełni ukończonej głębokości.
        function findBestMove(s) {
            used.fill(0);
            touched.fill(0);

            for (const l of s.lines) {
                const a = idx(l.x1, l.y1);
                const b = idx(l.x2, l.y2);
                const d = DIRS.findIndex(v => v[0] === l.x2 - l.x1 && v[1] === l.y2 - l.y1);
                used[a * 8 + d] = 1;
                used[b * 8 + 7 - d] = 1;
                touched[a]++;
                touched[b]++;
            }

            botP = s.player;
            ev = evalT[botP];

            const pos = idx(s.ball.x, s.ball.y);
            const player = s.currentPlayer;
            const tol = Math.max(s.tolerance, 1e-6);

            // Legalne ruchy z korzenia; na start posortowane heurystyką
            let order = [];
            for (let d = 0; d < 8; d++) {
                if (allowed[pos * 8 + d] && !used[pos * 8 + d]) order.push(d);
            }
            if (order.length === 0) return null;
            order.sort((a, b) => ev[pos + OFF[b]] - ev[pos + OFF[a]]);

            nodes = 0;
            timedOut = false;
            deadline = performance.now() + s.timeLimit;
            let chosen = order[0];
            lastDepth = 0;

            for (let depth = 1; depth <= MAX_DEPTH; depth++) {
                const results = [];
                let best = -Infinity;

                // Ruchy z korzenia sprawdzamy osobno, z oknem poszerzonym o tolerancję,
                // żeby poznać dokładne oceny wszystkich ruchów bliskich najlepszemu.
                for (const d of order) {
                    const dest = pos + OFF[d];
                    const g = goalPt[dest];
                    let score;

                    if (g) {
                        score = g === botP ? WIN + depth : -(WIN + depth);
                    } else {
                        const bounce = touched[dest] > 0 || wallPt[dest] === 1;

                        used[pos * 8 + d] = 1;
                        used[dest * 8 + 7 - d] = 1;
                        touched[pos]++;
                        touched[dest]++;

                        score = depth === 1
                            ? ev[dest]
                            : search(dest, bounce ? player : 3 - player, depth - 1, best - tol, Infinity);

                        used[pos * 8 + d] = 0;
                        used[dest * 8 + 7 - d] = 0;
                        touched[pos]--;
                        touched[dest]--;
                    }

                    if (timedOut) break;

                    results.push({ d, score });
                    if (score > best) best = score;
                }

                if (timedOut) break;   // ta głębokość nieukończona - zostaje poprzedni wynik

                // Losowy wybór spośród ruchów o ocenie prawie równej najlepszej
                const good = results.filter(r => r.score > best - tol);
                chosen = good[Math.floor(Math.random() * good.length)].d;
                lastDepth = depth;

                // Następna głębokość zaczyna od najlepszych ruchów (więcej odcięć)
                results.sort((a, b) => b.score - a.score);
                order = results.map(r => r.d);

                // Znaleziono wymuszoną wygraną lub przegraną - głębiej nie ma sensu
                if (Math.abs(best) >= WIN) break;
            }

            return { x: s.ball.x + DIRS[chosen][0], y: s.ball.y + DIRS[chosen][1] };
        }

        self.onmessage = function (e) {
            const s = e.data;
            const move = findBestMove(s);
            self.postMessage({ id: s.id, move: move, depth: lastDepth });
        };
    }

    // ===== Uruchomienie workera (kod i geometria boiska brane prosto z script.js) =====
    const preamble = [
        "const COLS=" + COLS + ", ROWS=" + ROWS +
            ", GOAL_LEFT=" + GOAL_LEFT + ", GOAL_RIGHT=" + GOAL_RIGHT +
            ", TOP_GOAL_Y=" + TOP_GOAL_Y + ", BOTTOM_GOAL_Y=" + BOTTOM_GOAL_Y + ";",
        isInsideFieldOrGoal.toString(),
        isGoalBackCorner.toString(),
        isAlongSameWall.toString(),
        isWallPosition.toString(),
        isGoalPosition.toString()
    ].join("\n");

    const blob = new Blob([preamble, "\n(", workerMain.toString(), ")();"], {
        type: "text/javascript"
    });
    const worker = new Worker(URL.createObjectURL(blob));

    worker.onerror = function (e) {
        console.warn("Bot worker error:", e.message);
    };

    worker.onmessage = function (e) {
        if (e.data.id !== bot.requestId || !bot.active) return;   // przestarzała odpowiedź
        bot.lastDepth = e.data.depth;
        bot.readyMove = e.data.move;
        bot.tryPlay(e.data.id);
    };

    // ===== Strona główna =====
    const bot = {
        active: false,
        player: 2,                      // bot gra jako gracz 2 (czerwony)
        timeLimit: BALL_MOVE_DURATION,  // limit czasu na ruch w ms (tyle co animacja)
        tolerance: 0.3,                 // losowość: 0 = prawie zawsze ten sam ruch, więcej = bardziej losowy i słabszy
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
                id: id,
                ball: { x: ball.x, y: ball.y },
                lines: lines.map(l => ({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 })),
                currentPlayer: currentPlayer,
                player: this.player,
                timeLimit: this.timeLimit,
                tolerance: this.tolerance
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
