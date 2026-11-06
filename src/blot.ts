import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

const BLOT = [176, 58, 28, 255] as const;

export type Drift = {
  passed: boolean;
  ratio: number;
  changed: number;
  pixels: number;
  blot: Buffer;
  mismatch: boolean;
};

function readPlate(input: Buffer | string): PNG {
  const buf = typeof input === "string" ? readFileSync(input) : input;
  return PNG.sync.read(buf);
}

function stamp(data: Buffer, at: number) {
  data[at] = BLOT[0];
  data[at + 1] = BLOT[1];
  data[at + 2] = BLOT[2];
  data[at + 3] = BLOT[3];
}

export function comparePlates(
  kept: Buffer | string,
  fresh: Buffer | string,
  driftLimit: number,
): Drift {
  const base = readPlate(kept);
  const next = readPlate(fresh);

  if (base.width !== next.width || base.height !== next.height) {
    const pixels = next.width * next.height;
    for (let i = 0; i < pixels * 4; i += 4) stamp(next.data, i);
    return {
      passed: false,
      ratio: 1,
      changed: pixels,
      pixels,
      blot: PNG.sync.write(next),
      mismatch: true,
    };
  }

  const pixels = base.width * base.height;
  let changed = 0;
  for (let i = 0; i < pixels * 4; i += 4) {
    if (
      base.data[i] === next.data[i] &&
      base.data[i + 1] === next.data[i + 1] &&
      base.data[i + 2] === next.data[i + 2] &&
      base.data[i + 3] === next.data[i + 3]
    ) {
      continue;
    }
    changed++;
    stamp(next.data, i);
  }

  const ratio = pixels === 0 ? 0 : changed / pixels;
  return {
    passed: ratio <= driftLimit,
    ratio,
    changed,
    pixels,
    blot: PNG.sync.write(next),
    mismatch: false,
  };
}
