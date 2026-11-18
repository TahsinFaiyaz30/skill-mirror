import { describe, expect, it } from "vitest";
import { COMPETENCY_KEYS, PHASES } from "@/lib/config/taxonomy";

describe("shared vocabulary", () => {
  it("preserves phase order and unique competency keys", () => {
    expect(PHASES[0]).toBe("intro_calibration");
    expect(PHASES.at(-1)).toBe("close");
    expect(new Set(COMPETENCY_KEYS).size).toBe(25);
  });
});
