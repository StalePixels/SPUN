import sharp from "sharp";
import type { Problem } from "./problems";

export type NxiWidth = 256 | 320;

export type Frame = { width: number; height: number; rgb: Buffer };

const PALETTE_BYTES = 512;
const PALETTE_SIZE = 256;

export const NXI_MODES = {
  256: { width: 256, height: 192, bytes: PALETTE_BYTES + 256 * 192 },
  320: { width: 320, height: 256, bytes: PALETTE_BYTES + 320 * 256 },
} as const;

const INPUT_FORMATS = ["png", "jpeg", "gif", "webp"];

export type SizeChoice = { scale: number; width: number; height: number; mode: NxiWidth };

// Smallest whole-number scale that fits 320x256; the small mode if the result also fits 256x192.
export function chooseSize(width: number, height: number): SizeChoice {
  const big = NXI_MODES[320];
  const small = NXI_MODES[256];
  const scale = Math.max(1, Math.ceil(width / big.width), Math.ceil(height / big.height));
  const scaled = { width: Math.ceil(width / scale), height: Math.ceil(height / scale) };
  const mode = scaled.width <= small.width && scaled.height <= small.height ? 256 : 320;
  return { scale, ...scaled, mode };
}

function colourKey(rgb: Buffer, offset: number): number {
  return ((rgb[offset] >> 5) << 6) | ((rgb[offset + 1] >> 5) << 3) | (rgb[offset + 2] >> 5);
}

type Box = { keys: number[]; pixels: number };

function channel(key: number, n: number): number {
  return (key >> (6 - 3 * n)) & 7;
}

function boxMean(box: Box, counts: Uint32Array): number {
  let key = 0;
  for (let n = 0; n < 3; n++) {
    let sum = 0;
    for (const k of box.keys) {
      sum += channel(k, n) * counts[k];
    }
    key |= Math.round(sum / box.pixels) << (6 - 3 * n);
  }
  return key;
}

function splitBox(box: Box, counts: Uint32Array): [Box, Box] {
  let widest = 0;
  let range = -1;
  for (let n = 0; n < 3; n++) {
    const values = box.keys.map((k) => channel(k, n));
    const spread = Math.max(...values) - Math.min(...values);
    if (spread > range) {
      range = spread;
      widest = n;
    }
  }
  const keys = [...box.keys].sort((a, b) => channel(a, widest) - channel(b, widest) || a - b);
  let low = 0;
  let cut = 1;
  for (; cut < keys.length - 1; cut++) {
    low += counts[keys[cut - 1]];
    if (low * 2 >= box.pixels) {
      break;
    }
  }
  const pixels = (part: number[]) => part.reduce((sum, k) => sum + counts[k], 0);
  const first = keys.slice(0, cut);
  const second = keys.slice(cut);
  return [
    { keys: first, pixels: pixels(first) },
    { keys: second, pixels: pixels(second) },
  ];
}

// Median cut over the 9-bit colours. Black keeps an entry of its own, so the
// bars round the image stay black.
function medianCut(keys: number[], counts: Uint32Array): { palette: number[]; index: Map<number, number> } {
  const black = counts[0] > 0;
  const palette = black ? [0] : [];
  const boxes: Box[] = [{ keys: keys.filter((k) => k !== 0), pixels: 0 }];
  boxes[0].pixels = boxes[0].keys.reduce((sum, k) => sum + counts[k], 0);
  while (boxes.length < PALETTE_SIZE - palette.length) {
    let pick = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].keys.length > 1 && (pick < 0 || boxes[i].pixels > boxes[pick].pixels)) {
        pick = i;
      }
    }
    boxes.splice(pick, 1, ...splitBox(boxes[pick], counts));
  }
  const index = new Map<number, number>();
  if (black) {
    index.set(0, 0);
  }
  for (const box of boxes) {
    for (const k of box.keys) {
      index.set(k, palette.length);
    }
    palette.push(boxMean(box, counts));
  }
  return { palette, index };
}

