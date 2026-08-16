import { describe, expect, it } from "vitest";
import {
  DIRS,
  ENDLESS_MIN_TICK,
  ENDLESS_START_TICK,
  ENDLESS_WALL_BATCH,
  ENDLESS_WALL_EVERY,
  GOLDEN_EVERY,
  GOLDEN_GROWTH,
  GOLDEN_SCORE,
  GOLDEN_TTL,
  GRID_H,
  GRID_W,
  LANTERN_SCORE,
  LEVELS,
  MAX_QUEUE,
  START_LENGTH,
  WALL_CAP,
  createGame,
  freeCells,
  getOutcome,
  reachableFrom,
  snakeAt,
  speedFor,
  step,
  summarize,
  turn,
  wallAt,
} from "./game.js";

const cellKey = (c) => `${c.x},${c.y}`;
const OPPOSITE = { N: "S", S: "N", E: "W", W: "E" };

/** 把燈籠丟到角落，讓「單純移動」的測試不會意外吃到東西。 */
const parked = (state) => ({ ...state, food: { x: 0, y: 0, kind: "lantern", ttl: null } });

/** 燈籠擺在蛇頭正前方那一格。 */
function foodAhead(state, kind = "lantern") {
  const head = state.snake[0];
  const d = DIRS[state.dir];
  return {
    ...state,
    food: { x: head.x + d.x, y: head.y + d.y, kind, ttl: kind === "golden" ? GOLDEN_TTL : null },
  };
}

const blocked = (state, x, y) =>
  x < 0 || y < 0 || x >= GRID_W || y >= GRID_H || wallAt(state, x, y) || snakeAt(state, x, y);

/** 挑一個不會馬上死、而且後面空間最大的方向，讓測試能真的把一關吃完。 */
function safeDir(state) {
  const head = state.snake[0];
  const options = ["N", "E", "S", "W"]
    .filter((key) => key !== OPPOSITE[state.dir])
    .map((key) => ({ key, x: head.x + DIRS[key].x, y: head.y + DIRS[key].y }))
    .filter((o) => !blocked(state, o.x, o.y))
    .map((o) => ({ ...o, room: reachableFrom(state, { x: o.x, y: o.y }).size, straight: o.key === state.dir }));
  if (!options.length) return state.dir;
  options.sort((a, b) => b.room - a.room || Number(b.straight) - Number(a.straight));
  return options[0].key;
}

/** 一路把燈籠餵到蛇頭前面，模擬「連吃 n 顆」。 */
function eatMany(state, n, kind = "lantern") {
  let s = state;
  for (let i = 0; i < n && getOutcome(s) === "playing"; i += 1) {
    const key = safeDir(s);
    const head = s.snake[0];
    s = step({
      ...s,
      queue: key === s.dir ? [] : [key],
      food: {
        x: head.x + DIRS[key].x,
        y: head.y + DIRS[key].y,
        kind,
        ttl: kind === "golden" ? GOLDEN_TTL : null,
      },
    });
  }
  return s;
}

function stepN(state, n) {
  let s = state;
  for (let i = 0; i < n; i += 1) s = step(s);
  return s;
}

