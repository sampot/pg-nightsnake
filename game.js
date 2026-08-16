/** pg-nightsnake — 燈籠蛇：格狀蛇（關卡＋無盡） */

export const COLS = 16;
export const ROWS = 12;

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function placeFood(rnd, body) {
  for (let i = 0; i < 200; i++) {
    const x = Math.floor(rnd() * COLS);
    const y = Math.floor(rnd() * ROWS);
    if (!body.some((p) => p.x === x && p.y === y)) return { x, y };
  }
  return { x: 0, y: 0 };
}

export function createGame({ mode = "levels", seed = 1, level = 1 } = {}) {
  const rnd = mulberry32(seed + level * 17);
  const body = [
    { x: 4, y: 6 },
    { x: 3, y: 6 },
    { x: 2, y: 6 },
  ];
  return {
    mode,
    seed,
    level,
    target: mode === "endless" ? Infinity : 5 + level * 2,
    eaten: 0,
    score: 0,
    dir: "E",
    nextDir: "E",
    body,
    food: placeFood(rnd, body),
    tick: 0,
    stepEvery: Math.max(4, 10 - level),
    outcome: "playing",
    message: mode === "endless" ? "無盡模式" : `關卡 ${level}：吃 ${5 + level * 2} 盞燈籠`,
    rndState: seed + level * 17,
  };
}

export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ["N", "E", "S", "W"];
}

const OPP = { N: "S", S: "N", E: "W", W: "E" };
const DELTA = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

export function applyAction(state, action) {
  if (state.outcome !== "playing") return state;
  const s = structuredClone(state);
  if (OPP[action] !== s.dir) s.nextDir = action;
  return s;
}

export function step(state) {
  if (state.outcome !== "playing") return state;
  const s = state;
  s.tick += 1;
  if (s.tick % s.stepEvery !== 0) return s;
  s.dir = s.nextDir;
  const [dx, dy] = DELTA[s.dir];
  const head = s.body[0];
  const nx = head.x + dx;
  const ny = head.y + dy;
  if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
    s.outcome = "lost";
    s.message = "撞牆！";
    return s;
  }
  if (s.body.some((p) => p.x === nx && p.y === ny)) {
    s.outcome = "lost";
    s.message = "咬到自己！";
    return s;
  }
  s.body.unshift({ x: nx, y: ny });
  if (nx === s.food.x && ny === s.food.y) {
    s.eaten += 1;
    s.score += 10 * s.level;
    s.message = `燈籠 +1（${s.eaten}）`;
    const rnd = mulberry32(++s.rndState);
    s.food = placeFood(rnd, s.body);
    if (s.mode === "levels" && s.eaten >= s.target) {
      if (s.level >= 5) {
        s.outcome = "won";
        s.message = "燈籠蛇達人！";
      } else {
        const next = createGame({ mode: "levels", seed: s.seed, level: s.level + 1 });
        Object.assign(s, next);
        s.message = `進入關卡 ${s.level}`;
      }
    }
  } else {
    s.body.pop();
  }
  return s;
}

export function summarize(s) {
  return {
    level: s.level,
    score: s.score,
    eaten: s.eaten,
    target: s.target === Infinity ? "∞" : s.target,
    msg: s.message,
    outcome: s.outcome,
    mode: s.mode,
  };
}

export function getOutcome(s) {
  return s.outcome;
}
