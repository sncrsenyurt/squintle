import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium, errors, type Browser, type Page } from "playwright";
import { platePath } from "./plate-path.js";
import type { Sheet } from "./sheet.js";

const STILL = `
  html body *,
  html body *::before,
  html body *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;

const INK = "#111111";

async function fontsReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

export async function settle(page: Page, selectors: string[]): Promise<void> {
  await fontsReady(page);
  try {
    await page.waitForLoadState("networkidle");
  } catch (err) {
    // analytics sockets never go quiet
    if (!(err instanceof errors.TimeoutError)) throw err;
  }
  await fontsReady(page);
  await page.addStyleTag({ content: STILL });
  if (!selectors.length) return;
  await page.evaluate(
    ({ selectors, ink }) => {
      window.scrollTo(0, 0);
      const root = document.body ?? document.documentElement;
      for (const selector of selectors) {
        let nodes: Element[];
        try {
          nodes = Array.from(document.querySelectorAll(selector));
        } catch {
          throw new Error(`bad veil: ${selector}`);
        }
        for (const node of nodes) {
          if (node.hasAttribute("data-veil")) continue;
          const rect = node.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1) continue;
          const fixed = getComputedStyle(node).position === "fixed";
          const block = document.createElement("div");
          block.setAttribute("data-veil", "");
          const style = block.style;
          style.position = fixed ? "fixed" : "absolute";
          style.left = `${fixed ? rect.left : rect.left + window.scrollX}px`;
          style.top = `${fixed ? rect.top : rect.top + window.scrollY}px`;
          style.width = `${rect.width}px`;
          style.height = `${rect.height}px`;
          style.margin = "0";
          style.padding = "0";
          style.border = "0";
          style.boxSizing = "border-box";
          style.display = "block";
          style.background = ink;
          style.zIndex = "2147483647";
          root.appendChild(block);
        }
      }
    },
    { selectors, ink: INK },
  );
}

export async function capture(sheet: Sheet, browser?: Browser): Promise<string[]> {
  const opened = browser ?? (await chromium.launch());
  const plates: string[] = [];
  try {
    const page = await opened.newPage();
    for (const sight of sheet.sights) {
      const selectors = sheet.veils
        .filter((veil) => veil.sight === sight.name)
        .map((veil) => veil.selector);
      for (const aperture of sheet.apertures) {
        await page.setViewportSize({ width: aperture.width, height: aperture.height });
        await page.goto(sight.url, { waitUntil: "domcontentloaded" });
        await settle(page, selectors);
        const file = platePath(sheet.ledge, sight.name, aperture.name);
        mkdirSync(dirname(file), { recursive: true });
        await page.screenshot({ path: file, fullPage: true, caret: "initial" });
        plates.push(file);
      }
    }
  } finally {
    if (!browser) await opened.close();
  }
  return plates;
}
