import { join } from "node:path";
import { capture } from "./capture.js";
import {
  approveLedger,
  ledgerPath,
  makeLedger,
  readLedger,
  writeLedger,
  type Folio,
} from "./ledger.js";
import { parseArgv, usageText } from "./read-args.js";
import { loadSheet, sheetFromHref } from "./sheet.js";

type Say = (line: string) => void;

type RunIO = {
  log: Say;
  error: Say;
  capture: typeof capture;
  now: () => string;
};

export async function run(argv: string[], io?: Partial<RunIO>): Promise<number> {
  const log = io?.log ?? ((line: string) => console.log(line));
  const error = io?.error ?? ((line: string) => console.error(line));
  const shoot = io?.capture ?? capture;
  const now = io?.now ?? (() => new Date().toISOString());
  const parsed = parseArgv(argv);

  if (parsed.kind === "help" || parsed.kind === "empty") {
    log(usageText());
    return parsed.kind === "help" ? 0 : 1;
  }

  if (parsed.kind === "bad") {
    error(parsed.reason);
    error(usageText());
    return 1;
  }

  try {
    if (parsed.kind === "url") {
      const plates = await shoot(sheetFromHref(parsed.href));
      for (const plate of plates) log(plate);
      return 0;
    }

    if (parsed.name === "capture-baseline") {
      const sheet = loadSheet(parsed.target);
      const plates = await shoot({ ...sheet, ledge: join(sheet.ledge, "kept") });
      for (const plate of plates) log(plate);
      return 0;
    }

    if (parsed.name === "compare") {
      const sheetPath = parsed.target ?? "glance.sheet.json";
      const sheet = loadSheet(sheetPath);
      await shoot({ ...sheet, ledge: join(sheet.ledge, "fresh") });
      const ledger = makeLedger(sheet, sheetPath, now());
      const path = ledgerPath(sheet.ledge);
      writeLedger(path, ledger);
      for (const folio of ledger.folios) log(folioLine(folio));
      log(path);
      return ledger.passed ? 0 : 1;
    }

    const path = parsed.target ?? "ledger.json";
    writeLedger(path, approveLedger(readLedger(path), now()));
    log(path);
    return 0;
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

function folioLine(folio: Folio): string {
  const name = `${folio.sight} ${folio.aperture}`;
  if (folio.ratio === null) return `${name} missing`;
  if (folio.mismatch) return `${name} ${folio.ratio} mismatch`;
  if (!folio.passed) return `${name} ${folio.ratio} over`;
  return `${name} ${folio.ratio} ok`;
}
