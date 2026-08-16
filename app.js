import { createGame, applyAction, step, summarize, getOutcome, COLS, ROWS } from "./game.js";
import { GameAudio } from "./audio.js";
import { loadProgress, saveProgress } from "./persist.js";

const canvas = document.querySelector("#stage");
const ctx = canvas.getContext("2d");
const audio = new GameAudio();
const cell = 24;
canvas.width = COLS * cell;
canvas.height = ROWS * cell;

let state = createGame({ mode: "levels" });
let progress = {};
const $ = (s) => document.querySelector(s);

const dirs = { ArrowUp: "N", ArrowDown: "S", ArrowLeft: "W", ArrowRight: "E", w: "N", s: "S", a: "W", d: "E" };
addEventListener("keydown", (e) => {
  const d = dirs[e.key];
  if (!d) return;
  e.preventDefault();
  state = applyAction(state, d);
  audio.play("soft");
});

for (const [id, d] of [
  ["n", "N"],
  ["e", "E"],
  ["s", "S"],
  ["w", "W"],
]) {
  document.querySelector(`#d-${id}`).addEventListener("pointerdown", () => {
    state = applyAction(state, d);
    audio.play("click");
  });
}

function draw() {
  ctx.fillStyle = "#1a0f08";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if ((x + y) % 2 === 0) {
        ctx.fillStyle = "#24160c";
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }
  // food lantern
  ctx.fillStyle = "#ff9e00";
  ctx.beginPath();
  ctx.arc(state.food.x * cell + cell / 2, state.food.y * cell + cell / 2, cell * 0.35, 0, Math.PI * 2);
  ctx.fill();
  state.body.forEach((p, i) => {
    ctx.fillStyle = i === 0 ? "#ffe08a" : "#ffb703";
    ctx.fillRect(p.x * cell + 2, p.y * cell + 2, cell - 4, cell - 4);
  });
  const v = summarize(state);
  $("#msg").textContent = v.msg;
  $("#hud").textContent = `關卡 ${v.level} · 分數 ${v.score} · ${v.eaten}/${v.target}`;
  $("#badge").textContent = v.outcome === "playing" ? "進行中" : v.outcome === "won" ? "通關" : "結束";
}

async function persist() {
  const o = getOutcome(state);
  if (o === "playing") return;
  progress.best = Math.max(progress.best || 0, state.score);
  $("#best").textContent = String(progress.best || 0);
  await saveProgress(progress);
}

let acc = 0;
let last = performance.now();
function loop(now) {
  const dt = now - last;
  last = now;
  if (!$("#game").hidden && getOutcome(state) === "playing") {
    acc += dt;
    while (acc > 16) {
      step(state);
      acc -= 16;
    }
    void persist();
  }
  draw();
  requestAnimationFrame(loop);
}

async function boot() {
  progress = await loadProgress();
  $("#best").textContent = String(progress.best || 0);
  $("#sound").addEventListener("click", async () => {
    const on = $("#sound").getAttribute("aria-pressed") !== "true";
    $("#sound").setAttribute("aria-pressed", String(on));
    $("#sound").textContent = on ? "♪ 音樂開" : "♪ 靜音";
    audio.setEnabled(on);
    if (on) await audio.start();
  });
  const start = async (mode) => {
    await audio.start();
    audio.play("ok");
    state = createGame({ mode, seed: Date.now() % 9999 });
    $("#lobby").hidden = true;
    $("#game").hidden = false;
  };
  $("#start-levels").addEventListener("click", () => start("levels"));
  $("#start-endless").addEventListener("click", () => start("endless"));
  $("#again").addEventListener("click", () => {
    audio.play("ok");
    state = createGame({ mode: state.mode, seed: Date.now() % 9999 });
  });
  requestAnimationFrame(loop);
}

boot();
