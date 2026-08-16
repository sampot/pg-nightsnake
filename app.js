import {
  GRID_H,
  GRID_W,
  LEVELS,
  createGame,
  getOutcome,
  speedFor,
  step,
  summarize,
  turn,
} from "./game.js";
import { GameAudio } from "./audio.js";
import { loadProgress, saveProgress } from "./persist.js";

const $ = (q) => document.querySelector(q);
const audio = new GameAudio();

/** assets/images/night.png 的欄位（每格 64px）。 */
const SPRITE = {
  ground: 0,
  grate: 1,
  lantern: 2,
  golden: 3,
  parasol: 4,
  cart: 5,
  head: 6,
  glowWarm: 7,
  glowGold: 8,
  spark: 9,
};
const SPRITE_PX = 64;

const SNAKE_DARK = "#1c2b28";
const SNAKE_BODY = ["#2aa377", "#22855f"];
const SNAKE_EDGE = "#43e1b3";

const HEAD_ANGLE = { E: 0, S: Math.PI / 2, W: Math.PI, N: -Math.PI / 2 };
const KEY_TO_DIR = {
  ArrowUp: "N", ArrowDown: "S", ArrowLeft: "W", ArrowRight: "E",
  w: "N", s: "S", a: "W", d: "E", W: "N", S: "S", A: "W", D: "E",
};

const atlas = new Image();
let atlasReady = false;
atlas.src = "./assets/images/night.png";
atlas.decode().then(() => {
  atlasReady = true;
  ground = null;
}).catch(() => {});

const board = $("#stage");
const ctx = board.getContext("2d");

let progress = { best: { levels: 0, endless: 0 }, unlocked: 1, mode: "levels", muted: false };
let mode = "levels";
let startLevel = 1;

let state = null;
let prevSnake = null;
let running = false;
let paused = false;
let ready = false;
let readyLeft = 0;
let acc = 0;
let tickPart = 0;
let lastFrame = 0;
let clock = 0;
let shake = 0;
let particles = [];

let cell = 24;
let size = 360;
let ground = null;
let groundKey = "";

/* ── 尺寸與底圖 ───────────────────────────────────────── */

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const width = Math.max(200, Math.round(board.getBoundingClientRect().width));
  if (board.width !== Math.round(width * dpr)) {
    board.width = Math.round(width * dpr);
    board.height = Math.round(width * dpr);
    board.style.height = `${width}px`;
  }
  size = width;
  cell = width / GRID_W;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

function sprite(target, index, x, y, w, h) {
  if (!atlasReady) return;
  target.drawImage(atlas, index * SPRITE_PX, 0, SPRITE_PX, SPRITE_PX, x, y, w, h);
}

/** 地面只在尺寸或關卡變動時重畫一次，之後每幀只是貼上去。 */
function buildGround() {
  if (!atlasReady) return;
  const wanted = `${Math.round(size)}:${state ? state.level : 0}:${state ? state.mode : ""}`;
  if (ground && groundKey === wanted) return;
  groundKey = wanted;
  ground = document.createElement("canvas");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  ground.width = Math.round(size * dpr);
  ground.height = Math.round(size * dpr);
  const g = ground.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = false;

  g.fillStyle = "#171029";
  g.fillRect(0, 0, size, size);
  for (let y = 0; y < GRID_H; y += 1) {
    for (let x = 0; x < GRID_W; x += 1) {
      sprite(g, SPRITE.ground, x * cell, y * cell, cell + 1, cell + 1);
      if ((x * 7 + y * 13) % 17 === 0) {
        g.globalAlpha = 0.4;
        sprite(g, SPRITE.grate, x * cell, y * cell, cell + 1, cell + 1);
        g.globalAlpha = 1;
      }
    }
  }

  // 夜色：整片壓暗，再補幾攤暖色燈光。
  g.fillStyle = "rgba(20, 10, 38, 0.58)";
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = "lighter";
  for (const [fx, fy, r, a] of [[0.2, 0.16, 0.42, 0.1], [0.82, 0.34, 0.36, 0.08], [0.5, 0.86, 0.44, 0.09]]) {
    const pool = g.createRadialGradient(size * fx, size * fy, 0, size * fx, size * fy, size * r);
    pool.addColorStop(0, `rgba(255, 168, 84, ${a})`);
    pool.addColorStop(1, "rgba(255, 168, 84, 0)");
    g.fillStyle = pool;
    g.fillRect(0, 0, size, size);
  }
  g.globalCompositeOperation = "source-over";

  g.strokeStyle = "rgba(255, 255, 255, 0.045)";
  g.lineWidth = 1;
  for (let i = 1; i < GRID_W; i += 1) {
    g.beginPath();
    g.moveTo(Math.round(i * cell) + 0.5, 0);
    g.lineTo(Math.round(i * cell) + 0.5, size);
    g.stroke();
    g.beginPath();
    g.moveTo(0, Math.round(i * cell) + 0.5);
    g.lineTo(size, Math.round(i * cell) + 0.5);
    g.stroke();
  }
}

