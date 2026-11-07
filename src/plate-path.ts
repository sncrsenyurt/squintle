import { join } from "node:path";

export function platePath(ledge: string, sight: string, aperture: string): string {
  return join(ledge, sight, `${aperture}.png`);
}

export function keptPath(ledge: string, sight: string, aperture: string): string {
  return platePath(join(ledge, "kept"), sight, aperture);
}

export function freshPath(ledge: string, sight: string, aperture: string): string {
  return platePath(join(ledge, "fresh"), sight, aperture);
}

export function blotPath(ledge: string, sight: string, aperture: string): string {
  return platePath(join(ledge, "blot"), sight, aperture);
}