describe("開局", () => {
  it("關卡模式從第一關開始，蛇在中線朝東", () => {
    const s = createGame({ mode: "levels", seed: 7 });
    expect(s.mode).toBe("levels");
    expect(s.level).toBe(1);
    expect(s.snake).toHaveLength(START_LENGTH);
    expect(s.dir).toBe("E");
    expect(s.snake[0]).toEqual({ x: 7, y: 7 });
    expect(getOutcome(s)).toBe("playing");
    expect(s.target).toBe(LEVELS[0].target);
  });

  it("第一關是空街，之後每一關的攤位都更多", () => {
    const counts = LEVELS.map((_, i) => createGame({ mode: "levels", level: i + 1 }).walls.length);
    expect(counts[0]).toBe(0);
    for (let i = 1; i < counts.length; i += 1) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
  });

  it("可以指定起始關卡，並套用該關的目標與速度", () => {
    const s = createGame({ mode: "levels", level: 4 });
    expect(s.level).toBe(4);
    expect(s.target).toBe(LEVELS[3].target);
    expect(speedFor(s)).toBe(LEVELS[3].tickMs);
  });

  it("無盡模式沒有過關目標、沒有攤位，速度從起始值開始", () => {
    const s = createGame({ mode: "endless", seed: 3 });
    expect(s.mode).toBe("endless");
    expect(s.target).toBe(null);
    expect(s.walls).toEqual([]);
    expect(speedFor(s)).toBe(ENDLESS_START_TICK);
  });

  it("每一關的起始蛇身與正前方的走道都不會被攤位擋住", () => {
    for (let level = 1; level <= LEVELS.length; level += 1) {
      const s = createGame({ mode: "levels", level });
      for (const cell of s.snake) expect(wallAt(s, cell.x, cell.y)).toBe(false);
      for (let x = s.snake[0].x + 1; x < GRID_W; x += 1) {
        expect(wallAt(s, x, s.snake[0].y)).toBe(false);
      }
    }
  });

  it("開局的燈籠不會壓在蛇身或攤位上，而且走得到", () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const s = createGame({ mode: "levels", level: LEVELS.length, seed });
      expect(snakeAt(s, s.food.x, s.food.y)).toBe(false);
      expect(wallAt(s, s.food.x, s.food.y)).toBe(false);
      expect(reachableFrom(s, s.snake[0]).has(cellKey(s.food))).toBe(true);
    }
  });

  it("同一個 seed 重現同一局，不同 seed 會給不同開局", () => {
    expect(createGame({ seed: 11 })).toEqual(createGame({ seed: 11 }));
    const spots = new Set([5, 9, 13, 21, 44].map((seed) => cellKey(createGame({ seed }).food)));
    expect(spots.size).toBeGreaterThan(1);
  });

  it("關卡的目標遞增、速度遞快", () => {
    for (let i = 1; i < LEVELS.length; i += 1) {
      expect(LEVELS[i].target).toBeGreaterThan(LEVELS[i - 1].target);
      expect(LEVELS[i].tickMs).toBeLessThan(LEVELS[i - 1].tickMs);
    }
  });
});

describe("轉向", () => {
  it("轉向先排進佇列，下一個 tick 才生效", () => {
    const s = turn(createGame({ seed: 2 }), "N");
    expect(s.dir).toBe("E");
    expect(s.queue).toEqual(["N"]);
    const moved = step(parked(s));
    expect(moved.dir).toBe("N");
    expect(moved.snake[0]).toEqual({ x: 7, y: 6 });
    expect(moved.queue).toEqual([]);
  });

  it("不能直接反向", () => {
    const s = parked(createGame({ seed: 2 }));
    expect(turn(s, "W").queue).toEqual([]);
    expect(step(turn(s, "W")).snake[0]).toEqual({ x: 8, y: 7 });
  });

  it("反向是跟最後排入的方向比，不是跟目前方向比", () => {
    const s = turn(createGame({ seed: 2 }), "N");
    expect(turn(s, "S").queue).toEqual(["N"]);
    expect(turn(s, "W").queue).toEqual(["N", "W"]);
  });

  it("佇列最多兩個轉向，狂按不會累積", () => {
    let s = createGame({ seed: 2 });
    for (const key of ["N", "W", "S", "E", "N"]) s = turn(s, key);
    expect(s.queue).toHaveLength(MAX_QUEUE);
  });

  it("重複按同一個方向不會塞進佇列", () => {
    const s = createGame({ seed: 2 });
    expect(turn(s, "E").queue).toEqual([]);
    expect(turn(turn(s, "N"), "N").queue).toEqual(["N"]);
  });

  it("兩個 tick 內可以連轉兩次，第二個轉向不會被吃掉", () => {
    const s = parked(turn(turn(createGame({ seed: 2 }), "N"), "W"));
    const a = step(s);
    expect(a.dir).toBe("N");
    const b = step(a);
    expect(b.dir).toBe("W");
    expect(b.snake[0]).toEqual({ x: 6, y: 6 });
  });

  it("轉向是純函式，不會改到原本的 state", () => {
    const s = createGame({ seed: 2 });
    const before = JSON.stringify(s);
    turn(s, "N");
    expect(JSON.stringify(s)).toBe(before);
  });

  it("遊戲結束後轉向沒有作用", () => {
    const dead = { ...createGame({ seed: 2 }), outcome: "lost", reason: "wall" };
    expect(turn(dead, "N")).toEqual(dead);
  });
});

