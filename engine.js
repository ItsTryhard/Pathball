// engine.js - Web Worker: silnik bota (przeszukiwanie + sieć neuronowa) i trening przez self-play.
// Używany przez bot.js (gra z botem) i train.html (trening).
// UWAGA: stałe i funkcje geometrii boiska poniżej muszą zgadzać się z script.js.

const COLS = 9;
const ROWS = 11;
const GOAL_LEFT = 3;
const GOAL_RIGHT = 5;
const GOAL_DEPTH = 1;
const TOP_GOAL_Y = -GOAL_DEPTH;
const BOTTOM_GOAL_Y = ROWS - 1 + GOAL_DEPTH;

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

const N = (ROWS + 2) * COLS;               // punkty z y od -1 do ROWS
const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const OFF = DIRS.map(([dx, dy]) => dy * COLS + dx);
const MIRROR = [5, 6, 7, 3, 4, 0, 1, 2];   // odbicie kierunku w pionie
const WIN = 10000;
const MAX_DEPTH = 30;
const idx = (x, y) => (y + 1) * COLS + x;
const gx = (COLS - 1) / 2;
const START = idx(4, 5);

// Tablice wyliczone raz na starcie
const allowed = new Uint8Array(N * 8);     // czy ruch w kierunku d jest geometrycznie dozwolony
const wallPt = new Uint8Array(N);          // czy punkt leży na ścianie (odbicie)
const goalPt = new Uint8Array(N);          // kto wygrywa po wejściu tu: 1 = górna bramka, 2 = dolna
const evalT = { 1: new Float64Array(N), 2: new Float64Array(N) };   // stara ocena (linia prosta), też do sortowania ruchów
const goalIdx = { 1: 0, 2: 0 };            // indeks punktu bramki: 1 = górna, 2 = dolna

