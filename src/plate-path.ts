import { join } from "node:path";

export function platePath(ledge: string, sight: string, aperture: string): string {
  return join(ledge, sight, `${aperture}.png`);
}