export function encodeNxi(frame: Frame): Buffer {
  const mode = frame.width === 320 ? NXI_MODES[320] : NXI_MODES[256];
  const pixels = mode.width * mode.height;
  const counts = new Uint32Array(512);
  const keys = new Uint16Array(pixels);
  for (let i = 0; i < pixels; i++) {
    keys[i] = colourKey(frame.rgb, i * 3);
    counts[keys[i]]++;
  }
  const used = [...counts.keys()].filter((k) => counts[k] > 0);
  const { palette, index } =
    used.length <= PALETTE_SIZE
      ? { palette: used, index: new Map(used.map((k, i) => [k, i])) }
      : medianCut(used, counts);

  const out = Buffer.alloc(mode.bytes);
  palette.forEach((key, i) => {
    out[i * 2] = (key >> 1) & 0xff;
    out[i * 2 + 1] = key & 1;
  });
  for (let y = 0; y < mode.height; y++) {
    for (let x = 0; x < mode.width; x++) {
      const at = mode.width === 320 ? x * mode.height + y : y * mode.width + x;
      out[PALETTE_BYTES + at] = index.get(keys[y * mode.width + x])!;
    }
  }
  return out;
}

export function nxiWidth(data: Buffer): NxiWidth | null {
  if (data.length === NXI_MODES[256].bytes) return 256;
  if (data.length === NXI_MODES[320].bytes) return 320;
  return null;
}

export type NxiCheck = { ok: true; width: NxiWidth } | { ok: false; error: Problem };

// An NXI has no header; only its size in bytes says which mode it is.
export function checkNxi(data: Buffer): NxiCheck {
  const width = nxiWidth(data);
  return width ? { ok: true, width } : { ok: false, error: { code: "screenshot.badNxi" } };
}

function level(c3: number): number {
  return Math.round((c3 * 255) / 7);
}

export function decodeNxi(data: Buffer): Frame | null {
  const width = nxiWidth(data);
  if (!width) {
    return null;
  }
  const mode = NXI_MODES[width];
  const rgb = Buffer.alloc(mode.width * mode.height * 3);
  for (let y = 0; y < mode.height; y++) {
    for (let x = 0; x < mode.width; x++) {
      const at = width === 320 ? x * mode.height + y : y * mode.width + x;
      const entry = data[PALETTE_BYTES + at] * 2;
      const high = data[entry];
      const out = (y * mode.width + x) * 3;
      rgb[out] = level(high >> 5);
      rgb[out + 1] = level((high >> 2) & 7);
      rgb[out + 2] = level(((high & 3) << 1) | (data[entry + 1] & 1));
    }
  }
  return { width: mode.width, height: mode.height, rgb };
}

export type Conversion = { ok: true; nxi: Buffer; width: NxiWidth } | { ok: false; error: Problem };

// Nearest-neighbour by a whole-number scale, so every Next pixel is a source
// pixel; centred on black; never scaled up. Alpha goes onto black too.
export async function convertImage(data: Buffer): Promise<Conversion> {
  const notImage = { ok: false, error: { code: "screenshot.notImage" } } as const;
  let size: SizeChoice;
  let source: Buffer;
  let channels: number;
  try {
    const image = sharp(data);
    const meta = await image.metadata();
    if (!meta.format || !INPUT_FORMATS.includes(meta.format) || !meta.width || !meta.height) {
      return notImage;
    }
    size = chooseSize(meta.width, meta.height);
    const pipeline = image.flatten({ background: "#000000" }).toColourspace("srgb").removeAlpha();
    if (size.scale > 1) {
      pipeline.resize(size.width, size.height, { kernel: "nearest", fit: "fill", fastShrinkOnLoad: false });
    }
    const raw = await pipeline.raw({ depth: "uchar" }).toBuffer({ resolveWithObject: true });
    source = raw.data;
    channels = raw.info.channels;
  } catch {
    return notImage;
  }
  const mode = NXI_MODES[size.mode];
  const rgb = Buffer.alloc(mode.width * mode.height * 3);
  const left = Math.floor((mode.width - size.width) / 2);
  const top = Math.floor((mode.height - size.height) / 2);
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      const from = (y * size.width + x) * channels;
      const to = ((top + y) * mode.width + left + x) * 3;
      rgb[to] = source[from];
      rgb[to + 1] = source[from + 1];
      rgb[to + 2] = source[from + 2];
    }
  }
  return { ok: true, nxi: encodeNxi({ width: mode.width, height: mode.height, rgb }), width: size.mode };
}

export async function previewPng(nxi: Buffer): Promise<Buffer> {
  const frame = decodeNxi(nxi);
  if (!frame) {
    throw new Error(`Not an NXI: ${nxi.length} bytes.`);
  }
  return sharp(frame.rgb, { raw: { width: frame.width, height: frame.height, channels: 3 } }).png().toBuffer();
}