for (let y = TOP_GOAL_Y; y <= BOTTOM_GOAL_Y; y++) {
    for (let x = 0; x < COLS; x++) {
        if (!isInsideFieldOrGoal(x, y)) continue;
        const i = idx(x, y);

        wallPt[i] = isWallPosition(x, y) ? 1 : 0;
        if (isGoalPosition(x, y)) {
            goalPt[i] = y === TOP_GOAL_Y ? 1 : 2;
            goalIdx[goalPt[i]] = i;
        }

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

        // Klasyczna ocena: odległość od własnej bramki minus odległość od bramki rywala.
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

// ===== Klasyczna ocena oparta na najkrótszych trasach do bramek =====
// Odległość liczona po wolnych krawędziach (BFS od bramki wstecz), więc uwzględnia ściany,
// słupki i linie już narysowane. Bramka zabudowana liniami jest nieosiągalna (odległość = CAP),
// więc bot przestaje być do niej "ciągnięty" i nie pcha piłki w zamurowane pułapki.
const CAP = 30;
let classicMode = "paths";                 // "paths" = nowa ocena, "euclid" = stara (linia prosta)
const distTop = new Int16Array(N);
const distBottom = new Int16Array(N);
const bfsQueue = new Int16Array(N);
let dOwnArr = distTop;
let dOppArr = distBottom;

function bfs(src, dist) {
    dist.fill(-1);
    let head = 0;
    let tail = 0;
    dist[src] = 0;
    bfsQueue[tail++] = src;

    while (head < tail) {
        const u = bfsQueue[head++];
        const du = dist[u] + 1;

        for (let d = 0; d < 8; d++) {
            const v = u - OFF[d];                      // punkt, z którego ruch w kierunku d prowadzi do u
            if (v < 0 || v >= N) continue;
            if (!allowed[v * 8 + d] || used[v * 8 + d]) continue;
            if (dist[v] >= 0) continue;
            if (goalPt[v]) continue;                   // przez drugą bramkę nie da się przejść
            dist[v] = du;
            bfsQueue[tail++] = v;
        }
    }

    for (let i = 0; i < N; i++) {
        if (dist[i] < 0) dist[i] = CAP;                // nieosiągalne
    }
}

// Liczone raz na ruch, z linii istniejących w momencie ruchu (przed przeszukiwaniem).
function computePathFields() {
    bfs(goalIdx[1], distTop);
    bfs(goalIdx[2], distBottom);
    // gracz 1 broni dolnej bramki, a strzela w górną; gracz 2 odwrotnie
    dOwnArr = botP === 2 ? distTop : distBottom;
    dOppArr = botP === 2 ? distBottom : distTop;
}

let botP = 2;                              // gracz, z którego punktu widzenia liczymy oceny
let ev = evalT[2];
let nodes = 0;
let deadline = 0;
let timedOut = false;
let lastDepth = 0;

// ===== Sieć neuronowa =====
// Wejście: 23 cechy pozycji (patrz computeFeatures), 1 warstwa ukryta (tanh),
// wyjście tanh = przewidywany wynik punktu dla gracza "me" (+1 wygrana, -1 przegrana).
// Dodatkowe połączenie wejście -> wyjście (ws) na starcie odtwarza klasyczną ocenę,
// więc nieuczona sieć gra mniej więcej jak klasyczny bot.
const F = 23;
const H = 16;
const NN_SCALE = 10;
const feat = new Float64Array(F);
const hid = new Float64Array(H);
let net = null;
let useNN = false;

function newNet() {
    const n = {
        w1: new Float64Array(F * H),
        b1: new Float64Array(H),
        w2: new Float64Array(H),
        ws: new Float64Array(F),
        b2: 0
    };
    for (let i = 0; i < F * H; i++) n.w1[i] = (Math.random() - 0.5) * 0.2;
    for (let j = 0; j < H; j++) n.w2[j] = (Math.random() - 0.5) * 0.2;
    n.ws[4] = 2.0;
    return n;
}

function serializeNet() {
    return {
        F, H,
        w1: Array.from(net.w1), b1: Array.from(net.b1), w2: Array.from(net.w2),
        ws: Array.from(net.ws), b2: net.b2
    };
}

function netFromJSON(j) {
    if (!j || j.F !== F || j.H !== H) return null;
    if (j.w1.length !== F * H || j.b1.length !== H || j.w2.length !== H || j.ws.length !== F) return null;
    return {
        w1: Float64Array.from(j.w1), b1: Float64Array.from(j.b1), w2: Float64Array.from(j.w2),
        ws: Float64Array.from(j.ws), b2: j.b2
    };
}

// Cechy pozycji z punktu widzenia gracza "me"; toMove = kto teraz ma ruch.
// Dla gracza 1 plansza jest odbita w pionie, więc "do przodu" znaczy to samo dla obu graczy.
function computeFeatures(pos, me, toMove) {
    const x = pos % COLS;
    const y = Math.floor(pos / COLS) - 1;
    const fy = me === 2 ? y : ROWS - 1 - y;
    const dTop = Math.hypot(x - gx, y - TOP_GOAL_Y);
    const dBottom = Math.hypot(x - gx, y - BOTTOM_GOAL_Y);
    const own = me === 2 ? dTop : dBottom;
    const opp = me === 2 ? dBottom : dTop;

    feat[0] = (x - gx) / gx;
    feat[1] = (fy - 5) / 6;
    feat[2] = own / 12;
    feat[3] = opp / 12;
    feat[4] = (own - opp) / 12;

    let free = 0;
    for (let k = 0; k < 8; k++) {
        const d = me === 2 ? k : MIRROR[k];
        const b = pos * 8 + d;
        if (allowed[b] && !used[b]) {
            free++;
            feat[5 + k] = 1;                                   // ruch w tym kierunku możliwy
            const nb = pos + OFF[d];
            feat[13 + k] = (touched[nb] > 0 || wallPt[nb] === 1) ? 1 : 0;   // ruch zakończy się odbiciem
        } else {
            feat[5 + k] = 0;
            feat[13 + k] = 0;
        }
    }
    feat[21] = free / 8;
    feat[22] = toMove === me ? 1 : 0;
}

function forward(n) {
    let pre = n.b2;
    for (let i = 0; i < F; i++) pre += n.ws[i] * feat[i];
    for (let j = 0; j < H; j++) {
        let s = n.b1[j];
        const o = j * F;
        for (let i = 0; i < F; i++) s += n.w1[o + i] * feat[i];
        hid[j] = Math.tanh(s);
        pre += n.w2[j] * hid[j];
    }
    return Math.tanh(pre);
}

// Jeden krok spadku gradientowego (SGD) dla cech z `feat`
function trainStep(target, lr) {
    const out = forward(net);
    const err = out - target;
    const dpre = err * (1 - out * out);

    net.b2 -= lr * dpre;
    for (let i = 0; i < F; i++) net.ws[i] -= lr * dpre * feat[i];
    for (let j = 0; j < H; j++) {
        const dh = dpre * net.w2[j] * (1 - hid[j] * hid[j]);
        net.w2[j] -= lr * dpre * hid[j];
        net.b1[j] -= lr * dh;
        const o = j * F;
        for (let i = 0; i < F; i++) net.w1[o + i] -= lr * dh * feat[i];
    }
    return err * err;
}

// Ocena liścia drzewa z punktu widzenia botP
// Nowa klasyczna ocena liścia (z punktu widzenia botP; p = punkt piłki, next = kto ma ruch):
//  1) różnica najkrótszych tras: odległość od własnej bramki minus odległość od bramki rywala
//     (zabudowana bramka = brak "nagrody" za zbliżanie się do niej),
//  2) pułapki: mało wolnych wyjść jest groźne dla gracza, który ma teraz ruch,
//  3) mała przewaga dla strony, która ma ruch.
function pathsEval(p, next) {
    const base = p * 8;
    let m = 0;
    for (let d = 0; d < 8; d++) {
        if (allowed[base + d] && !used[base + d]) m++;
    }

    // Gracz na ruchu bez ruchów przegrywa punkt
    if (m === 0) return next === botP ? -WIN / 2 : WIN / 2;

    let score = Math.min(dOwnArr[p], CAP) - Math.min(dOppArr[p], CAP);

    if (m <= 2) {
        let safe = 0;                              // wyjścia, które nie prowadzą w ślepy zaułek
        for (let d = 0; d < 8; d++) {
            if (!allowed[base + d] || used[base + d]) continue;
            const dest = p + OFF[d];
            if (goalPt[dest]) { safe++; continue; }
            const nb = dest * 8;
            const back = 7 - d;
            for (let k = 0; k < 8; k++) {
                if (k !== back && allowed[nb + k] && !used[nb + k]) { safe++; break; }
            }
        }
        const danger = safe === 0 ? 6 : (m === 1 ? 3 : 1.5);
        score += next === botP ? -danger : danger;
    }

    return score + (next === botP ? 0.5 : -0.5);
}

// Ocena liścia drzewa z punktu widzenia botP
function leafEval(dest, next) {
    if (useNN && net) {
        computeFeatures(dest, botP, next);
        return NN_SCALE * forward(net);
    }
    if (classicMode === "paths") return pathsEval(dest, next);
    return ev[dest];
}

// ===== Przeszukiwanie =====
// Minimax z alfa-beta. Wynik zawsze z punktu widzenia botP.
// Uwaga: po odbiciu ten sam gracz rusza się dalej, więc tury nie muszą się przeplatać.
function search(pos, player, depth, alpha, beta) {
    if ((++nodes & 1023) === 0 && performance.now() > deadline) timedOut = true;
    if (timedOut) return 0;

    const maximizing = player === botP;
    const base = pos * 8;
    const dirs = bufD[depth];
    const sc = bufS[depth];
    let n = 0;

    // Ruchy posortowane od najlepszego (klasyczna ocena) dla lepszych odcięć
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
            score = g === botP ? WIN + depth : -(WIN + depth);
        } else {
            const bounce = touched[dest] > 0 || wallPt[dest] === 1;
            const next = bounce ? player : 3 - player;

            used[base + d] = 1;
            used[dest * 8 + 7 - d] = 1;
            touched[pos]++;
            touched[dest]++;

            score = depth === 1
                ? leafEval(dest, next)
                : search(dest, next, depth - 1, alpha, beta);

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

function loadState(lines) {
    used.fill(0);
    touched.fill(0);
    for (const l of lines) {
        const a = idx(l.x1, l.y1);
        const b = idx(l.x2, l.y2);
        const d = DIRS.findIndex(v => v[0] === l.x2 - l.x1 && v[1] === l.y2 - l.y1);
        used[a * 8 + d] = 1;
        used[b * 8 + 7 - d] = 1;
        touched[a]++;
        touched[b]++;
    }
}

function legalDirs(pos) {
    const out = [];
    for (let d = 0; d < 8; d++) {
        if (allowed[pos * 8 + d] && !used[pos * 8 + d]) out.push(d);
    }
    return out;
}

// Przeszukanie ruchów z korzenia na jednej głębokości.
// Okno poszerzone o tolerancję daje dokładne oceny ruchów bliskich najlepszemu.
function searchRoot(pos, player, depth, order, tol) {
    const results = [];
    let best = -Infinity;

    for (const d of order) {
        const dest = pos + OFF[d];
        const g = goalPt[dest];
        let score;

        if (g) {
            score = g === botP ? WIN + depth : -(WIN + depth);
        } else {
            const bounce = touched[dest] > 0 || wallPt[dest] === 1;
            const next = bounce ? player : 3 - player;

            used[pos * 8 + d] = 1;
            used[dest * 8 + 7 - d] = 1;
            touched[pos]++;
            touched[dest]++;

            score = depth === 1
                ? leafEval(dest, next)
                : search(dest, next, depth - 1, best - tol, Infinity);

            used[pos * 8 + d] = 0;
            used[dest * 8 + 7 - d] = 0;
            touched[pos]--;
            touched[dest]--;
        }

        if (timedOut) return null;

        results.push({ d, score });
        if (score > best) best = score;
    }

    return { results, best };
}

// Losowy wybór spośród ruchów o ocenie prawie równej najlepszej
function pickRandom(r, tol) {
    const good = r.results.filter(x => x.score > r.best - tol);
    return good[Math.floor(Math.random() * good.length)].d;
}

// Iteracyjne pogłębianie: głębokość 1, 2, 3... aż skończy się czas.
// Używamy wyniku ostatniej w pełni ukończonej głębokości. Zwraca kierunek ruchu (-1 = brak ruchów).
// Przed wywołaniem trzeba ustawić botP, ev i useNN.
function iterate(pos, player, timeMs, tolerance) {
    const tol = Math.max(tolerance, 1e-6);
    if (!useNN && classicMode === "paths") computePathFields();

    let order = legalDirs(pos);
    if (order.length === 0) return -1;
    order.sort((a, b) => ev[pos + OFF[b]] - ev[pos + OFF[a]]);

    nodes = 0;
    timedOut = false;
    deadline = performance.now() + timeMs;
    let chosen = order[0];
    lastDepth = 0;

    for (let depth = 1; depth <= MAX_DEPTH; depth++) {
        const r = searchRoot(pos, player, depth, order, tol);
        if (!r) break;                      // ta głębokość nieukończona - zostaje poprzedni wynik

        chosen = pickRandom(r, tol);
        lastDepth = depth;

        r.results.sort((a, b) => b.score - a.score);
        order = r.results.map(x => x.d);    // następna głębokość zaczyna od najlepszych

        if (Math.abs(r.best) >= WIN) break; // wymuszona wygrana lub przegrana
    }

    return chosen;
}

function findBestMove(s) {
    loadState(s.lines);
    botP = s.player;
    ev = evalT[botP];
    useNN = Boolean(net) && s.useNN !== false;
    classicMode = s.classic || classicMode;

    const d = iterate(idx(s.ball.x, s.ball.y), s.currentPlayer, s.timeLimit, s.tolerance);
    if (d < 0) return null;
    return { x: s.ball.x + DIRS[d][0], y: s.ball.y + DIRS[d][1] };
}

// ===== Symulacja gier i trening (self-play) =====
function step(st, d) {
    const pos = st.pos;
    const dest = pos + OFF[d];
    const g = goalPt[dest];
    const bounce = touched[dest] > 0 || wallPt[dest] === 1;

    used[pos * 8 + d] = 1;
    used[dest * 8 + 7 - d] = 1;
    touched[pos]++;
    touched[dest]++;
    st.pos = dest;

    if (g) return g;
    if (!bounce) st.player = 3 - st.player;
    if (legalDirs(dest).length === 0) return 3 - st.player;
    return 0;
}

function chooseMoveFixed(pos, player, depth, tol) {
    botP = player;
    ev = evalT[player];
    timedOut = false;
    deadline = Infinity;
    nodes = 0;

    if (!useNN && classicMode === "paths") computePathFields();

    const order = legalDirs(pos);
    order.sort((a, b) => ev[pos + OFF[b]] - ev[pos + OFF[a]]);
    return pickRandom(searchRoot(pos, player, depth, order, tol), tol);
}

// opts: depth (stała głębokość) albo timeMs > 0 (iteracyjne pogłębianie z limitem czasu na ruch),
//       eps (szansa losowego ruchu), tol, opening (liczba losowych otwierających ruchów),
//       nn {1: bool, 2: bool} (kto używa sieci), record (zapisuj pozycje do nauki)
function playGame(opts) {
    used.fill(0);
    touched.fill(0);
    const st = { pos: START, player: 1 };
    const rec = [];
    let winner = 0;
    let plies = 0;

    while (!winner && plies < 300) {
        const p = st.player;
        useNN = Boolean(opts.nn[p]) && Boolean(net);
        if (opts.classic) classicMode = opts.classic[p];

        if (opts.record) {
            computeFeatures(st.pos, 1, p);
            const f1 = Float64Array.from(feat);
            computeFeatures(st.pos, 2, p);
            rec.push({ f1, f2: Float64Array.from(feat) });
        }

        let d;
        if (plies < opts.opening || Math.random() < opts.eps) {
            const dirs = legalDirs(st.pos);
            d = dirs[Math.floor(Math.random() * dirs.length)];
        } else if (opts.timeMs > 0) {
            botP = p;
            ev = evalT[p];
            d = iterate(st.pos, p, opts.timeMs, opts.tol);
        } else {
            d = chooseMoveFixed(st.pos, p, opts.depth, opts.tol);
        }

        winner = step(st, d);
        plies++;
    }

    return { winner, plies, rec };
}

// Bufor powtórek: uczymy się na losowych pozycjach z ostatnich gier, a nie tylko z najnowszej.
// Dzięki temu nauka jest spokojniejsza i mniej "skacze".
const REPLAY_MAX = 30000;
let replay = [];

// Cel nauki: wynik punktu (+1/-1/0) dla każdej pozycji z obu perspektyw,
// z lekkim tłumieniem dla pozycji odległych od końca.
function addToReplay(rec, winner) {
    for (let i = 0; i < rec.length; i++) {
        const disc = Math.pow(0.98, rec.length - i);
        for (let me = 1; me <= 2; me++) {
            const z = winner === 0 ? 0 : (winner === me ? 1 : -1);
            replay.push({ f: me === 1 ? rec[i].f1 : rec[i].f2, t: z * disc });
        }
    }
    if (replay.length > REPLAY_MAX + 3000) replay = replay.slice(-REPLAY_MAX);
}

function learnFromReplay(updates, lr) {
    let loss = 0;
    for (let u = 0; u < updates; u++) {
        const s = replay[Math.floor(Math.random() * replay.length)];
        feat.set(s.f);
        loss += trainStep(s.t, lr);
    }
    return loss / Math.max(updates, 1);
}

// Mecz aktualnej sieci z klasycznym botem (bez sieci), na zmianę jako gracz 1 i 2.
// Zwraca ułamek punktów (remis = 0,5). timeMs > 0: gra z limitem czasu jak w prawdziwej grze.
function runEval(games, depth, timeMs) {
    let score = 0;
    for (let g = 0; g < games; g++) {
        const nnSide = g % 2 === 0 ? 1 : 2;
        const r = playGame({
            depth, timeMs, eps: 0, tol: 0.3, opening: 2, record: false,
            nn: { 1: nnSide === 1, 2: nnSide === 2 }
        });
        score += r.winner === 0 ? 0.5 : (r.winner === nnSide ? 1 : 0);
    }
    return score / games;
}

// Nowa klasyczna ocena kontra stara (linia prosta), na zmianę jako gracz 1 i 2.
function runArena(games, depth, timeMs) {
    const keep = classicMode;
    let score = 0;
    for (let g = 0; g < games; g++) {
        const newSide = g % 2 === 0 ? 1 : 2;
        const r = playGame({
            depth, timeMs, eps: 0, tol: 0.3, opening: 2, record: false,
            nn: { 1: false, 2: false },
            classic: { [newSide]: "paths", [3 - newSide]: "euclid" }
        });
        score += r.winner === 0 ? 0.5 : (r.winner === newSide ? 1 : 0);
    }
    classicMode = keep;
    return score / games;
}

// Przybliżony przedział ufności 95% (połowa szerokości) dla wyniku p z n gier
function ci95(p, n) {
    return 1.96 * Math.sqrt(Math.max(p * (1 - p), 0.05) / n);
}

let training = false;
let tcfg = null;
let stats = null;
let bestScore = -1;

// Sprawdza siłę sieci. Jeśli wynik przebija dotychczasowy rekord, mecz jest powtarzany
// i dopiero średnia z obu meczów może zostać nowym rekordem (mniej "szczęśliwych" wyników).
function evaluateAndMaybePromote() {
    const n = tcfg.evalGames;
    const a = runEval(n, tcfg.depth, 0);
    let promoted = false;
    let weights = null;

    if (a > bestScore) {
        const b = runEval(n, tcfg.depth, 0);
        const s = (a + b) / 2;
        if (s > bestScore) {
            bestScore = s;
            weights = serializeNet();
            promoted = true;
        }
    }

    self.postMessage({
        type: "eval", games: stats.games, score: a, ci: ci95(a, n), n,
        bestScore, promoted, weights
    });
}

function trainLoop() {
    if (!training) return;
    const t0 = performance.now();

    while (training && performance.now() - t0 < 100) {
        const g = playGame({
            depth: tcfg.depth, timeMs: 0, eps: tcfg.eps, tol: 0.3, opening: 2, record: true,
            nn: { 1: true, 2: true }
        });
        addToReplay(g.rec, g.winner);

        // tempo nauki maleje z liczbą gier (do 10% wartości początkowej)
        const lr = Math.max(tcfg.lr * 0.1, tcfg.lr / (1 + stats.games / 3000));
        stats.loss = learnFromReplay(Math.min(replay.length, g.rec.length * 4), lr);
        stats.lr = lr;
        stats.games++;
        stats.plies += g.plies;

        if (stats.games % tcfg.evalEvery === 0) evaluateAndMaybePromote();
    }

    self.postMessage({
        type: "progress",
        games: stats.games,
        avgPlies: stats.plies / Math.max(stats.games, 1),
        loss: stats.loss,
        lr: stats.lr,
        weights: serializeNet()
    });
    setTimeout(trainLoop, 0);               // oddaj sterowanie, żeby worker mógł odebrać "stop"
}

self.onmessage = function (e) {
    const m = e.data;

    if (m.type === "move") {
        const move = findBestMove(m);
        self.postMessage({ type: "move", id: m.id, move: move, depth: lastDepth });
    } else if (m.type === "setWeights") {
        net = netFromJSON(m.weights);
        self.postMessage({ type: "weightsSet", ok: Boolean(net) });
    } else if (m.type === "resetNet") {
        net = newNet();
        replay = [];
        self.postMessage({ type: "weights", weights: serializeNet() });
    } else if (m.type === "train") {
        if (!net) net = newNet();
        tcfg = m.cfg;
        bestScore = typeof m.cfg.bestScore === "number" ? m.cfg.bestScore : -1;
        stats = { games: 0, plies: 0, loss: 0, lr: m.cfg.lr };
        replay = [];
        training = true;
        trainLoop();
    } else if (m.type === "stop") {
        training = false;
        if (net) self.postMessage({ type: "weights", weights: serializeNet() });
    } else if (m.type === "arena") {
        const n = m.cfg.games;
        const timeMs = m.cfg.timeMs || 0;
        const score = runArena(n, m.cfg.depth, timeMs);
        self.postMessage({ type: "arena", score, ci: ci95(score, n), n, timed: timeMs > 0 });
    } else if (m.type === "eval") {
        // Ręczny test: wskazanych wag (cfg.weights) albo aktualnej sieci
        if (!net) net = newNet();
        const keep = net;
        if (m.cfg.weights) {
            const w = netFromJSON(m.cfg.weights);
            if (w) net = w;
        }
        const n = m.cfg.evalGames;
        const timeMs = m.cfg.timeMs || 0;
        const score = runEval(n, m.cfg.depth, timeMs);
        net = keep;
        self.postMessage({ type: "eval", manual: true, timed: timeMs > 0, score, ci: ci95(score, n), n });
    }
};
