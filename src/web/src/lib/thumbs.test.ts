import { describe, expect, it } from "vitest";
import { encodeNxi, type Frame } from "./nxi";
import { defaultColour, makeThumbnail, THUMB_SIZES, thumbSize } from "./thumbs";

// An NXI whose pixel (x, y) has the default-palette colour of index(x, y).
function nxi(width: 256 | 320, index: (x: number, y: number) => number): Buffer {
  const height = width === 320 ? 256 : 192;
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rgb.set(defaultColour(index(x, y)), (y * width + x) * 3);
    }
  }
  const frame: Frame = { width, height, rgb };
  return encodeNxi(frame);
}

// One thumbnail pixel for each block of the 4:3 area, its index from its position.
const blockIndex = (tx: number, ty: number, size: { width: number }) => (ty * size.width + tx) % 256;

describe("thumbnail size", () => {
  it("slot 1 is big and slots 2 to 5 are small, both 4:3", () => {
    expect(thumbSize(1)).toBe(THUMB_SIZES.big);
    for (const slot of [2, 3, 4, 5]) {
      expect(thumbSize(slot)).toBe(THUMB_SIZES.small);
    }
    for (const size of Object.values(THUMB_SIZES)) {
      expect(size.width * 3).toBe(size.height * 4);
    }
  });

  it.each([256, 320] as const)("a %i-wide screenshot gives the fixed size for each slot", (width) => {
    const data = nxi(width, (x, y) => x + y);
    for (const slot of [1, 2, 3, 4, 5]) {
      const size = thumbSize(slot);
      expect(makeThumbnail(data, slot)?.length).toBe(size.width * size.height);
    }
  });

  it("does not take a file that is not an NXI", () => {
    expect(makeThumbnail(Buffer.alloc(100), 1)).toBeNull();
  });
});

describe("thumbnail pixels", () => {
  it("are default-palette indices, row by row, and use every colour, 0x00 included", () => {
    for (const slot of [1, 2]) {
      const size = thumbSize(slot);
      const scale = 256 / size.width;
      const thumb = makeThumbnail(
        nxi(256, (x, y) => blockIndex(Math.floor(x / scale), Math.floor(y / scale), size)),
        slot,
      )!;
      for (let ty = 0; ty < size.height; ty++) {
        for (let tx = 0; tx < size.width; tx++) {
          expect(thumb[ty * size.width + tx]).toBe(blockIndex(tx, ty, size));
        }
      }
      if (slot === 1) {
        expect(new Set(thumb).size).toBe(256);
      }
    }
  });

  it("cut a 320x256 screenshot to 320x240 by 8 lines at the top and the bottom", () => {
    for (const slot of [1, 2]) {
      const size = thumbSize(slot);
      const scale = 320 / size.width;
      // The 16 cut lines are white; inside them, one colour per thumbnail pixel.
      const data = nxi(320, (x, y) =>
        y < 8 || y >= 248 ? 0xff : blockIndex(Math.floor(x / scale), Math.floor((y - 8) / scale), size),
      );
      const thumb = makeThumbnail(data, slot)!;
      for (let ty = 0; ty < size.height; ty++) {
        for (let tx = 0; tx < size.width; tx++) {
          expect(thumb[ty * size.width + tx]).toBe(blockIndex(tx, ty, size));
        }
      }
    }
  });

  it("are the nearest default colour to the mean of the pixels they cover", () => {
    // A small thumbnail pixel covers a 4x4 block of a 256x192 screenshot. In
    // each block, 12 pixels white and 4 black: the mean, 191.25 on each
    // channel, is nearest to level 5 (182) for red and green, and to blue 182
    // (bits 10).
    expect(256 / thumbSize(2).width).toBe(4);
    const thumb = makeThumbnail(
      nxi(256, (x, y) => (y % 4 === 0 ? 0x00 : 0xff)),
      2,
    )!;
    expect(defaultColour(0b101_101_10)).toEqual([182, 182, 182]);
    expect(new Set(thumb)).toEqual(new Set([0b101_101_10]));
  });
});
