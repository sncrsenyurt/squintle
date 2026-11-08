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

function wipe(kept: string | null, fresh: string | null): string {
  if (!kept || !fresh) return "";
  return [
    `<div class="wipe">`,
    `<div class="frame">`,
    `<img class="kept" src="${esc(kept)}" alt="kept">`,
    `<div class="fresh-clip">`,
    `<img class="fresh" src="${esc(fresh)}" alt="fresh">`,
    `</div>`,
    `</div>`,
    `<input type="range" min="0" max="100" value="50" aria-label="wipe kept and fresh">`,
    `</div>`,
  ].join("\n");
}

function apertureBlock(folio: Folio, from: string): string {
  const kept = plateSrc(from, folio.kept);
  const fresh = plateSrc(from, folio.fresh);
  const blot = folio.blot ? plateSrc(from, folio.blot) : null;
  const lines = [
    `<article data-aperture="${esc(folio.aperture)}">`,
    `<h3>${esc(folio.aperture)}</h3>`,
    `<p class="facts">${esc(facts(folio))}</p>`,
    `<div class="plates">`,
    figure("kept", kept, "kept missing"),
    figure("fresh", fresh, "fresh missing"),
    figure("blot", blot, folio.blot ? "blot missing" : "no blot"),
    `</div>`,
  ];
  const slider = wipe(kept, fresh);
  if (slider) lines.push(slider);
  lines.push(`</article>`);
  return lines.join("\n");
}

function grouped(folios: Folio[]): { sight: string; folios: Folio[] }[] {
  const groups: { sight: string; folios: Folio[] }[] = [];
  for (const folio of folios) {
    const found = groups.find((group) => group.sight === folio.sight);
    if (found) {
      found.folios.push(folio);
      continue;
    }
    groups.push({ sight: folio.sight, folios: [folio] });
  }
  return groups;
}

function sightBlock(sight: string, folios: Folio[], from: string): string {
  const body = folios.map((folio) => apertureBlock(folio, from)).join("\n");
  return [
    `<section class="sight" data-sight="${esc(sight)}">`,
    `<h2>${esc(sight)}</h2>`,
    body,
    `</section>`,
  ].join("\n");
}

const CSS = `
body { margin: 24px; font: 14px/1.4 sans-serif; color: #222; background: #fff; }
h1 { font-size: 18px; margin: 0 0 12px; }
dl { display: grid; grid-template-columns: 7rem 1fr; gap: 2px 12px; margin: 0 0 24px; }
dt { color: #555; }
dd { margin: 0; }
.sight { margin: 0 0 32px; }
h2 { font-size: 16px; margin: 0 0 12px; padding-bottom: 4px; border-bottom: 1px solid #ccc; }
article { margin: 0 0 20px; }
h3 { font-size: 14px; margin: 0 0 4px; }
.facts { margin: 0 0 8px; }
.plates { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
figure { margin: 0; }
figcaption { margin: 0 0 4px; }
img { display: block; max-width: 320px; height: auto; border: 1px solid #bbb; background: #fff; }
.missing { margin: 0; padding: 12px; border: 1px dashed #999; color: #555; }
.wipe { margin-top: 12px; max-width: 480px; }
.frame { position: relative; }
.frame .kept { display: block; width: 100%; height: auto; }
.fresh-clip { position: absolute; top: 0; bottom: 0; left: 0; width: 50%; overflow: hidden; }
.frame img { border: 0; }
.frame .fresh { height: 100%; width: auto; max-width: none; }
.wipe input { display: block; width: 100%; margin: 6px 0 0; }
`.trim();

const JS = `
for (const node of document.querySelectorAll(".wipe")) {
  const clip = node.querySelector(".fresh-clip");
  const input = node.querySelector("input");
  const move = () => {
    clip.style.width = input.value + "%";
  };
  input.addEventListener("input", move);
  move();
}
`.trim();

function page(ledger: Ledger, from: string): string {
  const blocks = grouped(ledger.folios)
    .map((group) => sightBlock(group.sight, group.folios, from))
    .join("\n");
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
    `<script>${JS}</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export function writeSpread(path: string, ledger: Ledger): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, page(ledger, dirname(path)));
}
