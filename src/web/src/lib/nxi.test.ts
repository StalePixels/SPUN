import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { checkNxi, chooseSize, convertImage, decodeNxi, NXI_MODES, type Frame } from "./nxi";

// The 8 levels the Next shows for each 3-bit channel.
const LEVELS = [0, 36, 73, 109, 146, 182, 219, 255];

// An image in Next colours only: each pixel's colour comes from its position.
function nextFrame(width: number, height: number, colours = 256): Frame {
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = (x * 7 + y * 13) % colours;
      const at = (y * width + x) * 3;
      rgb[at] = LEVELS[(key >> 6) & 7];
      rgb[at + 1] = LEVELS[(key >> 3) & 7];
      rgb[at + 2] = LEVELS[key & 7];
    }
  }
  return { width, height, rgb };
}

function scaleUp(frame: Frame, by: number): Frame {
  const width = frame.width * by;
  const height = frame.height * by;
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (Math.floor(y / by) * frame.width + Math.floor(x / by)) * 3;
      frame.rgb.copy(rgb, (y * width + x) * 3, from, from + 3);
    }
  }
  return { width, height, rgb };
}

function png(frame: Frame): Promise<Buffer> {
  return sharp(frame.rgb, { raw: { width: frame.width, height: frame.height, channels: 3 } }).png().toBuffer();
}

async function convert(frame: Frame) {
  const result = await convertImage(await png(frame));
  if (!result.ok) throw new Error(`conversion failed: ${result.error.code}`);
  return result;
}

describe("size choice", () => {
  it.each([
    [256, 192],
    [512, 384],
    [200, 150],
  ])("%ix%i gives 256x192", (width, height) => {
    expect(chooseSize(width, height).mode).toBe(256);
  });

  it.each([
    [320, 256],
    [640, 512],
    [640, 480],
    [300, 200],
  ])("%ix%i gives 320x256", (width, height) => {
    expect(chooseSize(width, height).mode).toBe(320);
  });

  it("uses the smallest whole-number scale that fits 320x256", () => {
    expect(chooseSize(512, 384)).toMatchObject({ scale: 2, width: 256, height: 192 });
    expect(chooseSize(640, 480)).toMatchObject({ scale: 2, width: 320, height: 240 });
    expect(chooseSize(200, 150)).toMatchObject({ scale: 1, width: 200, height: 150 });
  });
});

describe("conversion", () => {
  it("turns a 512x384 image of 2x2 blocks into the exact 256x192 image", async () => {
    const source = nextFrame(256, 192);
    const result = await convert(scaleUp(source, 2));
    expect(result.width).toBe(256);
    expect(decodeNxi(result.nxi)?.rgb.equals(source.rgb)).toBe(true);
  });

  it("gives 9-bit palette entries and the right file size for each mode", async () => {
    // 512 colours, so the palette has to be cut down to 256.
    for (const [width, height] of [
      [256, 192],
      [320, 256],
    ]) {
      const result = await convert(nextFrame(width, height, 512));
      const mode = NXI_MODES[result.width];
      expect(result.width).toBe(width);
      expect(result.nxi.length).toBe(mode.bytes);
      for (let entry = 0; entry < 256; entry++) {
        expect(result.nxi[entry * 2 + 1] & 0xfe).toBe(0);
      }
    }
  });

  it("decodes a converted NXI back into the same pixels, for both sizes", async () => {
    for (const [width, height] of [
      [256, 192],
      [320, 256],
    ]) {
      const source = nextFrame(width, height);
      const frame = decodeNxi((await convert(source)).nxi);
      expect(frame).toMatchObject({ width, height });
      expect(frame?.rgb.equals(source.rgb)).toBe(true);
    }
  });

  it("stores 320x256 column by column and 256x192 row by row", async () => {
    // The colour of the palette entry at a pixel byte, as 8-bit RGB.
    const colour = (nxi: Buffer, at: number) => {
      const entry = nxi[512 + at] * 2;
      const blue = ((nxi[entry] & 3) << 1) | (nxi[entry + 1] & 1);
      return [nxi[entry] >> 5, (nxi[entry] >> 2) & 7, blue].map((c) => LEVELS[c]);
    };
    const pixel = (frame: Frame, x: number, y: number) => [
      ...frame.rgb.subarray((y * frame.width + x) * 3, (y * frame.width + x) * 3 + 3),
    ];
    const wide = nextFrame(320, 256);
    const wideNxi = (await convert(wide)).nxi;
    expect(colour(wideNxi, 1)).toEqual(pixel(wide, 0, 1));
    expect(colour(wideNxi, 256)).toEqual(pixel(wide, 1, 0));
    const small = nextFrame(256, 192);
    const smallNxi = (await convert(small)).nxi;
    expect(colour(smallNxi, 1)).toEqual(pixel(small, 1, 0));
    expect(colour(smallNxi, 256)).toEqual(pixel(small, 0, 1));
  });

  it("centres a small image on black and never scales it up", async () => {
    const source = nextFrame(100, 50);
    const frame = decodeNxi((await convert(source)).nxi)!;
    expect(frame.width).toBe(256);
    const at = (x: number, y: number) => [...frame.rgb.subarray((y * 256 + x) * 3, (y * 256 + x) * 3 + 3)];
    expect(at(0, 0)).toEqual([0, 0, 0]);
    expect(at(78, 71)).toEqual([...source.rgb.subarray(0, 3)]);
  });

  it("does not take a text file", async () => {
    expect(await convertImage(Buffer.from("not an image\n"))).toEqual({
      ok: false,
      error: { code: "screenshot.notImage" },
    });
  });
});

describe("NXI upload check", () => {
  it("passes the two sizes with a palette", () => {
    expect(checkNxi(Buffer.alloc(49_664))).toEqual({ ok: true, width: 256 });
    expect(checkNxi(Buffer.alloc(82_432))).toEqual({ ok: true, width: 320 });
  });

  it.each([0, 49_152, 49_408, 49_663, 49_665, 81_920, 81_952, 82_433])(
    "fails %i bytes with screenshot.badNxi",
    (bytes) => {
      expect(checkNxi(Buffer.alloc(bytes))).toEqual({ ok: false, error: { code: "screenshot.badNxi" } });
    },
  );
});
