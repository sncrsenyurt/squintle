import { errors, type Page } from "playwright";

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
