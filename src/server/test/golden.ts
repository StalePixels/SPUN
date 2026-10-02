// Golden bytes are built here from the layout, not by the codec: a reply is
// NBN version 2, SPUN format 1, u16 LE block size, the block, its checksum.
// A field is tag, length (u8 below tag 0x80, u16 LE from 0x80), value.
export const h2 = (n: number): string => n.toString(16).padStart(2, "0");

export const le = (n: number, size: number): string =>
  Array.from({ length: size }, (_, i) => h2(Math.floor(n / 256 ** i) % 256)).join("");

export const ascii = (text: string): string => Buffer.from(text, "ascii").toString("hex");

export const field = (tag: number, value: string): string =>
  h2(tag) + (tag >= 0x80 ? le(value.length / 2, 2) : h2(value.length / 2)) + value;

export const reply = (body: string): string => {
  const sum = Buffer.from(body, "hex").reduce((total, byte) => total + byte, 0) % 256;
  return "02" + "01" + le(body.length / 2, 2) + body + h2(sum);
};

export const counts = (total: number, page: number, pages: number): string =>
  field(0x01, le(total, 2)) + field(0x02, le(page, 2)) + field(0x03, le(pages, 2));
