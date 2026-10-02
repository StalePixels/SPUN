import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import sharp from "sharp";
import { convertImage } from "../src/lib/nxi";
import { makeThumbnail } from "../src/lib/thumbs";

// Screenshots for the MAME test of the .spun app page (src/client/test/mame-app.sh),
// on the apps of gui-catalogue.mts, which must be added first. gui024 has
// screenshots of both sizes in slots 1, 2, 3 and 5, and none in slot 4; gui022
// has one in every slot; every other app has none. Each picture is drawn here and goes through the CMS
// conversion (convertImage) and thumbnail code (makeThumbnail), so the NXI and
// thumbnail files are what an upload makes. The files go where the CMS writes
// them (storage.ts), and SPINFO lists the rows.
// Run with: pnpm exec tsx e2e/gui-screenshots.mts add|remove

const web = path.join(import.meta.dirname, "..");
process.loadEnvFile(path.join(web, ".env.e2e"));

const databaseUrl = process.env.E2E_DATABASE_URL ?? "";
const storageDir = process.env.E2E_STORAGE_DIR ?? "";
const owner = process.env.E2E_CLIENT_USERNAME ?? "";
if (!new URL(databaseUrl).pathname.endsWith("_e2e") || !path.basename(storageDir).endsWith("-e2e") || !owner) {
  console.error("Refused: E2E_DATABASE_URL must end in _e2e, E2E_STORAGE_DIR in -e2e, and E2E_CLIENT_USERNAME must be set.");
  process.exit(1);
}

// gui-catalogue.mts gives the even apps to the client.
const PICTURES = [
  { slot: 1, width: 320, height: 256, colours: ["#1040c0", "#f0c020"] },
  { slot: 2, width: 256, height: 192, colours: ["#c02020", "#20c0c0"] },
  { slot: 3, width: 320, height: 256, colours: ["#208020", "#f0f0f0"] },
  { slot: 4, width: 320, height: 256, colours: ["#c06000", "#80f080"] },
  { slot: 5, width: 256, height: 192, colours: ["#602080", "#f08020"] },
];
const SHOTS: Record<string, typeof PICTURES> = {
  gui024: PICTURES.filter((shot) => shot.slot !== 4),
  gui022: PICTURES,
};

const publicDir = path.join(storageDir, "public", owner);
const nxiPath = (app: string, slot: number) => path.join(publicDir, "nxi", app, String(slot));
const thumbPath = (app: string, slot: number) => path.join(publicDir, "thumb", app, String(slot));

// A gradient, rings and stripes, with the slot number big enough to read in a thumbnail.
function picture(shot: (typeof PICTURES)[number]): Buffer {
  const { width: w, height: h, colours, slot } = shot;
  const rings = [0.45, 0.33, 0.2].map(
    (r, i) => `<circle cx="${w * 0.7}" cy="${h * 0.5}" r="${r * h}" fill="${i % 2 ? colours[0] : colours[1]}"/>`,
  );
  const stripes = Array.from(
    { length: 8 },
    (_, i) => `<rect x="${i * 8}" y="0" width="4" height="${h}" fill="hsl(${i * 45},90%,55%)"/>`,
  );
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${colours[0]}"/><stop offset="1" stop-color="#000000"/></linearGradient></defs>` +
      `<rect width="${w}" height="${h}" fill="url(#g)"/>${stripes.join("")}${rings.join("")}` +
      `<text x="${w * 0.08 + 64}" y="${h * 0.62}" font-family="sans-serif" font-weight="bold" font-size="${h * 0.4}" fill="#ffffff">${slot}</text>` +
      `<text x="${w * 0.04 + 64}" y="${h * 0.92}" font-family="sans-serif" font-size="${h * 0.08}" fill="#ffffff">${w}x${h}</text>` +
      `</svg>`,
  );
}

const connection = await mysql.createConnection(databaseUrl);
try {
  for (const app of Object.keys(SHOTS)) {
    await connection.query("delete from screenshots where app_id = ?", [app]);
    await rm(path.join(publicDir, "nxi", app), { recursive: true, force: true });
    await rm(path.join(publicDir, "thumb", app), { recursive: true, force: true });
  }

  if (process.argv[2] === "add") {
    for (const [app, shots] of Object.entries(SHOTS)) {
      for (const shot of shots) {
        const png = await sharp(picture(shot)).png().toBuffer();
        const converted = await convertImage(png);
        if (!converted.ok || converted.width !== shot.width) {
          console.error(`The CMS conversion of slot ${shot.slot} failed.`);
          process.exit(1);
        }
        for (const [file, data] of [
          [nxiPath(app, shot.slot), converted.nxi],
          [thumbPath(app, shot.slot), makeThumbnail(converted.nxi, shot.slot)!],
        ] as const) {
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(file, data);
        }
        await connection.query("insert into screenshots (app_id, slot, width) values (?, ?, ?)", [
          app,
          shot.slot,
          shot.width,
        ]);
      }
      console.log(`Added screenshots ${shots.map((shot) => shot.slot).join(", ")} of ${app}.`);
    }
  } else if (process.argv[2] === "remove") {
    console.log(`Removed the screenshots of ${Object.keys(SHOTS).join(" and ")}.`);
  } else {
    console.error("usage: pnpm exec tsx e2e/gui-screenshots.mts add|remove");
    process.exit(1);
  }
} finally {
  await connection.end();
}
