import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { checkNxi, chooseSize, convertImage, decodeNxi, NXI_MODES, oneAtATime, type Frame } from "./nxi";
import { MAX_IMAGE_PIXELS } from "./rules";

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

// A black 1-bit PNG of any size, a few kilobytes even when it is huge, as an
// attacker would send it. interlace makes libvips decode the whole image.
function blackPng(width: number, height: number, interlace = false): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (data: Buffer) => {
    let c = 0xffffffff;
    for (const byte of data) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "latin1");
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 1;
  header[12] = interlace ? 1 : 0;
  const rows = Buffer.alloc((1 + Math.ceil(width / 8)) * height * (interlace ? 2 : 1));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("the image size limit", () => {
  it("takes an image of exactly 4 megapixels", async () => {
    expect(MAX_IMAGE_PIXELS).toBe(4_000_000);
    expect((await convertImage(blackPng(2000, 2000))).ok).toBe(true);
  });

  it("refuses an image over 4 megapixels from its header, huge or just over", async () => {
    const refused = { ok: false, error: { code: "screenshot.tooManyPixels" } };
    expect(await convertImage(blackPng(2000, 2001))).toEqual(refused);
    expect(await convertImage(blackPng(16383, 16383, true))).toEqual(refused);
  });
});

describe("oneAtATime", () => {
  it("starts each task only when the one before has ended, also after a failure", async () => {
    const order: string[] = [];
    const task = (name: string, ms: number, fail = false) => async () => {
      order.push(`${name} start`);
      await new Promise((resolve) => setTimeout(resolve, ms));
      order.push(`${name} end`);
      if (fail) throw new Error(name);
      return name;
    };
    const runs = [oneAtATime(task("a", 30)), oneAtATime(task("b", 5, true)), oneAtATime(task("c", 1))];
    const results = await Promise.allSettled(runs);
    expect(order).toEqual(["a start", "a end", "b start", "b end", "c start", "c end"]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  });
});