describe("移動與死亡", () => {
  it("每個 tick 前進一格，長度不變", () => {
    const s = parked(createGame({ mode: "levels", seed: 4 }));
    const moved = step(s);
    expect(moved.snake).toHaveLength(START_LENGTH);
    expect(moved.snake[0]).toEqual({ x: 8, y: 7 });
    expect(moved.snake.at(-1)).toEqual({ x: 6, y: 7 });
    expect(moved.ticks).toBe(1);
  });

  it("step 是純函式，不會改到原本的 state", () => {
    const s = createGame({ seed: 4 });
    const before = JSON.stringify(s);
    step(s);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("撞到夜市盡頭的牆就死", () => {
    let s = parked(createGame({ mode: "levels", level: 1, seed: 4 }));
    for (let i = 0; i < GRID_W + 2 && getOutcome(s) === "playing"; i += 1) s = step(s);
    expect(getOutcome(s)).toBe("lost");
    expect(s.reason).toBe("wall");
    expect(s.snake[0].x).toBe(GRID_W - 1);
    expect(s.events.some((e) => e.type === "lose")).toBe(true);
  });

  it("撞到自己就死", () => {
    const s = {
      ...parked(createGame({ mode: "levels", level: 1, seed: 4 })),
      snake: [
        { x: 7, y: 7 }, { x: 7, y: 8 }, { x: 8, y: 8 }, { x: 8, y: 7 },
        { x: 9, y: 7 }, { x: 9, y: 8 }, { x: 10, y: 8 },
      ],
    };
    const dead = step(s);
    expect(getOutcome(dead)).toBe("lost");
    expect(dead.reason).toBe("self");
  });

  it("撞到攤位就死", () => {
    const s = { ...parked(createGame({ mode: "levels", level: 1, seed: 4 })), walls: [{ x: 8, y: 7 }] };
    const dead = step(s);
    expect(getOutcome(dead)).toBe("lost");
    expect(dead.reason).toBe("stall");
  });

  it("可以鑽進這個 tick 正要空出來的尾巴格", () => {
    const s = {
      ...parked(createGame({ mode: "levels", level: 1, seed: 4 })),
      snake: [{ x: 7, y: 7 }, { x: 7, y: 8 }, { x: 6, y: 8 }, { x: 6, y: 7 }],
      dir: "W",
    };
    const moved = step(s);
    expect(getOutcome(moved)).toBe("playing");
    expect(moved.snake[0]).toEqual({ x: 6, y: 7 });
  });

  it("死了以後再 tick 也不會有任何變化", () => {
    const dead = { ...createGame({ seed: 4 }), outcome: "lost", reason: "wall" };
    expect(step(dead)).toEqual(dead);
  });
});

describe("吃燈籠", () => {
  it("吃到燈籠會變長、加分，並掛出下一顆", () => {
    const s = createGame({ mode: "levels", seed: 8 });
    const ate = step(foodAhead(s));
    expect(ate.snake).toHaveLength(START_LENGTH + 1);
    expect(ate.eaten).toBe(1);
    expect(ate.score).toBeGreaterThan(0);
    expect(snakeAt(ate, ate.food.x, ate.food.y)).toBe(false);
    expect(wallAt(ate, ate.food.x, ate.food.y)).toBe(false);
    expect(ate.events.some((e) => e.type === "eat" && e.kind === "lantern")).toBe(true);
  });

  it("吃到的那個 tick 尾巴不會縮，沒吃到才縮", () => {
    const s = createGame({ mode: "levels", seed: 8 });
    const tail = s.snake.at(-1);
    expect(step(foodAhead(s)).snake.at(-1)).toEqual(tail);
    expect(step(parked(s)).snake.at(-1)).not.toEqual(tail);
  });

  it("燈籠吃越多蛇跑越快，但有速度下限", () => {
    const s = createGame({ mode: "endless", seed: 8 });
    const fast = eatMany(s, 6);
    expect(fast.totalEaten).toBe(6);
    expect(speedFor(fast)).toBeLessThan(speedFor(s));
    expect(speedFor({ ...s, totalEaten: 999 })).toBe(ENDLESS_MIN_TICK);
  });

  it("關卡模式的分數吃得到關卡加成", () => {
    const early = step(foodAhead(createGame({ mode: "levels", level: 1, seed: 8 })));
    const late = step(foodAhead(createGame({ mode: "levels", level: 5, seed: 8 })));
    expect(early.score).toBe(LANTERN_SCORE);
    expect(late.score).toBeGreaterThan(early.score);
  });

  it("新燈籠一定掛在走得到的空格", () => {
    let s = createGame({ mode: "levels", level: LEVELS.length, seed: 12 });
    for (let i = 0; i < 8; i += 1) {
      s = eatMany(s, 1);
      if (getOutcome(s) !== "playing") break;
      expect(freeCells(s).some((c) => c.x === s.food.x && c.y === s.food.y)).toBe(true);
      expect(reachableFrom(s, s.snake[0]).has(cellKey(s.food))).toBe(true);
    }
  });
});

describe("金燈籠", () => {
  it("金燈籠分數更高、一次長兩節", () => {
    const s = createGame({ mode: "endless", seed: 8 });
    const gold = step(foodAhead(s, "golden"));
    expect(gold.score).toBe(GOLDEN_SCORE);
    expect(gold.events.some((e) => e.type === "eat" && e.kind === "golden")).toBe(true);
    const settled = stepN(parked(gold), 3);
    expect(settled.snake.length - s.snake.length).toBe(GOLDEN_GROWTH);
  });

  it("金燈籠會倒數，時間到換回普通燈籠且不扣分", () => {
    const s = { ...createGame({ mode: "endless", seed: 8 }), food: { x: 1, y: 1, kind: "golden", ttl: 2 } };
    const a = step(s);
    expect(a.food.kind).toBe("golden");
    expect(a.food.ttl).toBe(1);
    const b = step(a);
    expect(b.food.kind).toBe("lantern");
    expect(b.score).toBe(s.score);
    expect(b.events.some((e) => e.type === "expire")).toBe(true);
  });

  it("每隔幾顆燈籠就會掛出一顆限時金燈籠", () => {
    const s = eatMany(createGame({ mode: "endless", seed: 8 }), GOLDEN_EVERY);
    expect(s.food.kind).toBe("golden");
    expect(s.food.ttl).toBe(GOLDEN_TTL);
  });
});

describe("關卡模式", () => {
  it("吃滿目標就過關：關卡＋1、進度歸零、蛇重置、攤位變多、分數保留", () => {
    const s = createGame({ mode: "levels", level: 1, seed: 6 });
    const cleared = eatMany(s, LEVELS[0].target);
    expect(cleared.level).toBe(2);
    expect(cleared.eaten).toBe(0);
    expect(cleared.target).toBe(LEVELS[1].target);
    expect(cleared.snake).toHaveLength(START_LENGTH);
    expect(cleared.dir).toBe("E");
    expect(cleared.walls.length).toBeGreaterThan(0);
    expect(cleared.score).toBeGreaterThan(LEVELS[0].target * LANTERN_SCORE);
    expect(cleared.events.some((e) => e.type === "level" && e.level === 2)).toBe(true);
    expect(getOutcome(cleared)).toBe("playing");
  });

  it("過完最後一關就是通關", () => {
    const s = createGame({ mode: "levels", level: LEVELS.length, seed: 6 });
    const won = eatMany(s, LEVELS.at(-1).target);
    expect(getOutcome(won)).toBe("won");
    expect(won.reason).toBe("campaign");
    expect(won.events.some((e) => e.type === "win")).toBe(true);
    expect(step(won)).toEqual(won);
  });

  it("過關後速度回到新關卡的基準值", () => {
    const cleared = eatMany(createGame({ mode: "levels", level: 1, seed: 6 }), LEVELS[0].target);
    expect(speedFor(cleared)).toBe(LEVELS[1].tickMs);
  });
});

describe("無盡模式", () => {
  it("吃再多也不會過關，只會一直長", () => {
    const s = eatMany(createGame({ mode: "endless", seed: 9 }), 6);
    expect(getOutcome(s)).toBe("playing");
    expect(s.level).toBe(1);
    expect(s.snake.length).toBe(START_LENGTH + 6);
  });

  it("每吃幾顆就多冒出攤位，但不會蓋在蛇身或燈籠上", () => {
    const s = eatMany(createGame({ mode: "endless", seed: 9 }), ENDLESS_WALL_EVERY);
    expect(s.walls.length).toBeGreaterThanOrEqual(1);
    expect(s.walls.length).toBeLessThanOrEqual(ENDLESS_WALL_BATCH);
    for (const w of s.walls) {
      expect(snakeAt(s, w.x, w.y)).toBe(false);
      expect(cellKey(w)).not.toBe(cellKey(s.food));
    }
  });

  it("新冒出的攤位不會把燈籠圍到走不到，數量也有上限", () => {
    let s = createGame({ mode: "endless", seed: 15 });
    for (let i = 0; i < ENDLESS_WALL_EVERY * 6 && getOutcome(s) === "playing"; i += 1) {
      s = eatMany(s, 1);
      if (s.food) expect(reachableFrom(s, s.snake[0]).has(cellKey(s.food))).toBe(true);
    }
    expect(s.walls.length).toBeLessThanOrEqual(WALL_CAP);
  });
});

describe("狀態輸出", () => {
  it("summarize 給 UI 需要的欄位，而且跟 getOutcome 一致", () => {
    const v = summarize(createGame({ mode: "levels", level: 2, seed: 5 }));
    expect(v).toEqual(expect.objectContaining({
      mode: "levels",
      level: 2,
      levelName: LEVELS[1].name,
      target: LEVELS[1].target,
      eaten: 0,
      length: START_LENGTH,
      score: 0,
      outcome: "playing",
    }));
    expect(v.remaining).toBe(LEVELS[1].target);
    expect(v.tickMs).toBe(LEVELS[1].tickMs);
    expect(typeof v.msg).toBe("string");
  });

  it("state 存進 KV 再讀回來還能接著玩", () => {
    const s = stepN(createGame({ mode: "endless", seed: 17 }), 3);
    const revived = JSON.parse(JSON.stringify(s));
    expect(revived).toEqual(s);
    expect(step(revived)).toEqual(step(s));
  });

  it("整條街被蛇塞滿就算贏，不會卡在沒地方掛燈籠", () => {
    const path = [];
    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) path.push({ x: y % 2 ? GRID_W - 1 - x : x, y });
    }
    const last = path.pop();
    const s = {
      ...createGame({ mode: "endless", seed: 2 }),
      snake: path.reverse(),
      dir: "E",
      walls: [],
      food: { ...last, kind: "lantern", ttl: null },
    };
    expect(s.snake[0]).toEqual({ x: GRID_W - 2, y: GRID_H - 1 });
    const won = step(s);
    expect(getOutcome(won)).toBe("won");
    expect(won.reason).toBe("full");
    expect(won.food).toBe(null);
  });
});
