import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blotPath, freshPath, keptPath, platePath } from "../src/plate-path.js";

describe("platePath", () => {
  it("builds a path from the sight and the aperture", () => {
    expect(platePath("ledge", "example", "desk")).toBe(join("ledge", "example", "desk.png"));
    expect(platePath("ledge", "example", "palm")).toBe(join("ledge", "example", "palm.png"));
    expect(platePath("ledge", "example.com", "lap")).toBe(join("ledge", "example.com", "lap.png"));
  });

  it("keeps a nested ledge", () => {
    expect(platePath(join("out", "kept"), "home", "desk")).toBe(
      join("out", "kept", "home", "desk.png"),
    );
  });

  it("returns the same path every time", () => {
    const first = platePath("ledge", "home", "palm");
    expect(platePath("ledge", "home", "palm")).toBe(first);
  });

  it("splits kept, fresh, and blot under the ledge", () => {
    expect(keptPath("ledge", "home", "desk")).toBe(join("ledge", "kept", "home", "desk.png"));
    expect(freshPath("ledge", "home", "desk")).toBe(join("ledge", "fresh", "home", "desk.png"));
    expect(blotPath("ledge", "home", "palm")).toBe(join("ledge", "blot", "home", "palm.png"));
    expect(keptPath(join("out", "ledge"), "home", "lap")).toBe(
      join("out", "ledge", "kept", "home", "lap.png"),
    );
  });
});
