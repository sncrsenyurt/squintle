#!/usr/bin/env node
import { parseArgv, usageText } from "./read-args.js";
import { loadSheet, sheetFromHref } from "./sheet.js";
import { capture } from "./capture.js";

const parsed = parseArgv(process.argv.slice(2));

if (parsed.kind === "help" || parsed.kind === "empty") {
  console.log(usageText());
  process.exit(parsed.kind === "help" ? 0 : 1);
}

if (parsed.kind === "bad") {
  console.error(parsed.reason);
  console.error(usageText());
  process.exit(1);
}

try {
  if (parsed.kind === "url" || parsed.name === "capture-baseline") {
    const sheet = parsed.kind === "url" ? sheetFromHref(parsed.href) : loadSheet(parsed.target);
    const plates = await capture(sheet);
    for (const plate of plates) console.log(plate);
    process.exit(0);
  }

  if (parsed.name !== "approve") loadSheet(parsed.target);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const target = parsed.target ? ` ${parsed.target}` : "";
console.error(`${parsed.name}${target}: not built yet`);
process.exit(1);