/* ── 繪製 ─────────────────────────────────────────────── */

const px = (v) => (v + 0.5) * cell;

function glow(index, x, y, radius, alpha) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha;
  sprite(ctx, index, x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
}

function drawWalls() {
  for (const w of state.walls) {
    const x = w.x * cell;
    const y = w.y * cell;
    glow(SPRITE.glowWarm, px(w.x), px(w.y) + cell * 0.1, cell * 0.9, 0.28);
    sprite(ctx, (w.x * 3 + w.y * 5) % 2 ? SPRITE.cart : SPRITE.parasol, x, y, cell, cell);
  }
}

function drawFood() {
  const food = state.food;
  if (!food) return;
  const gold = food.kind === "golden";
  const pulse = 0.5 + 0.5 * Math.sin(clock / 260);
  const bob = Math.sin(clock / 320) * cell * 0.05;
  const cx = px(food.x);
  const cy = px(food.y) + bob;

  glow(gold ? SPRITE.glowGold : SPRITE.glowWarm, cx, cy, cell * (1.5 + pulse * 0.25), gold ? 0.62 : 0.5);
  sprite(ctx, gold ? SPRITE.golden : SPRITE.lantern, cx - cell * 0.46, cy - cell * 0.5, cell * 0.92, cell);

  if (gold) {
    const left = Math.max(0, food.ttl) / 42;
    ctx.save();
    ctx.strokeStyle = left > 0.3 ? "#ffd166" : "#e4614f";
    ctx.lineWidth = Math.max(2, cell * 0.09);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.62, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** 頭尾之間補內插，讓固定 tick 看起來是連續滑行。 */
function snakePoints() {
  const cur = state.snake;
  const t = ready ? 0 : tickPart;
  return cur.map((c, i) => {
    const from = prevSnake && prevSnake[i] ? prevSnake[i] : c;
    return { x: px(from.x + (c.x - from.x) * t), y: px(from.y + (c.y - from.y) * t) };
  });
}

function drawSnake() {
  const pts = snakePoints();
  if (!pts.length) return;
  const n = pts.length;
  const widthAt = (i) => cell * (0.8 - 0.34 * (n > 1 ? i / (n - 1) : 0));

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const pass of ["edge", "body"]) {
    for (let i = n - 1; i > 0; i -= 1) {
      const w = widthAt(i);
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i - 1].x, pts[i - 1].y);
      if (pass === "edge") {
        ctx.strokeStyle = SNAKE_DARK;
        ctx.lineWidth = w + Math.max(2, cell * 0.16);
      } else {
        ctx.strokeStyle = SNAKE_BODY[i % 2];
        ctx.lineWidth = w;
      }
      ctx.stroke();
    }
    if (pass === "edge") {
      ctx.fillStyle = SNAKE_DARK;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, widthAt(0) / 2 + Math.max(1, cell * 0.08), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 背脊高光。
  ctx.strokeStyle = SNAKE_EDGE;
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = Math.max(1, cell * 0.1);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < n; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const head = pts[0];
  glow(SPRITE.glowGold, head.x, head.y, cell * 0.85, 0.12);
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(HEAD_ANGLE[state.dir] ?? 0);
  const hs = cell * 1.12;
  sprite(ctx, SPRITE.head, -hs / 2, -hs / 2, hs, hs);
  ctx.restore();

  if (getOutcome(state) === "lost") {
    ctx.fillStyle = "rgba(228, 97, 79, 0.75)";
    ctx.beginPath();
    ctx.arc(head.x, head.y, cell * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function burst(x, y, kind) {
  const count = kind === "golden" ? 18 : 11;
  for (let i = 0; i < count; i += 1) {
    const a = (Math.PI * 2 * i) / count + Math.random();
    const speed = cell * (0.02 + Math.random() * 0.035);
    particles.push({
      x: px(x), y: px(y),
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: 1, ttl: 420 + Math.random() * 260,
      size: cell * (0.28 + Math.random() * 0.3),
      gold: kind === "golden",
    });
  }
  if (particles.length > 220) particles = particles.slice(-220);
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= dt / p.ttl;
  }
  particles = particles.filter((p) => p.life > 0);
}

function drawParticles() {
  if (!particles.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life) * (p.gold ? 0.95 : 0.75);
    const s = p.size * (0.6 + p.life * 0.7);
    sprite(ctx, SPRITE.spark, p.x - s / 2, p.y - s / 2, s, s);
  }
  ctx.restore();
}

function banner(title, sub) {
  ctx.save();
  ctx.fillStyle = "rgba(10, 6, 20, 0.62)";
  ctx.fillRect(0, size * 0.36, size, size * 0.28);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd8a3";
  ctx.font = `700 ${Math.round(size * 0.075)}px "Noto Sans TC", system-ui, sans-serif`;
  ctx.fillText(title, size / 2, size * 0.49);
  if (sub) {
    ctx.fillStyle = "#c9b6e0";
    ctx.font = `${Math.round(size * 0.04)}px "Noto Sans TC", system-ui, sans-serif`;
    ctx.fillText(sub, size / 2, size * 0.575);
  }
  ctx.restore();
}

function draw() {
  if (!state) return;
  resize();
  buildGround();
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shake *= 0.86;
    if (shake < 0.4) shake = 0;
  }
  if (ground) ctx.drawImage(ground, 0, 0, size, size);
  drawWalls();
  drawFood();
  drawSnake();
  drawParticles();
  ctx.restore();

  if (ready) banner("準備", "按方向鍵或滑動起步");
  else if (paused && getOutcome(state) === "playing") banner("暫停", "再按一次繼續");
}

/* ── 迴圈 ─────────────────────────────────────────────── */

function advance() {
  prevSnake = state.snake;
  state = step(state);
  for (const e of state.events) {
    if (e.type === "eat") {
      audio.play(e.kind === "golden" ? "golden" : "eat", { volume: e.kind === "golden" ? 0.6 : 0.4 });
      burst(e.x, e.y, e.kind);
    } else if (e.type === "expire") {
      audio.play("turn", { volume: 0.22 });
    } else if (e.type === "stall") {
      audio.play("stall", { volume: 0.32 });
    } else if (e.type === "level") {
      audio.play("level", { volume: 0.5 });
      prevSnake = null;
      particles = [];
      ground = null;
      progress.unlocked = Math.max(progress.unlocked ?? 1, e.level);
      void saveProgress(progress);
      startReady();
    } else if (e.type === "lose") {
      audio.play("crash", { volume: 0.6 });
      shake = cell * 0.55;
    } else if (e.type === "win") {
      audio.play("level", { volume: 0.6 });
    }
  }
  renderHud();
  setMessage();
  if (getOutcome(state) !== "playing") finish();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(120, lastFrame ? now - lastFrame : 16));
  lastFrame = now;
  clock += dt;

  if (running && !paused) {
    if (ready) {
      readyLeft -= dt;
      if (readyLeft <= 0) ready = false;
    } else {
      const tick = speedFor(state);
      acc += dt;
      let guard = 4;
      while (acc >= tick && guard > 0 && getOutcome(state) === "playing") {
        acc -= tick;
        guard -= 1;
        advance();
      }
      tickPart = getOutcome(state) === "playing" ? Math.min(1, acc / tick) : 1;
    }
  }
  updateParticles(dt);
  draw();
}

