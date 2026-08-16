// 燈籠蛇 — 純邏輯層（無 DOM）。
// 座標一律 {x, y}：x 向右、y 向下。蛇身是格子陣列，snake[0] 是頭。
// 所有輸出都是新的 state，可以直接 JSON 存進 /api/kv 再讀回來。

export const GRID_W = 15;
export const GRID_H = 15;

export const DIRS = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
  E: { x: 1, y: 0 },
};

const OPPOSITE = { N: "S", S: "N", E: "W", W: "E" };

export const START_LENGTH = 3;
/** 轉向緩衝：手指比蛇快的時候，最多先記兩個轉彎。 */
export const MAX_QUEUE = 2;

export const LANTERN_SCORE = 10;
export const GOLDEN_SCORE = 50;
/** 金燈籠一次長兩節，而且只掛一小段時間。 */
export const GOLDEN_GROWTH = 2;
export const GOLDEN_TTL = 42;
export const GOLDEN_EVERY = 4;

export const LEVEL_BONUS = 60;
export const WIN_BONUS = 400;

/** 關卡內每吃一顆就快一點，但快不過基準值減 LEVEL_SPEEDUP_CAP。 */
export const LEVEL_SPEEDUP = 4;
export const LEVEL_SPEEDUP_CAP = 32;

export const ENDLESS_START_TICK = 200;
export const ENDLESS_MIN_TICK = 78;
export const ENDLESS_STEP_MS = 5;
/** 無盡模式每吃 ENDLESS_WALL_EVERY 顆，就多擺 ENDLESS_WALL_BATCH 個攤位。 */
export const ENDLESS_WALL_EVERY = 5;
export const ENDLESS_WALL_BATCH = 2;
export const WALL_CAP = 44;

const key = (c) => `${c.x},${c.y}`;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const clone = (s) => structuredClone(s);

function rect(x0, y0, x1, y1) {
  const out = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) out.push({ x, y });
  }
  return out;
}

function unique(cells) {
  const seen = new Set();
  return cells.filter((c) => (seen.has(key(c)) ? false : seen.add(key(c))));
}

/** 每一關的攤位佈局。中線（y=7）永遠淨空，開場才不會一出攤就撞死。 */
const LAYOUTS = {
  empty: [],
  twoRows: unique([
    ...rect(4, 2, 4, 5), ...rect(4, 9, 4, 12),
    ...rect(10, 2, 10, 5), ...rect(10, 9, 10, 12),
  ]),
  cross: unique([...rect(3, 3, 11, 3), ...rect(3, 11, 11, 11)]),
  corners: unique([
    ...rect(3, 3, 4, 4), ...rect(10, 3, 11, 4),
    ...rect(3, 10, 4, 11), ...rect(10, 10, 11, 11),
    ...rect(7, 1, 7, 2), ...rect(7, 12, 7, 13),
  ]),
  alleys: unique([
    ...rect(3, 0, 3, 4), ...rect(7, 0, 7, 4), ...rect(11, 0, 11, 4),
    ...rect(3, 10, 3, 14), ...rect(7, 10, 7, 14), ...rect(11, 10, 11, 14),
  ]),
  lanternSea: unique([
    ...[2, 5, 8, 11, 14].flatMap((x) => [2, 5, 8, 11, 14].map((y) => ({ x, y }))),
    ...rect(6, 1, 9, 1), ...rect(6, 13, 9, 13),
  ]),
};

export const LEVELS = [
  { name: "廟口直街", target: 5, tickMs: 210, walls: LAYOUTS.empty },
  { name: "兩排攤車", target: 7, tickMs: 192, walls: LAYOUTS.twoRows },
  { name: "十字燈廊", target: 9, tickMs: 176, walls: LAYOUTS.cross },
  { name: "四角戲棚", target: 11, tickMs: 162, walls: LAYOUTS.corners },
  { name: "巷弄迷宮", target: 13, tickMs: 148, walls: LAYOUTS.alleys },
  { name: "燈海夜市", target: 15, tickMs: 132, walls: LAYOUTS.lanternSea },
];

const LOSE_MSG = {
  wall: "撞上夜市盡頭的圍籬。",
  stall: "一頭撞進攤位。",
  self: "咬到自己的尾巴。",
};

export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
}

export function wallAt(state, x, y) {
  return state.walls.some((c) => c.x === x && c.y === y);
}

export function snakeAt(state, x, y) {
  return state.snake.some((c) => c.x === x && c.y === y);
}

export function freeCells(state) {
  const out = [];
  for (let y = 0; y < GRID_H; y += 1) {
    for (let x = 0; x < GRID_W; x += 1) {
      if (!wallAt(state, x, y) && !snakeAt(state, x, y)) out.push({ x, y });
    }
  }
  return out;
}

