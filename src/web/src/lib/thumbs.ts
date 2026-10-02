import { decodeNxi, type Frame } from "./nxi";

export const THUMB_SIZES = {
  big: { width: 128, height: 96 },
  small: { width: 64, height: 48 },
} as const;

export function thumbSize(slot: number) {
  return slot === 1 ? THUMB_SIZES.big : THUMB_SIZES.small;
}

function level(c3: number): number {
  return Math.round((c3 * 255) / 7);
}

// Default Layer 2 palette: index i is colour RRRGGGBB = i, and the 9th blue
// bit is the OR of the two blue bits.
export function defaultColour(index: number): [number, number, number] {
  const blue = ((index & 3) << 1) | ((index | (index >> 1)) & 1);
  return [level(index >> 5), level((index >> 2) & 7), level(blue)];
}

const PALETTE = Array.from({ length: 256 }, (_, i) => defaultColour(i));

function nearest(r: number, g: number, b: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < PALETTE.length; i++) {
    const [pr, pg, pb] = PALETTE[i];
    const distance = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

// 320x256 loses 8 lines top and bottom first, so both sizes are 4:3. Each
// thumbnail pixel is the mean of the source pixels whose centres fall in it.
export function makeThumbnail(nxi: Buffer, slot: number): Buffer | null {
  const frame: Frame | null = decodeNxi(nxi);
  if (!frame) {
    return null;
  }
  const top = frame.height === 256 ? 8 : 0;
  const height = frame.height - 2 * top;
  const size = thumbSize(slot);
  const out = Buffer.alloc(size.width * size.height);
  const edge = (n: number, count: number, span: number) => Math.round((n * span) / count);
  for (let ty = 0; ty < size.height; ty++) {
    for (let tx = 0; tx < size.width; tx++) {
      const sum = [0, 0, 0];
      let pixels = 0;
      for (let y = edge(ty, size.height, height); y < edge(ty + 1, size.height, height); y++) {
        for (let x = edge(tx, size.width, frame.width); x < edge(tx + 1, size.width, frame.width); x++) {
          const at = ((top + y) * frame.width + x) * 3;
          sum[0] += frame.rgb[at];
          sum[1] += frame.rgb[at + 1];
          sum[2] += frame.rgb[at + 2];
          pixels++;
        }
      }
      out[ty * size.width + tx] = nearest(sum[0] / pixels, sum[1] / pixels, sum[2] / pixels);
    }
  }
  return out;
}
