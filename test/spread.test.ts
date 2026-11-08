import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import { makeLedger } from "../src/ledger.js";
import { blotPath, freshPath, keptPath } from "../src/plate-path.js";
import { spreadPath, writeSpread } from "../src/spread.js";
import type { Sheet } from "../src/sheet.js";

const PAPER = [244, 241, 234, 255];
const MARK = [20, 80, 160, 255];
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

function sheet(ledge: string): Sheet {
  return {
    driftLimit: 0,
    ledge,
    sights: [
      { name: "home", url: "http://127.0.0.1:9/" },
      { name: "about", url: "http://127.0.0.1:9/about" },
    ],
    apertures: [
      { name: "palm", width: 4, height: 4 },
      { name: "desk", width: 4, height: 4 },
    ],
    veils: [],
  };
}

function webPath(from: string, file: string): string {
  return encodeURI(relative(from, file).split(sep).join("/"));
}

function chunk(html: string, sight: string, aperture: string): string {
  const sightAt = html.indexOf(`data-sight="${sight}"`);
  const nextSight = html.indexOf("data-sight=", sightAt + 1);
  const region = html.slice(sightAt, nextSight === -1 ? undefined : nextSight);
  const at = region.indexOf(`data-aperture="${aperture}"`);
  const next = region.indexOf("data-aperture=", at + 1);
  return region.slice(at, next === -1 ? undefined : next);
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

describe("spreadPath", () => {
  it("sits beside the ledge", () => {
    expect(spreadPath("ledge")).toBe("spread.html");
    expect(spreadPath(join("out", "ledge"))).toBe(join("out", "spread.html"));
  });
});

describe("writeSpread", () => {
  it("groups kept, fresh, and blot by sight and aperture", () => {
    const dir = scratch();
    const ledge = join(dir, "ledge");
    const plate = solid(4, 4, PAPER);
    const drifted = dot(plate, 1, 2, MARK);
    put(keptPath(ledge, "home", "palm"), plate);
    put(freshPath(ledge, "home", "palm"), plate);
    put(keptPath(ledge, "home", "desk"), plate);
    put(freshPath(ledge, "home", "desk"), drifted);
    put(freshPath(ledge, "about", "palm"), plate);
    put(keptPath(ledge, "about", "desk"), plate);
    put(freshPath(ledge, "about", "desk"), solid(5, 4, MARK));

    const ledger = makeLedger(sheet(ledge), "sheet.json", RAN);
    const path = spreadPath(ledge);
    writeSpread(path, ledger);
    const html = readFileSync(path, "utf8");
    const from = dirname(path);

    const home = html.indexOf('data-sight="home"');
    const about = html.indexOf('data-sight="about"');
    const homePalm = html.indexOf('data-aperture="palm"', home);
    const homeDesk = html.indexOf('data-aperture="desk"', homePalm);
    const aboutPalm = html.indexOf('data-aperture="palm"', about);
    const aboutDesk = html.indexOf('data-aperture="desk"', aboutPalm);
    expect(home).toBeGreaterThan(-1);
    expect(homePalm).toBeGreaterThan(home);
    expect(homeDesk).toBeGreaterThan(homePalm);
    expect(about).toBeGreaterThan(homeDesk);
    expect(aboutPalm).toBeGreaterThan(about);
    expect(aboutDesk).toBeGreaterThan(aboutPalm);

    const palm = chunk(html, "home", "palm");
    expect(palm).toContain(webPath(from, keptPath(ledge, "home", "palm")));
    expect(palm).toContain(webPath(from, freshPath(ledge, "home", "palm")));
    expect(palm).toContain(webPath(from, blotPath(ledge, "home", "palm")));
    expect(palm).toContain(">kept<");
    expect(palm).toContain(">fresh<");
    expect(palm).toContain(">blot<");
    expect(palm).toContain("0 ok");
    expect(palm).toContain('type="range"');

    const desk = chunk(html, "home", "desk");
    expect(desk).toContain("0.0625 over");
    expect(desk).toContain(webPath(from, blotPath(ledge, "home", "desk")));
    expect(desk).toContain('type="range"');

    const missing = chunk(html, "about", "palm");
    expect(missing).toContain("kept missing");
    expect(missing).toContain("no blot");
    expect(missing).toContain(webPath(from, freshPath(ledge, "about", "palm")));
    expect(missing).not.toContain(webPath(from, keptPath(ledge, "about", "palm")));
    expect(missing).not.toContain('type="range"');

    const mismatch = chunk(html, "about", "desk");
    expect(mismatch).toContain("1 mismatch");
    expect(mismatch).toContain(webPath(from, keptPath(ledge, "about", "desk")));
    expect(mismatch).toContain(webPath(from, freshPath(ledge, "about", "desk")));
    expect(mismatch).toContain(webPath(from, blotPath(ledge, "about", "desk")));
    expect(mismatch).toContain('type="range"');

    expect(html).toContain("<dt>driftLimit</dt><dd>0</dd>");
    expect(html).toContain("<dt>passed</dt><dd>false</dd>");
    expect(html).toContain(`<dt>ran</dt><dd>${RAN}</dd>`);
    expect(html).toContain("<style>");
    expect(html).toContain("<script>");
    expect(html).toContain("addEventListener");
    expect(html).not.toMatch(/<script[^>]*\ssrc\s*=/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/url\s*\(/i);
  });
});
