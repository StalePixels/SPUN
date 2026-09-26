import yauzl from "yauzl";
import type { Problem } from "./problems";
import { MAX_UPLOAD_BYTES } from "./rules";

export type ZipCheck = { ok: true; entries: string[] } | { ok: false; error: Problem };

// Reads the central directory only. No entry is decompressed.
export function checkZip(data: Buffer): Promise<ZipCheck> {
  if (data.length > MAX_UPLOAD_BYTES) {
    return Promise.resolve({
      ok: false,
      error: { code: "file.tooLarge" },
    });
  }
  return new Promise((resolve) => {
    const reject = () =>
      resolve({
        ok: false,
        error: { code: "file.notZip" },
      });
    yauzl.fromBuffer(data, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) {
        reject();
        return;
      }
      const entries: string[] = [];
      zip.on("entry", (entry: yauzl.Entry) => {
        entries.push(entry.fileName);
        zip.readEntry();
      });
      zip.on("end", () => resolve({ ok: true, entries }));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}