/** 從 start 出發走得到的格子（含 start 本身，即使那是蛇頭）。 */
export function reachableFrom(state, start) {
  const seen = new Set();
  if (!start || !inBounds(start.x, start.y)) return seen;
  seen.add(key(start));
  const queue = [start];
  for (let i = 0; i < queue.length; i += 1) {
    const cell = queue[i];
    for (const d of Object.values(DIRS)) {
      const next = { x: cell.x + d.x, y: cell.y + d.y };
      if (seen.has(key(next))) continue;
      if (!inBounds(next.x, next.y) || wallAt(state, next.x, next.y) || snakeAt(state, next.x, next.y)) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return seen;
}

/* ── 亂數：seed 存在 state 裡，同一顆 seed 永遠重現同一局 ─────── */

function advance(seed) {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** 就地推進 state.rng 並回傳 [0, 1)。只在 clone 過的 state 上呼叫。 */
function draw(state) {
  state.rng = advance(state.rng);
  return state.rng / 4294967296;
}

function pick(state, list) {
  return list[clamp(Math.floor(draw(state) * list.length), 0, list.length - 1)];
}

/* ── 燈籠 ─────────────────────────────────────────────── */

/** 優先掛在蛇走得到的空格；真的沒路了才退而求其次。 */
function nextFood(state, { avoid = null, forceKind = null } = {}) {
  const free = freeCells(state).filter((c) => !avoid || key(c) !== key(avoid));
  if (!free.length) return null;
  const reach = reachableFrom(state, state.snake[0]);
  const pool = free.filter((c) => reach.has(key(c)));
  const cell = pick(state, pool.length ? pool : free);
  const golden = forceKind ? forceKind === "golden" : state.spawns > 0 && state.spawns % GOLDEN_EVERY === 0;
  return { x: cell.x, y: cell.y, kind: golden ? "golden" : "lantern", ttl: golden ? GOLDEN_TTL : null };
}

/* ── 開局 ─────────────────────────────────────────────── */

function startSnake() {
  const y = Math.floor(GRID_H / 2);
  const x = Math.floor(GRID_W / 2);
  return Array.from({ length: START_LENGTH }, (_, i) => ({ x: x - i, y }));
}

export function createGame({ mode = "levels", seed = 1, level = 1 } = {}) {
  const levels = mode === "levels";
  const at = levels ? clamp(Math.trunc(level) || 1, 1, LEVELS.length) : 1;
  const state = {
    mode: levels ? "levels" : "endless",
    seed,
    rng: (Math.abs(Math.trunc(seed)) >>> 0) || 1,
    level: at,
    target: levels ? LEVELS[at - 1].target : null,
    walls: levels ? LEVELS[at - 1].walls.map((c) => ({ ...c })) : [],
    snake: startSnake(),
    dir: "E",
    queue: [],
    grow: 0,
    food: null,
    eaten: 0,
    totalEaten: 0,
    spawns: 0,
    score: 0,
    ticks: 0,
    outcome: "playing",
    reason: null,
    events: [],
    msg: levels ? `第 ${at} 關：${LEVELS[at - 1].name}` : "無盡夜行，撐多久算多久。",
  };
  state.food = nextFood(state);
  return state;
}

/* ── 操作 ─────────────────────────────────────────────── */

export function turn(state, dirKey) {
  if (state.outcome !== "playing" || !DIRS[dirKey]) return state;
  const last = state.queue.length ? state.queue.at(-1) : state.dir;
  if (dirKey === last || dirKey === OPPOSITE[last]) return state;
  if (state.queue.length >= MAX_QUEUE) return state;
  return { ...state, queue: [...state.queue, dirKey] };
}

export function speedFor(state) {
  if (state.mode === "endless") {
    return Math.max(ENDLESS_MIN_TICK, ENDLESS_START_TICK - state.totalEaten * ENDLESS_STEP_MS);
  }
  const base = LEVELS[state.level - 1].tickMs;
  return Math.max(base - LEVEL_SPEEDUP_CAP, base - state.eaten * LEVEL_SPEEDUP);
}

function gainFor(state, kind) {
  if (kind === "golden") return GOLDEN_SCORE;
  const bonus = state.mode === "levels" ? (state.level - 1) * 2 : Math.floor(state.totalEaten / 5);
  return LANTERN_SCORE + bonus;
}

function lose(state, reason) {
  state.outcome = "lost";
  state.reason = reason;
  state.msg = LOSE_MSG[reason];
  state.events.push({ type: "lose", reason });
  return state;
}

/** 無盡模式的攤位：離頭三格以外，而且擺完燈籠還要走得到。 */
function addStalls(state) {
  const budget = Math.min(ENDLESS_WALL_BATCH, WALL_CAP - state.walls.length);
  for (let i = 0; i < budget; i += 1) {
    const head = state.snake[0];
    const candidates = freeCells(state).filter((c) => {
      if (state.food && key(c) === key(state.food)) return false;
      return Math.max(Math.abs(c.x - head.x), Math.abs(c.y - head.y)) >= 3;
    });
    if (!candidates.length) return;
    const spot = pick(state, candidates);
    const trial = { ...state, walls: [...state.walls, spot] };
    if (state.food && !reachableFrom(trial, head).has(key(state.food))) continue;
    state.walls = trial.walls;
    state.events.push({ type: "stall", x: spot.x, y: spot.y });
  }
}

function advanceLevel(state) {
  state.score += LEVEL_BONUS * state.level;
  if (state.level >= LEVELS.length) {
    state.score += WIN_BONUS;
    state.outcome = "won";
    state.reason = "campaign";
    state.msg = "整條夜市的燈都點亮了。";
    state.events.push({ type: "win", reason: "campaign" });
    return true;
  }
  state.level += 1;
  state.eaten = 0;
  state.target = LEVELS[state.level - 1].target;
  state.walls = LEVELS[state.level - 1].walls.map((c) => ({ ...c }));
  state.snake = startSnake();
  state.dir = "E";
  state.queue = [];
  state.grow = 0;
  state.msg = `第 ${state.level} 關：${LEVELS[state.level - 1].name}`;
  state.events.push({ type: "level", level: state.level });
  return false;
}

function consume(state, head) {
  const { kind } = state.food;
  const gain = gainFor(state, kind);
  state.score += gain;
  state.eaten += 1;
  state.totalEaten += 1;
  state.food = null;
  state.msg = kind === "golden" ? `金燈籠！＋${gain}` : `燈籠＋${gain}`;
  state.events.push({ type: "eat", kind, x: head.x, y: head.y, gain });

  if (state.mode === "endless" && state.totalEaten % ENDLESS_WALL_EVERY === 0) addStalls(state);
  if (state.mode === "levels" && state.eaten >= state.target && advanceLevel(state)) return state;

  state.spawns += 1;
  state.food = nextFood(state);
  if (!state.food) {
    state.outcome = "won";
    state.reason = "full";
    state.msg = "整條街被你塞滿了。";
    state.events.push({ type: "win", reason: "full" });
  }
  return state;
}

/** 走一格。這是唯一會推進時間的函式，畫面用固定 tick 呼叫它。 */
export function step(state) {
  if (state.outcome !== "playing") return state;
  const s = clone(state);
  s.events = [];
  s.ticks += 1;

  if (s.queue.length) {
    const next = s.queue.shift();
    if (next !== OPPOSITE[s.dir]) s.dir = next;
  }

  const d = DIRS[s.dir];
  const head = { x: s.snake[0].x + d.x, y: s.snake[0].y + d.y };

  if (!inBounds(head.x, head.y)) return lose(s, "wall");
  if (wallAt(s, head.x, head.y)) return lose(s, "stall");

  const eating = !!s.food && s.food.x === head.x && s.food.y === head.y;
  // 這一 tick 尾巴會讓出來的話，鑽進尾巴格是合法的。
  const body = eating || s.grow > 0 ? s.snake : s.snake.slice(0, -1);
  if (body.some((c) => c.x === head.x && c.y === head.y)) return lose(s, "self");

  const growth = eating ? (s.food.kind === "golden" ? GOLDEN_GROWTH : 1) : 0;
  s.snake.unshift(head);
  if (eating) s.grow += growth - 1;
  else if (s.grow > 0) s.grow -= 1;
  else s.snake.pop();

  if (eating) return consume(s, head);

  if (s.food && s.food.kind === "golden") {
    s.food = { ...s.food, ttl: s.food.ttl - 1 };
    if (s.food.ttl <= 0) {
      const gone = s.food;
      s.food = nextFood(s, { avoid: gone, forceKind: "lantern" });
      s.msg = "金燈籠熄了。";
      s.events.push({ type: "expire", x: gone.x, y: gone.y });
    }
  }
  return s;
}

/* ── 輸出 ─────────────────────────────────────────────── */

export function summarize(state) {
  const levels = state.mode === "levels";
  const level = LEVELS[state.level - 1];
  return {
    mode: state.mode,
    level: state.level,
    levels: LEVELS.length,
    levelName: levels ? level.name : "無盡夜行",
    target: state.target,
    eaten: state.eaten,
    remaining: state.target === null ? null : Math.max(0, state.target - state.eaten),
    totalEaten: state.totalEaten,
    length: state.snake.length,
    score: state.score,
    tickMs: speedFor(state),
    stalls: state.walls.length,
    golden: state.food && state.food.kind === "golden" ? state.food.ttl : null,
    ticks: state.ticks,
    outcome: state.outcome,
    reason: state.reason,
    msg: state.msg,
  };
}

export function getOutcome(state) {
  return state.outcome;
}
