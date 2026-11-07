import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import {
  approveLedger,
  ledgerPath,
  makeLedger,
  readLedger,
  writeLedger,
} from "../src/ledger.js";
import { blotPath, freshPath, keptPath } from "../src/plate-path.js";
import type { Sheet } from "../src/sheet.js";

const PAPER = [244, 241, 234, 255];
const MARK = [20, 80, 160, 255];
const BLOT = [176, 58, 28, 255];
const RAN = "2026-11-07T00:00:00.000Z";

const dirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "squintle-"));
  dirs.push(dir);
  return dir;
}

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

function put(file: string, buf: Buffer) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
}

function pixel(file: string, x: number, y: number): number[] {
  const png = PNG.sync.read(readFileSync(file));
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

function sheet(ledge: string, driftLimit = 0): Sheet {
  return {
    driftLimit,
    ledge,
    sights: [{ name: "home", url: "http://127.0.0.1:9/" }],
    apertures: [
      { name: "palm", width: 4, height: 4 },
      { name: "desk", width: 4, height: 4 },
    ],
    veils: [],
  };
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

describe("ledgerPath", () => {
  it("sits beside the ledge", () => {
    expect(ledgerPath("ledge")).toBe("ledger.json");
    expect(ledgerPath(join("out", "ledge"))).toBe(join("out", "ledger.json"));
  });
});

describe("makeLedger", () => {
  it("passes when the fresh plate matches the kept one", () => {
    const ledge = scratch();
    const plate = solid(4, 4, PAPER);
    put(keptPath(ledge, "home", "palm"), plate);
    put(freshPath(ledge, "home", "palm"), plate);
    const body = sheet(ledge);
    body.apertures = [{ name: "palm", width: 4, height: 4 }];

    const ledger = makeLedger(body, "glance.sheet.json", RAN);

    expect(ledger).toMatchObject({
      sheet: "glance.sheet.json",
      ledge,
      driftLimit: 0,
      ran: RAN,
      passed: true,
      approved: null,
    });
    expect(ledger.folios).toEqual([
      {
        sight: "home",
        aperture: "palm",
        kept: keptPath(ledge, "home", "palm"),
        fresh: freshPath(ledge, "home", "palm"),
        blot: blotPath(ledge, "home", "palm"),
        ratio: 0,
        changed: 0,
        pixels: 16,
        passed: true,
        mismatch: false,
      },
    ]);
    expect(pixel(blotPath(ledge, "home", "palm"), 0, 0)).toEqual(PAPER);
  });

  it("fails the run when one plate drifts past the limit", () => {
    const ledge = scratch();
    const plate = solid(4, 4, PAPER);
    put(keptPath(ledge, "home", "palm"), plate);
    put(freshPath(ledge, "home", "palm"), plate);
    put(keptPath(ledge, "home", "desk"), plate);
    put(freshPath(ledge, "home", "desk"), dot(plate, 1, 2, MARK));

    const ledger = makeLedger(sheet(ledge, 0), "sheet.json", RAN);

    expect(ledger.passed).toBe(false);
    expect(ledger.folios.map((folio) => [folio.aperture, folio.passed, folio.changed])).toEqual([
      ["palm", true, 0],
      ["desk", false, 1],
    ]);
    expect(ledger.folios[1].mismatch).toBe(false);
    expect(ledger.folios[1].ratio).toBe(1 / 16);
    expect(pixel(blotPath(ledge, "home", "desk"), 1, 2)).toEqual(BLOT);
    expect(pixel(blotPath(ledge, "home", "desk"), 0, 0)).toEqual(PAPER);
  });

  it("passes when the drift sits on the limit", () => {
    const ledge = scratch();
    const plate = solid(4, 4, PAPER);
    put(keptPath(ledge, "home", "palm"), plate);
    put(freshPath(ledge, "home", "palm"), dot(plate, 0, 0, MARK));
    const body = sheet(ledge, 1 / 16);
    body.apertures = [{ name: "palm", width: 4, height: 4 }];

    const ledger = makeLedger(body, "sheet.json", RAN);

    expect(ledger.passed).toBe(true);
    expect(ledger.folios[0].ratio).toBe(1 / 16);
    expect(ledger.folios[0].passed).toBe(true);
  });

  it("treats a size mismatch as a failed folio", () => {
    const ledge = scratch();
    put(keptPath(ledge, "home", "palm"), solid(4, 4, PAPER));
    put(freshPath(ledge, "home", "palm"), solid(5, 4, MARK));
    const body = sheet(ledge, 1);
    body.apertures = [{ name: "palm", width: 4, height: 4 }];

    const ledger = makeLedger(body, "sheet.json", RAN);
    const folio = ledger.folios[0];

    expect(ledger.passed).toBe(false);
    expect(folio.mismatch).toBe(true);
    expect(folio.passed).toBe(false);
    expect(folio.ratio).toBe(1);
    expect(folio.pixels).toBe(20);
    expect(PNG.sync.read(readFileSync(folio.blot as string)).width).toBe(5);
    expect(pixel(folio.blot as string, 0, 0)).toEqual(BLOT);
  });

  it("fails the folio when the kept plate is not there", () => {
    const ledge = scratch();
    put(freshPath(ledge, "home", "palm"), solid(4, 4, PAPER));
    const body = sheet(ledge);
    body.apertures = [{ name: "palm", width: 4, height: 4 }];

    const ledger = makeLedger(body, "sheet.json", RAN);

    expect(ledger.passed).toBe(false);
    expect(ledger.folios[0]).toMatchObject({
      blot: null,
      ratio: null,
      changed: null,
      pixels: null,
      passed: false,
      mismatch: false,
    });
    expect(existsSync(blotPath(ledge, "home", "palm"))).toBe(false);
  });

  it("refuses a fresh plate that was not captured", () => {
    const ledge = scratch();
    const body = sheet(ledge);
    body.apertures = [{ name: "palm", width: 4, height: 4 }];
    expect(() => makeLedger(body, "sheet.json", RAN)).toThrow(`${freshPath(ledge, "home", "palm")}: no such plate`);
  });
});

describe("approveLedger", () => {
  it("copies every fresh plate onto the kept one", () => {
    const ledge = scratch();
    const plate = solid(4, 4, PAPER);
    const drifted = dot(plate, 1, 2, MARK);
    put(keptPath(ledge, "home", "palm"), plate);
    put(freshPath(ledge, "home", "palm"), plate);
    put(keptPath(ledge, "home", "desk"), plate);
    put(freshPath(ledge, "home", "desk"), drifted);
    const ledger = makeLedger(sheet(ledge, 0), "sheet.json", RAN);
    expect(readFileSync(keptPath(ledge, "home", "desk")).equals(drifted)).toBe(false);

    const approved = approveLedger(ledger, "2026-11-07T01:00:00.000Z");

    expect(approved.approved).toBe("2026-11-07T01:00:00.000Z");
    expect(approved.passed).toBe(false);
    expect(approved.ran).toBe(RAN);
    expect(readFileSync(keptPath(ledge, "home", "palm")).equals(plate)).toBe(true);
    expect(readFileSync(keptPath(ledge, "home", "desk")).equals(drifted)).toBe(true);
    expect(existsSync(freshPath(ledge, "home", "desk"))).toBe(true);
  });

  it("stops before copying when a fresh plate is missing", () => {
    const ledge = scratch();
    const plate = solid(4, 4, PAPER);
    put(keptPath(ledge, "home", "palm"), plate);
    put(freshPath(ledge, "home", "palm"), plate);
    put(keptPath(ledge, "home", "desk"), plate);
    put(freshPath(ledge, "home", "desk"), dot(plate, 0, 0, MARK));
    const ledger = makeLedger(sheet(ledge, 0), "sheet.json", RAN);
    rmSync(freshPath(ledge, "home", "desk"));
    const before = readFileSync(keptPath(ledge, "home", "palm"));

    expect(() => approveLedger(ledger, "2026-11-07T01:00:00.000Z")).toThrow("no such plate");
    expect(readFileSync(keptPath(ledge, "home", "palm")).equals(before)).toBe(true);
    expect(readFileSync(keptPath(ledge, "home", "desk")).equals(plate)).toBe(true);
  });

  it("makes the kept plate when there was not one yet", () => {
    const ledge = scratch();
    const plate = solid(4, 4, PAPER);
    put(freshPath(ledge, "home", "palm"), plate);
    const body = sheet(ledge);
    body.apertures = [{ name: "palm", width: 4, height: 4 }];
    const ledger = makeLedger(body, "sheet.json", RAN);

    approveLedger(ledger, "2026-11-07T01:00:00.000Z");

    expect(readFileSync(keptPath(ledge, "home", "palm")).equals(plate)).toBe(true);
  });
});

describe("readLedger", () => {
  it("round-trips a ledger", () => {
    const dir = scratch();
    const ledge = join(dir, "ledge");
    const plate = solid(2, 2, PAPER);
    put(keptPath(ledge, "home", "palm"), plate);
    put(freshPath(ledge, "home", "palm"), plate);
    const body = sheet(ledge);
    body.apertures = [{ name: "palm", width: 2, height: 2 }];
    const ledger = makeLedger(body, "sheet.json", RAN);
    const path = join(dir, "ledger.json");

    writeLedger(path, ledger);

    expect(readLedger(path)).toEqual(ledger);
    expect(readFileSync(path, "utf8").endsWith("\n")).toBe(true);
  });

  it("rejects a file that is not a ledger", () => {
    const dir = scratch();
    const folio = {
      sight: "home",
      aperture: "palm",
      kept: "kept.png",
      fresh: "fresh.png",
      blot: null,
      ratio: null,
      changed: null,
      pixels: null,
      passed: false,
      mismatch: false,
    };
    const good = {
      sheet: "sheet.json",
      ledge: "ledge",
      driftLimit: 0,
      ran: RAN,
      passed: false,
      approved: null,
      folios: [folio],
    };
    const cases: Array<[unknown, string]> = [
      ["{", "not json"],
      [[], "not a ledger"],
      [{}, "not a ledger"],
      [{ ...good, folios: "nope" }, "not a ledger"],
      [{ ...good, approved: 4 }, "not a ledger"],
      [{ ...good, driftLimit: "tight" }, "not a ledger"],
      [{ ...good, folios: [{ ...folio, fresh: "" }] }, "not a ledger"],
      [{ ...good, folios: [{ ...folio, passed: "yes" }] }, "not a ledger"],
      [{ ...good, folios: [null] }, "not a ledger"],
    ];

    for (let index = 0; index < cases.length; index++) {
      const [body, snippet] = cases[index];
      const path = join(dir, `bad-${index}.json`);
      writeFileSync(path, typeof body === "string" ? body : JSON.stringify(body));
      expect(() => readLedger(path), snippet).toThrow(snippet);
    }
    expect(() => readLedger(join(dir, "missing.json"))).toThrow("no such ledger");
  });
});
