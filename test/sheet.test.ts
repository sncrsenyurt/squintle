import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSheet, sheetFromHref } from "../src/sheet.js";

const dirs: string[] = [];

function writeSheet(body: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "squintle-"));
  dirs.push(dir);
  const path = join(dir, "sheet.json");
  writeFileSync(path, typeof body === "string" ? body : JSON.stringify(body));
  return path;
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

describe("readSheet", () => {
  it("reads glance.sheet.json", () => {
    const sheet = readSheet("glance.sheet.json");
    expect(sheet.driftLimit).toBe(0.002);
    expect(sheet.ledge).toBe("ledge");
    expect(sheet.sights.map((sight) => sight.name)).toEqual(["example"]);
    expect(sheet.apertures.map((aperture) => aperture.width)).toEqual([390, 834, 1440]);
    expect(sheet.veils).toEqual([{ sight: "example", selector: "[data-clock]" }]);
  });

  it("fills apertures, veils, driftLimit, and the ledge when they are left out", () => {
    const path = writeSheet({
      sights: [{ name: "home", url: "https://example.com/docs" }],
    });
    const sheet = readSheet(path);
    expect(sheet.sights).toEqual([{ name: "home", url: "https://example.com/docs" }]);
    expect(sheet.driftLimit).toBe(0.002);
    expect(sheet.ledge).toBe("ledge");
    expect(sheet.veils).toEqual([]);
    expect(sheet.apertures).toEqual([
      { name: "palm", width: 390, height: 844 },
      { name: "lap", width: 834, height: 1112 },
      { name: "desk", width: 1440, height: 900 },
    ]);
  });

  it("keeps the apertures and veils a sheet actually set", () => {
    const path = writeSheet({
      driftLimit: 0,
      ledge: "shots",
      sights: [{ name: "home", url: "http://127.0.0.1:4173/" }],
      apertures: [{ name: "desk", width: 1280, height: 800 }],
      veils: [
        { sight: "home", selector: "[data-clock]" },
        { sight: "home", selector: ".slot" },
      ],
    });
    expect(readSheet(path)).toEqual({
      driftLimit: 0,
      ledge: "shots",
      sights: [{ name: "home", url: "http://127.0.0.1:4173/" }],
      apertures: [{ name: "desk", width: 1280, height: 800 }],
      veils: [
        { sight: "home", selector: "[data-clock]" },
        { sight: "home", selector: ".slot" },
      ],
    });
  });

  it("rejects a sheet that does not hold together", () => {
    const cases: Array<[unknown, string]> = [
      [{}, "sights are missing"],
      [[], "is not a sheet"],
      [{ sights: [{ url: "https://example.com/" }] }, "missing a name"],
      [{ sights: [{ name: "home", url: "notaurl" }] }, "bad url"],
      [{ sights: [{ name: "my sight", url: "https://example.com/" }] }, "missing a name"],
      [
        {
          sights: [
            { name: "home", url: "https://example.com/" },
            { name: "home", url: "https://example.com/x" },
          ],
        },
        "sight home is repeated",
      ],
      [
        {
          sights: [{ name: "home", url: "https://example.com/" }],
          apertures: [
            { name: "desk", width: 100, height: 100 },
            { name: "desk", width: 200, height: 200 },
          ],
        },
        "aperture desk is repeated",
      ],
      [
        {
          sights: [{ name: "home", url: "https://example.com/" }],
          apertures: [{ name: "desk", width: 1440.2, height: 900 }],
        },
        "needs a size",
      ],
      [
        {
          sights: [{ name: "home", url: "https://example.com/" }],
          veils: [{ sight: "other", selector: "img" }],
        },
        "unknown sight",
      ],
      [
        {
          sights: [{ name: "home", url: "https://example.com/" }],
          veils: [{ sight: "home", selector: " " }],
        },
        "needs a selector",
      ],
      [
        {
          sights: [{ name: "home", url: "https://example.com/" }],
          veils: { sight: "home", selector: "img" },
        },
        "veils are not a list",
      ],
      [{ sights: [{ name: "home", url: "https://example.com/" }], driftLimit: 1.4 }, "driftLimit"],
      [{ sights: [{ name: "home", url: "https://example.com/" }], ledge: "" }, "ledge is missing"],
    ];

    for (const [body, snippet] of cases) {
      expect(() => readSheet(writeSheet(body)), snippet).toThrow(snippet);
    }
  });

  it("rejects a file that is not json", () => {
    expect(() => readSheet(writeSheet("{"))).toThrow("not json");
  });

  it("rejects a path that is not there", () => {
    expect(() => readSheet("no/such/glance.sheet.json")).toThrow("no such sheet");
  });
});

describe("sheetFromHref", () => {
  it("names the sight after the host and keeps the stock apertures", () => {
    const sheet = sheetFromHref("https://Example.com/hello?x=1");
    expect(sheet.sights).toEqual([{ name: "example.com", url: "https://Example.com/hello?x=1" }]);
    expect(sheet.apertures.map((aperture) => aperture.name)).toEqual(["palm", "lap", "desk"]);
    expect(sheet.veils).toEqual([]);
    expect(sheet.driftLimit).toBe(0.002);
    expect(sheet.ledge).toBe("ledge");
  });

  it("refuses a url that is not http", () => {
    expect(() => sheetFromHref("ftp://example.com/a")).toThrow("not a url");
    expect(() => sheetFromHref("http://")).toThrow("not a url");
  });
});
