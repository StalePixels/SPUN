import sharp from "sharp";

// A PNG of coloured stripes, so a replace gives different bytes.
export async function stripesPng(width: number, height: number): Promise<Buffer> {
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const x = i % width;
    rgb[i * 3] = (x * 32) & 0xff;
    rgb[i * 3 + 1] = (Math.floor(i / width) * 16) & 0xff;
    rgb[i * 3 + 2] = 0xe0;
  }
  return sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

// A ready NXI: a 512-byte palette, then one byte for each pixel, 256x192 or 320x256.
export function readyNxi(width: 256 | 320 = 320): Buffer {
  const data = Buffer.alloc(512 + (width === 320 ? 320 * 256 : 256 * 192));
  data[2] = 0xe0;
  for (let at = 512; at < data.length; at++) {
    data[at] = at % 2;
  }
  return data;
}
