import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { comparePlates } from "../src/blot.js";
import { readSheet } from "../src/sheet.js";

const PAPER = [244, 241, 234, 255];
const MARK = [20, 80, 160, 255];
const BLOT = [176, 58, 28, 255];

function solid(width: number, height: number, rgba: number[]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgba[0];
    png.data[i + 1] = rgba[1];
    png.data[i + 2] = rgba[2];
    png.data[i + 3] = rgba[3];
  }
  return PNG.sync.write(png);
}

function dot(buf: Buffer, x: number, y: number, rgba: number[]): Buffer {
  const png = PNG.sync.read(buf);
  const i = (y * png.width + x) * 4;
  png.data[i] = rgba[0];
  png.data[i + 1] = rgba[1];
  png.data[i + 2] = rgba[2];
  png.data[i + 3] = rgba[3];
  return PNG.sync.write(png);
}

function pixel(buf: Buffer, x: number, y: number): number[] {
  const png = PNG.sync.read(buf);
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

describe("comparePlates", () => {
  const limit = readSheet("glance.sheet.json").driftLimit;

  it("reads two matching plates as no drift", () => {
    const plate = solid(6, 4, PAPER);
    const drift = comparePlates(plate, plate, 0);
    expect(drift).toMatchObject({
      passed: true,
      ratio: 0,
      changed: 0,
      pixels: 24,
      mismatch: false,
    });
    expect(drift.blot.subarray(0, 4).toString("hex")).toBe("89504e47");
    expect(pixel(drift.blot, 5, 3)).toEqual(PAPER);
  });

  it("stays under the drift limit when one pixel moves", () => {
    const kept = solid(32, 16, PAPER);
    const fresh = dot(kept, 3, 4, MARK);
    const drift = comparePlates(kept, fresh, limit);
    expect(drift.mismatch).toBe(false);
    expect(drift.changed).toBe(1);
    expect(drift.pixels).toBe(512);
    expect(drift.ratio).toBe(1 / 512);
    expect(drift.passed).toBe(true);
    expect(pixel(drift.blot, 3, 4)).toEqual(BLOT);
    expect(pixel(drift.blot, 0, 0)).toEqual(PAPER);
  });

  it("goes over the limit when more pixels move", () => {
    const kept = solid(32, 16, PAPER);
    const fresh = dot(dot(kept, 3, 4, MARK), 8, 1, MARK);
    const drift = comparePlates(kept, fresh, limit);
    expect(drift.changed).toBe(2);
    expect(drift.ratio).toBe(2 / 512);
    expect(drift.passed).toBe(false);
    expect(pixel(drift.blot, 3, 4)).toEqual(BLOT);
    expect(pixel(drift.blot, 8, 1)).toEqual(BLOT);
    expect(pixel(drift.blot, 1, 1)).toEqual(PAPER);
  });

  it("passes when the drift lands on the limit", () => {
    const kept = solid(8, 8, PAPER);
    const drift = comparePlates(kept, dot(kept, 0, 0, MARK), 1 / 64);
    expect(drift.ratio).toBe(1 / 64);
    expect(drift.passed).toBe(true);
  });

  it("treats a size mismatch as a full drift", () => {
    const drift = comparePlates(solid(4, 4, PAPER), solid(5, 4, MARK), 1);
    expect(drift).toMatchObject({
      passed: false,
      ratio: 1,
      changed: 20,
      pixels: 20,
      mismatch: true,
    });
    const png = PNG.sync.read(drift.blot);
    expect(png.width).toBe(5);
    expect(png.height).toBe(4);
    expect(pixel(drift.blot, 0, 0)).toEqual(BLOT);
    expect(pixel(drift.blot, 4, 3)).toEqual(BLOT);

    const smaller = comparePlates(solid(5, 4, PAPER), solid(4, 2, PAPER), 0);
    expect(smaller.mismatch).toBe(true);
    expect(smaller.passed).toBe(false);
    expect(smaller.pixels).toBe(8);
    expect(PNG.sync.read(smaller.blot).height).toBe(2);
  });

  it("counts a change that only touches alpha", () => {
    const kept = solid(2, 2, PAPER);
    const fresh = dot(kept, 1, 1, [244, 241, 234, 200]);
    const drift = comparePlates(kept, fresh, 0);
    expect(drift.changed).toBe(1);
    expect(drift.passed).toBe(false);
    expect(drift.mismatch).toBe(false);
    expect(pixel(drift.blot, 1, 1)).toEqual(BLOT);
  });

  it("reads the plates from files", () => {
    const dir = mkdtempSync(join(tmpdir(), "squintle-"));
    try {
      const kept = join(dir, "kept.png");
      const fresh = join(dir, "fresh.png");
      writeFileSync(kept, solid(3, 3, PAPER));
      writeFileSync(fresh, dot(solid(3, 3, PAPER), 1, 1, MARK));
      const drift = comparePlates(kept, fresh, 0);
      expect(drift.changed).toBe(1);
      expect(drift.passed).toBe(false);
      expect(pixel(drift.blot, 1, 1)).toEqual(BLOT);
      expect(pixel(drift.blot, 0, 0)).toEqual(PAPER);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores a nudge that stays inside the grain", () => {
    const kept = solid(4, 4, PAPER);
    const fresh = dot(kept, 2, 2, [246, 243, 234, 255]);
    const drift = comparePlates(kept, fresh, 0, 2);
    expect(drift.changed).toBe(0);
    expect(drift.ratio).toBe(0);
    expect(drift.passed).toBe(true);
    expect(pixel(drift.blot, 2, 2)).toEqual([246, 243, 234, 255]);
  });

  it("counts a channel that steps past the grain", () => {
    const kept = solid(4, 4, PAPER);
    const fresh = dot(kept, 2, 2, [246, 250, 234, 255]);
    const drift = comparePlates(kept, fresh, 0, 2);
    expect(drift.changed).toBe(1);
    expect(drift.passed).toBe(false);
    expect(pixel(drift.blot, 2, 2)).toEqual(BLOT);
    expect(pixel(drift.blot, 0, 0)).toEqual(PAPER);
  });
});
