import { describe, expect, it } from "vitest";
import { createGame, applyAction, step, getOutcome, summarize } from "./game.js";

describe("pg-nightsnake", () => {
  it("creates levels mode", () => {
    const s = createGame({ mode: "levels", seed: 1 });
    expect(getOutcome(s)).toBe("playing");
    expect(summarize(s).level).toBe(1);
  });

  it("rejects immediate reverse", () => {
    let s = createGame({ seed: 2 });
    expect(s.dir).toBe("E");
    s = applyAction(s, "W");
    expect(s.nextDir).toBe("E");
    s = applyAction(s, "N");
    expect(s.nextDir).toBe("N");
  });

  it("steps move the head", () => {
    const s = createGame({ seed: 3 });
    const x0 = s.body[0].x;
    for (let i = 0; i < 20; i++) step(s);
    expect(s.body[0].x).not.toBe(x0);
  });
});