/* ── HUD ──────────────────────────────────────────────── */

function chip(label, value, sub = "", tone = "") {
  return `<div class="chip ${tone}"><b>${label}</b><span>${value}</span>${sub ? `<i>${sub}</i>` : ""}</div>`;
}

function renderHud() {
  const v = summarize(state);
  const best = progress.best[state.mode] ?? 0;
  const perSec = (1000 / v.tickMs).toFixed(1);
  $("#hud").innerHTML = [
    v.mode === "levels"
      ? chip("關卡", `${v.level}/${v.levels}`, v.levelName)
      : chip("模式", "無盡", `攤位 ${v.stalls}`),
    v.mode === "levels"
      ? chip("燈籠", `${v.eaten}/${v.target}`, `還差 ${v.remaining}`, v.remaining <= 2 ? "good" : "")
      : chip("燈籠", v.totalEaten, `攤位 ${v.stalls}`),
    chip("分數", v.score, `最佳 ${best}`, v.score > best ? "good" : ""),
    chip("長度", v.length, `${perSec} 格/秒`, v.golden !== null ? "hot" : ""),
  ].join("");
}

function setMessage() {
  const el = $("#msg");
  const v = summarize(state);
  el.textContent = v.msg;
  el.className = `msg ${
    v.outcome === "lost" ? "bad" : v.msg.startsWith("金燈籠！") ? "gold" : v.outcome === "won" ? "good" : ""
  }`;
}

