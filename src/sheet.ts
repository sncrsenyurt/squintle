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

export function readSheet(path: string): Sheet {
  const sheet = JSON.parse(readFileSync(path, "utf8")) as Sheet;
  if (!Array.isArray(sheet?.sights) || !Array.isArray(sheet?.apertures)) {
    throw new Error(`${path} is not a sheet`);
  }
  return sheet;
}
