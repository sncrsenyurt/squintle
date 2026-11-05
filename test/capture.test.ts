import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { capture, settle } from "../src/capture.js";
import { platePath } from "../src/plate-path.js";
import type { Sheet } from "../src/sheet.js";

const PAGE = `<!doctype html>
<meta charset="utf-8">
<title>plate</title>
<style>
  html, body { margin: 0; padding: 0; }
  .mover {
    width: 120px;
    height: 48px;
    background: #c44;
    animation: slide 4s linear infinite;
    transition: background-color 3s linear;
  }
  .mover::before {
    content: "";
    display: block;
    width: 10px;
    height: 10px;
    animation: slide 2s linear infinite;
  }
  @keyframes slide { to { transform: translateX(80px); } }
  [data-clock] {
    width: 88px;
    height: 32px;
    margin: 16px;
    background: #28c;
    color: white;
  }
  .pin {
    position: fixed;
    top: 10px;
    right: 12px;
    width: 64px;
    height: 24px;
    background: #fc0;
  }
  input { font-size: 20px; display: block; margin: 8px; }
  .spacer { height: 1800px; }
</style>
<div class="mover">slide</div>
<div data-clock>12:41</div>
<div class="pin">live</div>
<input value="typed">
<div class="spacer"></div>
`;

const LINGER = `<!doctype html>
<meta charset="utf-8">
<title>linger</title>
<body>
<div data-clock style="width:40px;height:20px;background:#28c">12</div>
<script>fetch("/linger")</script>
`;

type Fixture = { url: string; release: () => void; close: () => Promise<void> };

async function serve(html: string): Promise<Fixture> {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const server = createServer((req, res) => {
    if (req.url === "/linger") {
      gate.then(() => {
        res.statusCode = 404;
        res.end();
      });
      return;
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(html);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return {
    url: `http://127.0.0.1:${addr.port}/`,
    release,
    close: () =>
      new Promise((resolve, reject) => {
        release();
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  expect(buf.subarray(0, 4).toString("hex")).toBe("89504e47");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function holdFonts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fonts = document.fonts;
    const real = fonts.ready;
    let open = () => {};
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    Object.defineProperty(fonts, "ready", {
      configurable: true,
      get() {
        return gate.then(() => real);
      },
    });
    Object.assign(window, { releaseFonts: () => open() });
  });
}

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 30_000);

afterAll(async () => {
  await browser.close();
});

describe("settle", () => {
  it("freezes motion, hides the caret, and covers the veils", async () => {
    const fixture = await serve(PAGE);
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    try {
      await holdFonts(page);
      await page.goto(fixture.url, { waitUntil: "domcontentloaded" });
      const pending = settle(page, ["[data-clock]", ".pin", ".gone"]);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await page.evaluate(() => document.querySelector("[data-veil]"))).toBeNull();
      await page.evaluate(() => {
        (window as unknown as { releaseFonts: () => void }).releaseFonts();
      });
      await pending;

      const look = await page.evaluate(() => {
        const mover = document.querySelector(".mover") as HTMLElement;
        const clock = document.querySelector("[data-clock]") as HTMLElement;
        const pin = document.querySelector(".pin") as HTMLElement;
        const input = document.querySelector("input") as HTMLInputElement;
        const covered = (el: Element) => {
          const rect = el.getBoundingClientRect();
          const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          if (!top || !top.hasAttribute("data-veil")) return null;
          const box = top.getBoundingClientRect();
          return {
            ink: getComputedStyle(top).backgroundColor,
            dx: Math.abs(box.left - rect.left),
            dy: Math.abs(box.top - rect.top),
            dw: Math.abs(box.width - rect.width),
            dh: Math.abs(box.height - rect.height),
          };
        };
        const moverRect = mover.getBoundingClientRect();
        const moverTop = document.elementFromPoint(
          moverRect.left + moverRect.width / 2,
          moverRect.top + 30,
        );
        return {
          animationName: getComputedStyle(mover).animationName,
          beforeName: getComputedStyle(mover, "::before").animationName,
          transitionProperty: getComputedStyle(mover).transitionProperty,
          caret: getComputedStyle(input).caretColor,
          clock: covered(clock),
          pin: covered(pin),
          moverVeiled: moverTop?.hasAttribute("data-veil") ?? false,
          covers: document.querySelectorAll("[data-veil]").length,
        };
      });

      expect(look.animationName).toBe("none");
      expect(look.beforeName).toBe("none");
      expect(look.transitionProperty).toBe("none");
      expect(look.caret).toMatch(/transparent|rgba\(0,\s*0,\s*0,\s*0\)/);
      expect(look.clock).toMatchObject({ ink: "rgb(17, 17, 17)", dx: 0, dy: 0, dw: 0, dh: 0 });
      expect(look.pin).toMatchObject({ ink: "rgb(17, 17, 17)" });
      expect(look.pin && look.pin.dx).toBeLessThan(1);
      expect(look.pin && look.pin.dy).toBeLessThan(1);
      expect(look.moverVeiled).toBe(false);
      expect(look.covers).toBe(2);
    } finally {
      await page.close();
      await fixture.close();
    }
  }, 20_000);

  it("waits until a hung request finishes", async () => {
    const fixture = await serve(LINGER);
    const page = await browser.newPage();
    try {
      await page.goto(fixture.url, { waitUntil: "domcontentloaded" });
      let done = false;
      const pending = settle(page, ["[data-clock]"]).then(() => {
        done = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(done).toBe(false);
      fixture.release();
      await pending;
      expect(done).toBe(true);
      expect(await page.evaluate(() => document.querySelector("[data-veil]") !== null)).toBe(true);
    } finally {
      await page.close();
      await fixture.close();
    }
  }, 20_000);

  it("rejects a veil selector the page cannot use", async () => {
    const page = await browser.newPage();
    try {
      await page.setContent("<!doctype html><title>x</title>");
      await expect(settle(page, ["["])).rejects.toThrow(/bad veil/);
    } finally {
      await page.close();
    }
  }, 20_000);
});

describe("capture", () => {
  it("writes a full-page plate per aperture", async () => {
    const fixture = await serve(PAGE);
    const ledge = mkdtempSync(join(tmpdir(), "squintle-"));
    try {
      const sheet: Sheet = {
        driftLimit: 0.002,
        ledge,
        sights: [{ name: "home", url: fixture.url }],
        apertures: [
          { name: "palm", width: 420, height: 320 },
          { name: "desk", width: 880, height: 500 },
        ],
        veils: [{ sight: "home", selector: "[data-clock]" }],
      };
      const plates = await capture(sheet, browser);
      expect(plates).toEqual([platePath(ledge, "home", "palm"), platePath(ledge, "home", "desk")]);
      const palm = pngSize(plates[0]);
      const desk = pngSize(plates[1]);
      expect(palm.width).toBe(420);
      expect(desk.width).toBe(880);
      expect(palm.height).toBeGreaterThan(320);
      expect(desk.height).toBeGreaterThan(500);
    } finally {
      await fixture.close();
      rmSync(ledge, { recursive: true, force: true });
    }
  }, 30_000);
});