/* ── 頁內確認（不使用瀏覽器原生 dialog） ───────────────── */

let confirmResolve = null;

function askConfirm({ title, body, okLabel = "確定", cancelLabel = "取消" }) {
  $("#confirm-title").textContent = title;
  $("#confirm-body").textContent = body;
  $("#confirm-ok").textContent = okLabel;
  $("#confirm-cancel").textContent = cancelLabel;
  $("#confirm").hidden = false;
  $("#confirm-cancel").focus();
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

function closeConfirm(answer) {
  $("#confirm").hidden = true;
  const resolve = confirmResolve;
  confirmResolve = null;
  if (resolve) resolve(answer);
}

$("#confirm-ok").onclick = () => closeConfirm(true);
$("#confirm-cancel").onclick = () => closeConfirm(false);
$("#confirm").onclick = (e) => {
  if (e.target === $("#confirm")) closeConfirm(false);
};

/* ── 操作 ─────────────────────────────────────────────── */

function flashPad(dirKey) {
  const btn = document.querySelector(`.pad-btn[data-dir="${dirKey}"]`);
  if (!btn) return;
  btn.classList.add("lit");
  setTimeout(() => btn.classList.remove("lit"), 110);
}

function input(dirKey) {
  if (!running || paused || getOutcome(state) !== "playing") return;
  if (ready) {
    ready = false;
    acc = 0;
  }
  const next = turn(state, dirKey);
  if (next === state) return;
  state = next;
  flashPad(dirKey);
  audio.play("turn", { volume: 0.16 });
}

function setPaused(on) {
  if (!running || getOutcome(state) !== "playing") return;
  paused = on;
  acc = 0;
  audio.duck(on);
  $("#pause").setAttribute("aria-pressed", String(on));
  $("#pause").textContent = on ? "▶" : "॥";
}

function startReady() {
  ready = true;
  readyLeft = 1500;
  acc = 0;
  tickPart = 0;
}

for (const btn of document.querySelectorAll(".pad-btn[data-dir]")) {
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    input(btn.dataset.dir);
  });
}

$("#pause").onclick = () => setPaused(!paused);

document.addEventListener("keydown", (e) => {
  if ($("#game").hidden || !$("#confirm").hidden || !$("#overlay").hidden) return;
  if (e.key === " ") {
    e.preventDefault();
    setPaused(!paused);
    return;
  }
  const dirKey = KEY_TO_DIR[e.key];
  if (!dirKey) return;
  e.preventDefault();
  input(dirKey);
});

let swipeFrom = null;
board.addEventListener("pointerdown", (e) => {
  swipeFrom = { x: e.clientX, y: e.clientY };
});
board.addEventListener("pointerup", (e) => {
  if (!swipeFrom) return;
  const dx = e.clientX - swipeFrom.x;
  const dy = e.clientY - swipeFrom.y;
  swipeFrom = null;
  if (Math.abs(dx) < 16 && Math.abs(dy) < 16) return;
  input(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "E" : "W") : dy > 0 ? "S" : "N");
});
board.addEventListener("pointercancel", () => { swipeFrom = null; });

document.addEventListener("visibilitychange", () => {
  if (document.hidden) setPaused(true);
});
addEventListener("blur", () => setPaused(true));
addEventListener("resize", () => { ground = null; });

/* ── 結局 ─────────────────────────────────────────────── */

const LOSE_COPY = {
  wall: ["撞上圍籬", "夜市有邊界，貼著牆走要提早轉彎。"],
  stall: ["撞進攤位", "攤位是死路，別讓自己被夾在攤位跟身體中間。"],
  self: ["咬到自己", "身體越長越難掉頭，沿著邊繞比抄近路安全。"],
};

async function finish() {
  running = false;
  tickPart = 1;
  const v = summarize(state);
  const won = v.outcome === "won";
  progress.best[state.mode] = Math.max(progress.best[state.mode] ?? 0, v.score);
  if (state.mode === "levels") progress.unlocked = Math.max(progress.unlocked ?? 1, v.level);
  await saveProgress(progress);

  const [title, body] = won
    ? v.reason === "full"
      ? ["整條街都是你", "蛇長到把夜市塞滿，已經沒有地方掛燈籠了。"]
      : ["巡燈完成", "六關的燈全被你吞光，夜市可以打烊了。"]
    : LOSE_COPY[v.reason] ?? ["結束了", ""];

  audio.play(won ? "level" : "over", { volume: 0.55 });
  $("#overlay-title").textContent = title;
  $("#overlay-body").textContent = body;
  $("#overlay-stats").innerHTML = [
    ["模式", v.mode === "levels" ? `六關巡燈（第 ${v.level} 關）` : "無盡夜行"],
    ["吃下燈籠", v.totalEaten],
    ["蛇身長度", v.length],
    ["分數", v.score],
    ["本機最佳", progress.best[state.mode]],
  ].map(([k, val]) => `<li><span>${k}</span><b>${val}</b></li>`).join("");

  const actions = $("#overlay-actions");
  actions.innerHTML = "";
  const again = document.createElement("button");
  again.className = "primary";
  again.textContent = "再來一局";
  again.onclick = () => {
    $("#overlay").hidden = true;
    newGame();
  };
  const lobby = document.createElement("button");
  lobby.className = "ghost";
  lobby.textContent = "回大廳";
  lobby.onclick = () => {
    $("#overlay").hidden = true;
    toLobby();
  };
  actions.append(again, lobby);
  $("#overlay").hidden = false;
  again.focus();
}

