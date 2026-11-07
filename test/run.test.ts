import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import { ledgerPath, readLedger } from "../src/ledger.js";
import { freshPath, keptPath, platePath } from "../src/plate-path.js";
import { run } from "../src/run.js";
import type { Sheet } from "../src/sheet.js";

const PAPER = [244, 241, 234, 255];
const MARK = [20, 80, 160, 255];
const RAN = "2026-11-07T00:00:00.000Z";
const LATER = "2026-11-07T01:00:00.000Z";

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

function writeSheet(dir: string, driftLimit: number): { path: string; ledge: string } {
  const ledge = join(dir, "ledge");
  const path = join(dir, "sheet.json");
  const body: Sheet = {
    driftLimit,
    ledge,
    sights: [{ name: "home", url: "http://127.0.0.1:9/" }],
    apertures: [
      { name: "palm", width: 4, height: 4 },
      { name: "desk", width: 4, height: 4 },
    ],
    veils: [{ sight: "home", selector: "[data-clock]" }],
  };
  writeFileSync(path, JSON.stringify(body));
  return { path, ledge };
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

describe("run", () => {
  it("prints help and exits 0", async () => {
    const lines: string[] = [];
    const code = await run(["help"], { log: (line) => lines.push(line) });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("squintle approve [ledger]");
  });

  it("exits 1 on an empty argv or an unknown command", async () => {
    const errors: string[] = [];
    expect(await run([], { log: () => {}, error: (line) => errors.push(line) })).toBe(1);
    expect(errors).toEqual([]);
    const code = await run(["nope"], { log: () => {}, error: (line) => errors.push(line) });
    expect(code).toBe(1);
    expect(errors[0]).toMatch(/unknown command/);
  });

  it("captures a bare url straight onto the ledge", async () => {
    const lines: string[] = [];
    let ledge = "";
    const code = await run(["https://example.com/hi"], {
      log: (line) => lines.push(line),
      capture: async (sheet) => {
        ledge = sheet.ledge;
        expect(sheet.sights).toEqual([{ name: "example.com", url: "https://example.com/hi" }]);
        return ["plate"];
      },
    });
    expect(code).toBe(0);
    expect(ledge).toBe("ledge");
    expect(lines).toEqual(["plate"]);
  });

  it("captures a baseline under kept", async () => {
    const dir = scratch();
    const { path, ledge } = writeSheet(dir, 0);
    const lines: string[] = [];
    let seen = "";
    const code = await run(["capture-baseline", path], {
      log: (line) => lines.push(line),
      capture: async (sheet) => {
        seen = sheet.ledge;
        expect(sheet.veils).toEqual([{ sight: "home", selector: "[data-clock]" }]);
        return [platePath(sheet.ledge, "home", "palm")];
      },
    });
    expect(code).toBe(0);
    expect(seen).toBe(join(ledge, "kept"));
    expect(lines).toEqual([platePath(join(ledge, "kept"), "home", "palm")]);
  });

  it("reads glance.sheet.json when the command has no path", async () => {
    let baseline = "";
    let fresh = "";
    let sight = "";
    const baselineCode = await run(["capture-baseline"], {
      error: () => {},
      capture: async (sheet) => {
        baseline = sheet.ledge;
        sight = sheet.sights[0].name;
        throw new Error("stop");
      },
    });
    const compareCode = await run(["compare"], {
      error: () => {},
      capture: async (sheet) => {
        fresh = sheet.ledge;
        throw new Error("stop");
      },
    });
    expect(baselineCode).toBe(1);
    expect(compareCode).toBe(1);
    expect(sight).toBe("example");
    expect(baseline).toBe(join("ledge", "kept"));
    expect(fresh).toBe(join("ledge", "fresh"));
    expect(existsSync("ledger.json")).toBe(false);
  });

  it("exits 0 when every plate passes", async () => {
    const dir = scratch();
    const { path, ledge } = writeSheet(dir, 0);
    const plate = solid(4, 4, PAPER);
    put(keptPath(ledge, "home", "palm"), plate);
    put(keptPath(ledge, "home", "desk"), plate);
    const lines: string[] = [];

    const code = await run(["compare", path], {
      log: (line) => lines.push(line),
      error: (line) => {
        throw new Error(line);
      },
      now: () => RAN,
      capture: async (sheet) => {
        const written: string[] = [];
        for (const sight of sheet.sights) {
          for (const aperture of sheet.apertures) {
            const file = platePath(sheet.ledge, sight.name, aperture.name);
            put(file, plate);
            written.push(file);
          }
        }
        expect(sheet.ledge).toBe(join(ledge, "fresh"));
        return written;
      },
    });

    const ledger = readLedger(ledgerPath(ledge));
    expect(code).toBe(0);
    expect(ledger.passed).toBe(true);
    expect(ledger.approved).toBeNull();
    expect(ledger.ran).toBe(RAN);
    expect(ledger.sheet).toBe(path);
    expect(lines.at(-1)).toBe(ledgerPath(ledge));
    expect(lines).toContain("home palm 0 ok");
    expect(lines).toContain("home desk 0 ok");
  });

  it("exits 1 and still writes the ledger when a plate drifts", async () => {
    const dir = scratch();
    const { path, ledge } = writeSheet(dir, 0);
    const plate = solid(4, 4, PAPER);
    const drifted = dot(plate, 1, 2, MARK);
    put(keptPath(ledge, "home", "palm"), plate);
    put(keptPath(ledge, "home", "desk"), plate);
    const before = readFileSync(keptPath(ledge, "home", "desk"));
    const lines: string[] = [];
    const errors: string[] = [];

    const code = await run(["compare", path], {
      log: (line) => lines.push(line),
      error: (line) => errors.push(line),
      now: () => RAN,
      capture: async (sheet) => {
        const written: string[] = [];
        for (const sight of sheet.sights) {
          for (const aperture of sheet.apertures) {
            const file = platePath(sheet.ledge, sight.name, aperture.name);
            put(file, aperture.name === "desk" ? drifted : plate);
            written.push(file);
          }
        }
        return written;
      },
    });

    expect(errors).toEqual([]);
    expect(code).toBe(1);
    expect(readFileSync(keptPath(ledge, "home", "desk")).equals(before)).toBe(true);
    const ledger = readLedger(ledgerPath(ledge));
    expect(ledger.passed).toBe(false);
    expect(ledger.folios.map((folio) => folio.passed)).toEqual([true, false]);
    expect(lines).toContain("home desk 0.0625 over");
    expect(lines.at(-1)).toBe(ledgerPath(ledge));
  });

  it("exits 1 when a plate is the wrong size", async () => {
    const dir = scratch();
    const { path, ledge } = writeSheet(dir, 1);
    const plate = solid(4, 4, PAPER);
    put(keptPath(ledge, "home", "palm"), plate);
    put(keptPath(ledge, "home", "desk"), plate);
    const lines: string[] = [];
    const errors: string[] = [];

    const code = await run(["compare", path], {
      log: (line) => lines.push(line),
      error: (line) => errors.push(line),
      now: () => RAN,
      capture: async (sheet) => {
        const written: string[] = [];
        for (const sight of sheet.sights) {
          for (const aperture of sheet.apertures) {
            const file = platePath(sheet.ledge, sight.name, aperture.name);
            const buf = aperture.name === "desk" ? solid(5, 4, MARK) : plate;
            put(file, buf);
            written.push(file);
          }
        }
        return written;
      },
    });

    expect(errors).toEqual([]);
    expect(code).toBe(1);
    expect(lines).toContain("home desk 1 mismatch");
    expect(readLedger(ledgerPath(ledge)).folios[1].mismatch).toBe(true);
    expect(readLedger(ledgerPath(ledge)).passed).toBe(false);
  });

  it("exits 1 when the kept plate is missing", async () => {
    const dir = scratch();
    const { path, ledge } = writeSheet(dir, 0);
    const plate = solid(4, 4, PAPER);
    const lines: string[] = [];

    const code = await run(["compare", path], {
      log: (line) => lines.push(line),
      now: () => RAN,
      capture: async (sheet) => {
        const file = platePath(sheet.ledge, "home", "palm");
        put(file, plate);
        const desk = platePath(sheet.ledge, "home", "desk");
        put(desk, plate);
        return [file, desk];
      },
    });

    expect(code).toBe(1);
    const ledger = readLedger(ledgerPath(ledge));
    expect(ledger.passed).toBe(false);
    expect(ledger.folios.every((folio) => folio.ratio === null && folio.blot === null)).toBe(true);
    expect(lines).toContain("home palm missing");
  });

  it("exits 1 when capture fails and leaves no ledger", async () => {
    const dir = scratch();
    const { path, ledge } = writeSheet(dir, 0);
    const errors: string[] = [];
    const code = await run(["compare", path], {
      error: (line) => errors.push(line),
      capture: async () => {
        throw new Error("browser quit");
      },
    });
    expect(code).toBe(1);
    expect(errors).toEqual(["browser quit"]);
    expect(existsSync(ledgerPath(ledge))).toBe(false);
  });

  it("approves the fresh plates from the run", async () => {
    const dir = scratch();
    const { path, ledge } = writeSheet(dir, 0);
    const plate = solid(4, 4, PAPER);
    const drifted = dot(plate, 1, 2, MARK);
    put(keptPath(ledge, "home", "palm"), plate);
    put(keptPath(ledge, "home", "desk"), plate);
    const where = ledgerPath(ledge);

    const compared = await run(["compare", path], {
      log: () => {},
      now: () => RAN,
      capture: async (sheet) => {
        const written: string[] = [];
        for (const sight of sheet.sights) {
          for (const aperture of sheet.apertures) {
            const file = platePath(sheet.ledge, sight.name, aperture.name);
            put(file, aperture.name === "desk" ? drifted : plate);
            written.push(file);
          }
        }
        return written;
      },
    });
    expect(compared).toBe(1);

    const lines: string[] = [];
    const code = await run(["approve", where], {
      log: (line) => lines.push(line),
      now: () => LATER,
    });

    expect(code).toBe(0);
    expect(lines).toEqual([where]);
    expect(readFileSync(keptPath(ledge, "home", "desk")).equals(drifted)).toBe(true);
    expect(readFileSync(keptPath(ledge, "home", "palm")).equals(plate)).toBe(true);
    const ledger = readLedger(where);
    expect(ledger.approved).toBe(LATER);
    expect(ledger.passed).toBe(false);
    expect(ledger.ran).toBe(RAN);
  });

  it("exits 1 when the ledger is missing or nonsense", async () => {
    const errors: string[] = [];
    const missing = await run(["approve"], { error: (line) => errors.push(line) });
    expect(missing).toBe(1);
    expect(errors).toEqual(["ledger.json: no such ledger"]);

    const dir = scratch();
    const bad = join(dir, "ledger.json");
    writeFileSync(bad, "{");
    const junk = await run(["approve", bad], { error: (line) => errors.push(line) });
    expect(junk).toBe(1);
    expect(errors.at(-1)).toBe(`${bad}: not json`);

    writeFileSync(bad, "{}");
    const shape = await run(["approve", bad], { error: (line) => errors.push(line) });
    expect(shape).toBe(1);
    expect(errors.at(-1)).toBe(`${bad}: not a ledger`);
  });

  it("exits 1 and leaves the kept plates when approve cannot find a fresh one", async () => {
    const dir = scratch();
    const { path, ledge } = writeSheet(dir, 0);
    const plate = solid(4, 4, PAPER);
    put(keptPath(ledge, "home", "palm"), plate);
    put(keptPath(ledge, "home", "desk"), plate);
    await run(["compare", path], {
      log: () => {},
      now: () => RAN,
      capture: async (sheet) => {
        const written: string[] = [];
        for (const sight of sheet.sights) {
          for (const aperture of sheet.apertures) {
            const file = platePath(sheet.ledge, sight.name, aperture.name);
            put(file, plate);
            written.push(file);
          }
        }
        return written;
      },
    });
    rmSync(freshPath(ledge, "home", "desk"));
    const errors: string[] = [];
    const code = await run(["approve", ledgerPath(ledge)], {
      error: (line) => errors.push(line),
    });
    expect(code).toBe(1);
    expect(errors[0]).toMatch(/no such plate/);
    expect(readLedger(ledgerPath(ledge)).approved).toBeNull();
    expect(readFileSync(keptPath(ledge, "home", "palm")).equals(plate)).toBe(true);
  });
});
