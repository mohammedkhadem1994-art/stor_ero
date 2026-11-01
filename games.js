"use strict";
/* Small games on the home page: Jewels (match three), Blocks, Memory, 2048.
   Pure rules are exposed on window.MKGames so they can be tested; the rest only draws and listens. */
(function () {
  const rnd = n => Math.floor(Math.random() * n);

  /* ---------- rules ---------- */
  const rules = {
    /* Jewels: cells of a size x size board, each a number 0..kinds-1 (or -1 empty). Returns the set of indexes in lines of 3+. */
    findMatches(board, size) {
      const hit = new Set();
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        const v = board[r * size + c]; if (v < 0) continue;
        let n = 1; while (c + n < size && board[r * size + c + n] === v) n++;
        if (n >= 3) for (let k = 0; k < n; k++) hit.add(r * size + c + k);
        n = 1; while (r + n < size && board[(r + n) * size + c] === v) n++;
        if (n >= 3) for (let k = 0; k < n; k++) hit.add((r + k) * size + c);
      }
      return hit;
    },
    /* Remove the cells, let the gems above fall and fill the top with new ones. */
    collapse(board, size, hit, kinds, pick = rnd) {
      const next = board.slice();
      hit.forEach(i => { next[i] = -1; });
      for (let c = 0; c < size; c++) {
        const col = []; for (let r = size - 1; r >= 0; r--) if (next[r * size + c] >= 0) col.push(next[r * size + c]);
        for (let r = size - 1, k = 0; r >= 0; r--, k++) next[r * size + c] = k < col.length ? col[k] : pick(kinds);
      }
      return next;
    },
    adjacent(a, b, size) {
      const ra = Math.floor(a / size), ca = a % size, rb = Math.floor(b / size), cb = b % size;
      return Math.abs(ra - rb) + Math.abs(ca - cb) === 1;
    },
    newBoard(size, kinds, pick = rnd) {
      const b = [];
      for (let i = 0; i < size * size; i++) {
        let v; do { v = pick(kinds); }
        while ((i % size >= 2 && b[i - 1] === v && b[i - 2] === v) || (i >= size * 2 && b[i - size] === v && b[i - 2 * size] === v));
        b.push(v);
      }
      return b;
    },
    /* Blocks: pieces are lists of [row, col] cells. */
    PIECES: [
      [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [0, 1], [1, 0], [1, 1]], [[0, 1], [1, 0], [1, 1], [1, 2]],
      [[0, 1], [0, 2], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 1], [1, 2]], [[0, 0], [1, 0], [1, 1], [1, 2]], [[0, 2], [1, 0], [1, 1], [1, 2]]
    ],
    rotate(cells) {   /* a quarter turn */
      const h = Math.max(...cells.map(c => c[0])) + 1;
      return cells.map(([r, c]) => [c, h - 1 - r]);
    },
    collides(grid, cols, cells, row, col) {
      return cells.some(([r, c]) => { const rr = row + r, cc = col + c; return cc < 0 || cc >= cols || rr >= grid.length || (rr >= 0 && grid[rr][cc]); });
    },
    clearLines(grid, cols) {
      const kept = grid.filter(line => line.some(v => !v));
      const cleared = grid.length - kept.length;
      while (kept.length < grid.length) kept.unshift(new Array(cols).fill(0));
      return { grid: kept, cleared };
    },
    /* 2048: slide one line to the left. */
    slide(line) {
      const nums = line.filter(Boolean); let gained = 0; const out = [];
      for (let i = 0; i < nums.length; i++) {
        if (nums[i] === nums[i + 1]) { out.push(nums[i] * 2); gained += nums[i] * 2; i++; } else out.push(nums[i]);
      }
      while (out.length < line.length) out.push(0);
      return { line: out, gained };
    }
  };
  window.MKGames = rules;

  /* ---------- page ---------- */
  const area = document.getElementById("game-area");
  if (!area) return;
  const scoreBox = document.getElementById("game-score"), bestBox = document.getElementById("game-best"), help = document.getElementById("game-help");
  let current = null, stopFn = null, score = 0, best = 0, name = "";

  const bestKey = () => "mk-best-" + name;
  const loadBest = () => { try { return Number(localStorage.getItem(bestKey())) || 0; } catch { return 0; } };
  const show = () => { scoreBox.textContent = score; bestBox.textContent = best; };
  const add = n => { score += n; if (score > best) { best = score; try { localStorage.setItem(bestKey(), String(best)); } catch { /* ignore */ } } show(); };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  const GAMES = {
    /* ---------- Jewels ---------- */
    jewels() {
      const SIZE = 8, KINDS = 6, GEMS = ["💎", "🔶", "🟢", "🟣", "🔴", "🔵"];
      let board = rules.newBoard(SIZE, KINDS), pick = -1, busy = false, moves = 25;
      const grid = el("div", "g-board g-jewels"); grid.style.gridTemplateColumns = `repeat(${SIZE}, minmax(0, 1fr))`;
      const info = el("p", "g-info");
      const cells = board.map((_, i) => { const b = el("button", "g-gem"); b.type = "button"; b.dataset.i = i; grid.appendChild(b); return b; });
      const draw = () => { cells.forEach((b, i) => { b.textContent = board[i] < 0 ? "" : GEMS[board[i]]; b.classList.toggle("sel", i === pick); }); info.textContent = moves > 0 ? `Moves left: ${moves}` : "No moves left. Press New game."; };
      const wait = ms => new Promise(r => setTimeout(r, ms));
      async function settle() {
        let combo = 0, hit;
        while ((hit = rules.findMatches(board, SIZE)).size) {
          combo++; add(hit.size * 10 * combo);
          hit.forEach(i => cells[i].classList.add("pop")); await wait(180);
          board = rules.collapse(board, SIZE, hit, KINDS); cells.forEach(c => c.classList.remove("pop")); draw(); await wait(120);
        }
      }
      grid.addEventListener("click", async e => {
        const b = e.target.closest(".g-gem"); if (!b || busy || moves <= 0) return;
        const i = Number(b.dataset.i);
        if (pick < 0) { pick = i; return draw(); }
        if (pick === i) { pick = -1; return draw(); }
        if (!rules.adjacent(pick, i, SIZE)) { pick = i; return draw(); }
        busy = true; const a = pick; pick = -1;
        [board[a], board[i]] = [board[i], board[a]]; draw(); await wait(120);
        if (!rules.findMatches(board, SIZE).size) { [board[a], board[i]] = [board[i], board[a]]; draw(); busy = false; return; }
        moves--; await settle(); draw(); busy = false;
      });
      area.append(grid, info); draw();
      help.textContent = "Tap a jewel, then a neighbour, to swap them and make lines of three or more. 25 moves.";
      return () => { busy = true; };
    },

    /* ---------- Blocks ---------- */
    blocks() {
      const ROWS = 18, COLS = 10;
      let grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0)), piece = null, over = false, timer = null, lines = 0;
      const COLORS = ["#2b64e0", "#828282", "#4f7ad6", "#2fa35a", "#979797", "#c0392b", "#2251b8"];
      const board = el("div", "g-board g-blocks"); board.style.gridTemplateColumns = `repeat(${COLS}, minmax(0, 1fr))`;
      const cells = []; for (let i = 0; i < ROWS * COLS; i++) { const d = el("div", "g-cell"); board.appendChild(d); cells.push(d); }
      const info = el("p", "g-info");
      const pad = el("div", "g-pad");
      [["◀", "left"], ["⟳", "turn"], ["▶", "right"], ["▼", "down"], ["⤓", "drop"]].forEach(([t, a]) => { const b = el("button", "small-button", t); b.type = "button"; b.dataset.a = a; b.setAttribute("aria-label", a); pad.appendChild(b); });
      const spawn = () => {
        const k = rnd(rules.PIECES.length);
        piece = { cells: rules.PIECES[k], row: 0, col: 3, k };
        if (rules.collides(grid, COLS, piece.cells, piece.row, piece.col)) { over = true; clearInterval(timer); }
      };
      const draw = () => {
        cells.forEach((d, i) => { const v = grid[Math.floor(i / COLS)][i % COLS]; d.style.background = v ? COLORS[v - 1] : ""; });
        if (piece && !over) piece.cells.forEach(([r, c]) => { const rr = piece.row + r, cc = piece.col + c; if (rr >= 0) cells[rr * COLS + cc].style.background = COLORS[piece.k]; });
        info.textContent = over ? "Game over. Press New game." : `Lines: ${lines}`;
      };
      const lock = () => {
        piece.cells.forEach(([r, c]) => { const rr = piece.row + r; if (rr >= 0) grid[rr][piece.col + c] = piece.k + 1; });
        const res = rules.clearLines(grid, COLS); grid = res.grid;
        if (res.cleared) { lines += res.cleared; add([0, 100, 300, 500, 800][res.cleared] || 800); }
        spawn();
      };
      const down = () => { if (over) return; if (!rules.collides(grid, COLS, piece.cells, piece.row + 1, piece.col)) piece.row++; else lock(); draw(); };
      const act = a => {
        if (over || !piece) return;
        if (a === "left" && !rules.collides(grid, COLS, piece.cells, piece.row, piece.col - 1)) piece.col--;
        else if (a === "right" && !rules.collides(grid, COLS, piece.cells, piece.row, piece.col + 1)) piece.col++;
        else if (a === "turn") { const t = rules.rotate(piece.cells); if (!rules.collides(grid, COLS, t, piece.row, piece.col)) piece.cells = t; }
        else if (a === "down") return down();
        else if (a === "drop") { while (!rules.collides(grid, COLS, piece.cells, piece.row + 1, piece.col)) piece.row++; add(2); lock(); }
        draw();
      };
      pad.addEventListener("click", e => { const b = e.target.closest("button"); if (b) act(b.dataset.a); });
      const keys = e => { const m = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "turn", ArrowDown: "down", " ": "drop" }[e.key]; if (m) { e.preventDefault(); act(m); } };
      document.addEventListener("keydown", keys);
      spawn(); draw(); timer = setInterval(down, 650);
      area.append(board, info, pad);
      help.textContent = "Complete lines. Buttons below, or arrow keys (up = turn, space = drop).";
      return () => { clearInterval(timer); document.removeEventListener("keydown", keys); };
    },

    /* ---------- Memory ---------- */
    memory() {
      const FACES = ["🍎", "🚗", "⚽", "🎧", "🌙", "🔑", "🎁", "🍀"];
      const deck = [...FACES, ...FACES].map(f => ({ f, up: false, done: false })).sort(() => Math.random() - .5);
      let first = -1, lock = false, tries = 0, found = 0;
      const grid = el("div", "g-board g-memory"); grid.style.gridTemplateColumns = "repeat(4, minmax(0, 1fr))";
      const info = el("p", "g-info");
      const btns = deck.map((_, i) => { const b = el("button", "g-card"); b.type = "button"; b.dataset.i = i; grid.appendChild(b); return b; });
      const draw = () => { btns.forEach((b, i) => { b.textContent = deck[i].up || deck[i].done ? deck[i].f : "?"; b.classList.toggle("done", deck[i].done); }); info.textContent = found === FACES.length ? `You found all pairs in ${tries} tries!` : `Tries: ${tries}`; };
      grid.addEventListener("click", e => {
        const b = e.target.closest(".g-card"); if (!b || lock) return;
        const i = Number(b.dataset.i); if (deck[i].up || deck[i].done) return;
        deck[i].up = true; draw();
        if (first < 0) { first = i; return; }
        tries++; const j = first; first = -1;
        if (deck[i].f === deck[j].f) { deck[i].done = deck[j].done = true; deck[i].up = deck[j].up = false; found++; add(50); if (found === FACES.length) add(Math.max(0, 200 - tries * 5)); draw(); }
        else { lock = true; draw(); setTimeout(() => { deck[i].up = deck[j].up = false; lock = false; draw(); }, 700); }
      });
      area.append(grid, info); draw();
      help.textContent = "Turn two cards: find all the matching pairs with the fewest tries.";
      return () => { lock = true; };
    },

    /* ---------- 2048 ---------- */
    g2048() {
      let g = new Array(16).fill(0), over = false;
      const grid = el("div", "g-board g-2048"); grid.style.gridTemplateColumns = "repeat(4, minmax(0, 1fr))";
      const info = el("p", "g-info"); const tiles = g.map(() => { const d = el("div", "g-tile"); grid.appendChild(d); return d; });
      const pad = el("div", "g-pad"); [["◀", "left"], ["▲", "up"], ["▼", "down"], ["▶", "right"]].forEach(([t, a]) => { const b = el("button", "small-button", t); b.type = "button"; b.dataset.a = a; pad.appendChild(b); });
      const addTile = () => { const free = g.map((v, i) => v ? -1 : i).filter(i => i >= 0); if (free.length) g[free[rnd(free.length)]] = Math.random() < .9 ? 2 : 4; };
      const lineAt = (dir, k) => { const idx = []; for (let n = 0; n < 4; n++) idx.push(dir === "left" ? k * 4 + n : dir === "right" ? k * 4 + 3 - n : dir === "up" ? n * 4 + k : (3 - n) * 4 + k); return idx; };
      const move = dir => {
        let changed = false, gained = 0;
        for (let k = 0; k < 4; k++) { const idx = lineAt(dir, k); const r = rules.slide(idx.map(i => g[i])); idx.forEach((i, n) => { if (g[i] !== r.line[n]) changed = true; g[i] = r.line[n]; }); gained += r.gained; }
        return { changed, gained };
      };
      const stuck = () => { const t = g.slice(); const ok = ["left", "right", "up", "down"].some(d => { const s = g.slice(); const r = move(d); g = s; return r.changed; }); g = t; return !ok; };
      const draw = () => { tiles.forEach((t, i) => { t.textContent = g[i] || ""; t.dataset.v = g[i]; }); info.textContent = over ? "No more moves. Press New game." : "Join equal numbers to reach 2048."; };
      const act = dir => { if (over) return; const r = move(dir); if (!r.changed) return; add(r.gained); addTile(); if (stuck()) over = true; draw(); };
      const keys = e => { const m = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" }[e.key]; if (m) { e.preventDefault(); act(m); } };
      document.addEventListener("keydown", keys);
      pad.addEventListener("click", e => { const b = e.target.closest("button"); if (b) act(b.dataset.a); });
      let sx = 0, sy = 0;
      grid.addEventListener("touchstart", e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
      grid.addEventListener("touchend", e => { const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up")); });
      addTile(); addTile(); draw();
      area.append(grid, info, pad);
      help.textContent = "Swipe, use the buttons or arrow keys. Equal numbers join. Reach 2048!";
      return () => document.removeEventListener("keydown", keys);
    }
  };

  function start(game) {
    if (stopFn) { stopFn(); stopFn = null; }
    area.textContent = ""; current = game; name = game; score = 0; best = loadBest(); show();
    document.querySelectorAll(".game-tab").forEach(t => t.classList.toggle("active", t.dataset.game === game));
    stopFn = GAMES[game]();
  }
  document.getElementById("game-tabs").addEventListener("click", e => { const t = e.target.closest(".game-tab"); if (t) start(t.dataset.game); });
  document.getElementById("game-new").addEventListener("click", () => start(current || "jewels"));
  /* the games sit in the side rail and are always on show: the first one starts at once */
  start("jewels");
})();