/* ── 場次 ─────────────────────────────────────────────── */

function newGame() {
  state = createGame({ mode, seed: Date.now() % 99991, level: mode === "levels" ? startLevel : 1 });
  prevSnake = null;
  particles = [];
  shake = 0;
  running = true;
  paused = false;
  $("#pause").setAttribute("aria-pressed", "false");
  $("#pause").textContent = "॥";
  ground = null;
  startReady();
  renderHud();
  setMessage();
  draw();
}

function enterGame() {
  $("#lobby").hidden = true;
  $("#game").hidden = false;
  newGame();
}

function toLobby() {
  running = false;
  $("#game").hidden = true;
  $("#lobby").hidden = false;
  renderLobby();
}

$("#quit").onclick = async () => {
  const wasPaused = paused;
  setPaused(true);
  const ok = await askConfirm({
    title: "現在收攤？",
    body: "這一局的分數不會列入紀錄，最佳成績仍然保留。",
    okLabel: "收攤",
    cancelLabel: "繼續玩",
  });
  if (!ok) {
    if (!wasPaused) setPaused(false);
    return;
  }
  toLobby();
};

/* ── 大廳 ─────────────────────────────────────────────── */

function renderLobby() {
  for (const btn of document.querySelectorAll("#mode-pick button")) {
    btn.setAttribute("aria-checked", String(btn.dataset.mode === mode));
  }
  $("#level-field").hidden = mode !== "levels";
  const unlocked = Math.min(LEVELS.length, Math.max(1, progress.unlocked ?? 1));
  if (startLevel > unlocked) startLevel = unlocked;

  const pick = $("#level-pick");
  pick.innerHTML = "";
  LEVELS.forEach((lv, i) => {
    const n = i + 1;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", String(startLevel === n));
    btn.disabled = n > unlocked;
    btn.innerHTML = `<b>第 ${n} 關</b>${lv.name}`;
    btn.onclick = () => {
      startLevel = n;
      audio.play("click", { volume: 0.3 });
      renderLobby();
    };
    pick.append(btn);
  });
  $("#level-hint").textContent = unlocked < LEVELS.length ? `已解鎖到第 ${unlocked} 關` : "全關解鎖";
  $("#best-levels").textContent = progress.best.levels ?? 0;
  $("#best-endless").textContent = progress.best.endless ?? 0;
}

for (const btn of document.querySelectorAll("#mode-pick button")) {
  btn.onclick = () => {
    mode = btn.dataset.mode;
    progress.mode = mode;
    audio.play("click", { volume: 0.3 });
    renderLobby();
  };
}

$("#start").onclick = async () => {
  await audio.start();
  audio.setEnabled(!progress.muted);
  enterGame();
};

$("#sound").onclick = () => {
  const on = $("#sound").getAttribute("aria-pressed") !== "true";
  $("#sound").setAttribute("aria-pressed", String(on));
  $("#sound").textContent = on ? "♫ 音效" : "♪ 靜音";
  audio.setEnabled(on);
  progress.muted = !on;
  void saveProgress(progress);
};

/* ── 啟動 ─────────────────────────────────────────────── */

async function boot() {
  const saved = await loadProgress();
  progress = {
    best: { levels: 0, endless: 0, ...(saved.best ?? {}) },
    unlocked: saved.unlocked ?? 1,
    mode: saved.mode === "endless" ? "endless" : "levels",
    muted: !!saved.muted,
  };
  mode = progress.mode;
  startLevel = Math.min(LEVELS.length, Math.max(1, progress.unlocked));
  if (progress.muted) {
    $("#sound").setAttribute("aria-pressed", "false");
    $("#sound").textContent = "♪ 靜音";
    audio.setEnabled(false);
  }
  renderLobby();
  requestAnimationFrame(frame);
}

void boot();
