import { readFileSync } from "node:fs";

export type Sight = { name: string; url: string };
export type Aperture = { name: string; width: number; height: number };
export type Veil = { sight: string; selector: string };

export type Sheet = {
  driftLimit: number;
  ledge: string;
  sights: Sight[];
  apertures: Aperture[];
  veils: Veil[];
};

const STOCK_APERTURES: Aperture[] = [
  { name: "palm", width: 390, height: 844 },
  { name: "lap", width: 834, height: 1112 },
  { name: "desk", width: 1440, height: 900 },
];

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  return value as Record<string, unknown>;
}

function plainName(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || /[\s\\/]/.test(value)) return;
  if (value === "." || value === "..") return;
  return value;
}

function httpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    return value;
  } catch {
    return;
  }
}

function pixelSize(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return;
  return value;
}

function readSights(raw: unknown, where: string): Sight[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${where}: sights are missing`);
  }
  const seen = new Set<string>();
  const sights: Sight[] = [];
  for (const item of raw) {
    const row = record(item);
    const name = plainName(row?.name);
    if (!name) throw new Error(`${where}: a sight is missing a name`);
    if (seen.has(name)) throw new Error(`${where}: sight ${name} is repeated`);
    seen.add(name);
    const url = httpUrl(row?.url);
    if (!url) throw new Error(`${where}: sight ${name} has a bad url`);
    sights.push({ name, url });
  }
  return sights;
}

function readApertures(raw: unknown, where: string): Aperture[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${where}: apertures are missing`);
  }
  const seen = new Set<string>();
  const apertures: Aperture[] = [];
  for (const item of raw) {
    const row = record(item);
    const name = plainName(row?.name);
    if (!name) throw new Error(`${where}: an aperture is missing a name`);
    if (seen.has(name)) throw new Error(`${where}: aperture ${name} is repeated`);
    seen.add(name);
    const width = pixelSize(row?.width);
    const height = pixelSize(row?.height);
    if (width === undefined || height === undefined) {
      throw new Error(`${where}: aperture ${name} needs a size`);
    }
    apertures.push({ name, width, height });
  }
  return apertures;
}

function readVeils(raw: unknown, sights: Sight[], where: string): Veil[] {
  if (!Array.isArray(raw)) throw new Error(`${where}: veils are not a list`);
  const names = new Set(sights.map((sight) => sight.name));
  const veils: Veil[] = [];
  for (const item of raw) {
    const row = record(item);
    const sight = typeof row?.sight === "string" ? row.sight : "";
    if (!names.has(sight)) throw new Error(`${where}: veil names an unknown sight`);
    const selector = typeof row?.selector === "string" ? row.selector : "";
    if (!selector.trim()) throw new Error(`${where}: veil on ${sight} needs a selector`);
    veils.push({ sight, selector });
  }
  return veils;
}

function readBody(raw: unknown, where: string): Sheet {
  const body = record(raw);
  if (!body) throw new Error(`${where} is not a sheet`);

  const sights = readSights(body.sights, where);
  const apertures =
    body.apertures === undefined
      ? STOCK_APERTURES.map((aperture) => ({ ...aperture }))
      : readApertures(body.apertures, where);
  const veils = body.veils === undefined ? [] : readVeils(body.veils, sights, where);

  let driftLimit = 0.002;
  if (body.driftLimit !== undefined) {
    const drift = body.driftLimit;
    if (typeof drift !== "number" || !Number.isFinite(drift) || drift < 0 || drift > 1) {
      throw new Error(`${where}: driftLimit must sit between 0 and 1`);
    }
    driftLimit = drift;
  }

  let ledge = "ledge";
  if (body.ledge !== undefined) {
    if (typeof body.ledge !== "string" || !body.ledge.trim()) {
      throw new Error(`${where}: ledge is missing`);
    }
    ledge = body.ledge;
  }

  return { driftLimit, ledge, sights, apertures, veils };
}

export function readSheet(path: string): Sheet {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${path}: no such sheet`);
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
