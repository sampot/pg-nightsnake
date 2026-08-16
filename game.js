/** pg-nightsnake — 燈籠蛇 (蛇) */

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function mulberry32(a) {
  return function() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function deep(o) { return JSON.parse(JSON.stringify(o)); }


export function createGame({ seed = 1, mode = "levels" } = {}) {
  return { seed, mode, x: 5, y: 5, dir: "E", body: [[5,5],[4,5],[3,5]], food: [8,5], grow: 0, score: 0, level: 1, outcome: "playing", msg: "方向移動，吃燈籠。" };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ["N", "E", "S", "W"];
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  const opp = { N:"S", S:"N", E:"W", W:"E" };
  if (opp[action] !== s.dir) s.dir = action;
  const d = { N:[0,-1], S:[0,1], E:[1,0], W:[-1,0] }[s.dir];
  const nx = s.x + d[0], ny = s.y + d[1];
  if (nx < 0 || ny < 0 || nx > 11 || ny > 11) { s.outcome = "lost"; s.msg = "撞牆"; return s; }
  if (s.body.some(([bx,by]) => bx===nx && by===ny)) { s.outcome = "lost"; s.msg = "咬到自己"; return s; }
  s.x = nx; s.y = ny;
  s.body.unshift([nx,ny]);
  if (nx === s.food[0] && ny === s.food[1]) {
    s.score += 10; s.grow += 1;
    s.food = [Math.floor(Math.random()*12), Math.floor(Math.random()*12)];
    s.msg = "吃到燈籠！";
    if (s.score >= s.level * 40) { s.level++; s.msg = "關卡 "+s.level; }
    if (s.level >= 5) { s.outcome = "won"; s.msg = "燈籠蛇達人"; }
  } else if (s.grow > 0) s.grow--; else s.body.pop();
  return s;
}
export function summarize(s) {
  return { score: s.score, level: s.level, len: s.body.length, head: [s.x,s.y], food: s.food, msg: s.msg, outcome: s.outcome };
}
export function getOutcome(s) { return s.outcome; }

