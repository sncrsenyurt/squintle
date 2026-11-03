import { describe, expect, it } from "vitest";
import { parseArgv } from "../src/read-args.js";
import { readSheet } from "../src/sheet.js";

describe("parseArgv", () => {
  it("treats no args as empty", () => {
    expect(parseArgv([])).toEqual({ kind: "empty" });
  });

  it("takes a bare url", () => {
    expect(parseArgv(["https://example.com"])).toEqual({
      kind: "url",
      href: "https://example.com",
    });
  });

  it("takes compare plus a sheet path", () => {
    expect(parseArgv(["compare", "glance.sheet.json"])).toEqual({
      kind: "command",
      name: "compare",
      target: "glance.sheet.json",
    });
  });

  it("rejects an unknown command", () => {
    expect(parseArgv(["nope"]).kind).toBe("bad");
  });
});

describe("readSheet", () => {
  it("loads the example sheet", () => {
    const sheet = readSheet("glance.sheet.json");
    expect(sheet.sights.map((sight) => sight.url)).toEqual(["https://example.com/"]);
    expect(sheet.apertures.map((aperture) => aperture.name)).toEqual(["palm", "lap", "desk"]);
    expect(sheet.veils[0].selector).toBe("[data-clock]");
  });
});
