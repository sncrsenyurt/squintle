import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { comparePlates } from "./blot.js";
import { blotPath, freshPath, keptPath } from "./plate-path.js";
import type { Sheet } from "./sheet.js";

export type Folio = {
  sight: string;
  aperture: string;
  kept: string;
  fresh: string;
  blot: string | null;
  ratio: number | null;
  changed: number | null;
  pixels: number | null;
  passed: boolean;
  mismatch: boolean;
};

export type Ledger = {
  sheet: string;
  ledge: string;
  driftLimit: number;
  ran: string;
  passed: boolean;
  approved: string | null;
  folios: Folio[];
};

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  return value as Record<string, unknown>;
}

function nonempty(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return;
  return value;
}

function flag(value: unknown): boolean | undefined {
  if (typeof value !== "boolean") return;
  return value;
}

function num(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  return value;
}

export function ledgerPath(ledge: string): string {
  return join(dirname(ledge), "ledger.json");
}

export function writeLedger(path: string, ledger: Ledger): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(ledger, null, 2) + "\n");
}

function readFolio(raw: unknown, where: string): Folio {
  const row = record(raw);
  const sight = nonempty(row?.sight);
  const aperture = nonempty(row?.aperture);
  const kept = nonempty(row?.kept);
  const fresh = nonempty(row?.fresh);
  const blot = row?.blot === null ? null : nonempty(row?.blot);
  const ratio = num(row?.ratio);
  const changed = num(row?.changed);
  const pixels = num(row?.pixels);
  const passed = flag(row?.passed);
  const mismatch = flag(row?.mismatch);
  if (
    !sight ||
    !aperture ||
    !kept ||
    !fresh ||
    blot === undefined ||
    ratio === undefined ||
    changed === undefined ||
    pixels === undefined ||
    passed === undefined ||
    mismatch === undefined
  ) {
    throw new Error(`${where}: not a ledger`);
  }
  return { sight, aperture, kept, fresh, blot, ratio, changed, pixels, passed, mismatch };
}

function readBody(raw: unknown, where: string): Ledger {
  const body = record(raw);
  const sheet = nonempty(body?.sheet);
  const ledge = nonempty(body?.ledge);
  const ran = nonempty(body?.ran);
  const passed = flag(body?.passed);
  const drift = body?.driftLimit;
  const driftLimit = typeof drift === "number" && Number.isFinite(drift) ? drift : undefined;
  const approved = body?.approved === null ? null : nonempty(body?.approved);
  const rows = body?.folios;
  if (
    !sheet ||
    !ledge ||
    !ran ||
    passed === undefined ||
    driftLimit === undefined ||
    approved === undefined ||
    !Array.isArray(rows)
  ) {
    throw new Error(`${where}: not a ledger`);
  }
  return {
    sheet,
    ledge,
    driftLimit,
    ran,
    passed,
    approved,
    folios: rows.map((item) => readFolio(item, where)),
  };
}

export function readLedger(path: string): Ledger {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${path}: no such ledger`);
    }
    throw err;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`${path}: not json`);
  }
  return readBody(raw, path);
}

function folioFor(sheet: Sheet, sight: string, aperture: string): Folio {
  const kept = keptPath(sheet.ledge, sight, aperture);
  const fresh = freshPath(sheet.ledge, sight, aperture);
  if (!existsSync(fresh)) throw new Error(`${fresh}: no such plate`);

  if (!existsSync(kept)) {
    return {
      sight,
      aperture,
      kept,
      fresh,
      blot: null,
      ratio: null,
      changed: null,
      pixels: null,
      passed: false,
      mismatch: false,
    };
  }

  const drift = comparePlates(kept, fresh, sheet.driftLimit);
  const blot = blotPath(sheet.ledge, sight, aperture);
  mkdirSync(dirname(blot), { recursive: true });
  writeFileSync(blot, drift.blot);
  return {
    sight,
    aperture,
    kept,
    fresh,
    blot,
    ratio: drift.ratio,
    changed: drift.changed,
    pixels: drift.pixels,
    passed: drift.passed,
    mismatch: drift.mismatch,
  };
}

export function makeLedger(sheet: Sheet, sheetPath: string, ran: string): Ledger {
  const folios: Folio[] = [];
  for (const sight of sheet.sights) {
    for (const aperture of sheet.apertures) {
      folios.push(folioFor(sheet, sight.name, aperture.name));
    }
  }
  return {
    sheet: sheetPath,
    ledge: sheet.ledge,
    driftLimit: sheet.driftLimit,
    ran,
    passed: folios.every((folio) => folio.passed),
    approved: null,
    folios,
  };
}

export function approveLedger(ledger: Ledger, when: string): Ledger {
  for (const folio of ledger.folios) {
    if (!existsSync(folio.fresh)) throw new Error(`${folio.fresh}: no such plate`);
  }
  for (const folio of ledger.folios) {
    mkdirSync(dirname(folio.kept), { recursive: true });
    copyFileSync(folio.fresh, folio.kept);
  }
  return { ...ledger, approved: when };
}
