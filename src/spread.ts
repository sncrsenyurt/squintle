import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import type { Folio, Ledger } from "./ledger.js";

export function spreadPath(ledge: string): string {
  return join(dirname(ledge), "spread.html");
}

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function plateSrc(from: string, file: string): string | null {
  if (!existsSync(file)) return null;
  return encodeURI(relative(from, file).split(sep).join("/"));
}

function facts(folio: Folio): string {
  if (folio.ratio === null) return "missing";
  if (folio.mismatch) return `${folio.ratio} mismatch`;
  if (!folio.passed) return `${folio.ratio} over`;
  return `${folio.ratio} ok`;
}

function figure(label: string, src: string | null, note: string): string {
  const body = src
    ? `<img src="${esc(src)}" alt="${esc(label)}">`
    : `<p class="missing">${esc(note)}</p>`;
  return `<figure><figcaption>${esc(label)}</figcaption>${body}</figure>`;
}

function folioBlock(folio: Folio, from: string): string {
  const kept = plateSrc(from, folio.kept);
  const fresh = plateSrc(from, folio.fresh);
  const blot = folio.blot ? plateSrc(from, folio.blot) : null;
  return [
    `<article data-sight="${esc(folio.sight)}" data-aperture="${esc(folio.aperture)}">`,
    `<h2>${esc(folio.sight)}</h2>`,
    `<p class="aperture">${esc(folio.aperture)}</p>`,
    `<p class="facts">${esc(facts(folio))}</p>`,
    `<div class="plates">`,
    figure("kept", kept, "kept missing"),
    figure("fresh", fresh, "fresh missing"),
    figure("blot", blot, folio.blot ? "blot missing" : "no blot"),
    `</div>`,
    `</article>`,
  ].join("\n");
}

const CSS = `
body { margin: 24px; font: 14px/1.4 sans-serif; color: #222; background: #fff; }
h1 { font-size: 18px; margin: 0 0 12px; }
dl { display: grid; grid-template-columns: 7rem 1fr; gap: 2px 12px; margin: 0 0 24px; }
dt { color: #555; }
dd { margin: 0; }
article { margin: 0 0 28px; }
h2 { font-size: 16px; margin: 0 0 4px; }
.aperture { margin: 0 0 4px; }
.facts { margin: 0 0 8px; }
.plates { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
figure { margin: 0; }
figcaption { margin: 0 0 4px; }
img { display: block; max-width: 320px; height: auto; border: 1px solid #bbb; background: #fff; }
.missing { margin: 0; padding: 12px; border: 1px dashed #999; color: #555; }
`.trim();

function page(ledger: Ledger, from: string): string {
  const blocks = ledger.folios.map((folio) => folioBlock(folio, from)).join("\n");
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    "<title>spread</title>",
    `<style>${CSS}</style>`,
    "</head>",
    "<body>",
    "<h1>spread</h1>",
    "<dl>",
    `<dt>sheet</dt><dd>${esc(ledger.sheet)}</dd>`,
    `<dt>ledge</dt><dd>${esc(ledger.ledge)}</dd>`,
    `<dt>driftLimit</dt><dd>${ledger.driftLimit}</dd>`,
    `<dt>ran</dt><dd>${esc(ledger.ran)}</dd>`,
    `<dt>passed</dt><dd>${ledger.passed}</dd>`,
    "</dl>",
    blocks,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export function writeSpread(path: string, ledger: Ledger): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, page(ledger, dirname(path)));
}
