// Compiles each src/themes/<id>/theme.scss to public/themes/<id>/theme.css and
// copies the theme's assets (fonts, images) beside it. With --watch it compiles
// again when a theme changes.
//   node scripts/themes.mts [--watch]

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, watch, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import * as sass from "sass";

const SOURCE = "src/themes";
const OUTPUT = "public/themes";
const NOT_ASSETS = new Set([".scss", ".ts", ".py"]);

function themeIds() {
  return readdirSync(SOURCE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(SOURCE, entry.name, "theme.scss")))
    .map((entry) => entry.name);
}

// THEME_COLOUR is a Next 8-bit colour (RRRGGGBB), such as 0x02, as in the client's PALETTE. The Next
// makes the third blue bit from the other two. The two shades keep the SPUN blue's ratios, 0x9A and 0xD7 to 0xB6.
function themeColours(): string | null {
  const value = process.env.THEME_COLOUR;
  if (!value) return null;
  const byte = Number(value);
  if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new Error(`THEME_COLOUR ${value} is not a byte`);
  const three = (bits: number) => (bits << 5) | (bits << 2) | (bits >> 1);
  const blue = ((byte & 3) << 1) | (byte & 3 ? 1 : 0);
  const rgb = [three(byte >> 5), three((byte >> 2) & 7), three(blue)];
  const hex = (scale: number) =>
    "#" + rgb.map((c) => Math.min(255, Math.round((c * scale) / 0xb6)).toString(16).padStart(2, "0")).join("");
  return `$spun-blue: ${hex(0xb6)};\n$spun-blue-dark: ${hex(0x9a)};\n$spun-blue-light: ${hex(0xd7)};\n`;
}

// With THEME_COLOUR, the colours go in before theme.scss; the string's URL is beside theme.scss, so its @import finds it
function build(id: string) {
  const source = join(SOURCE, id);
  const output = join(OUTPUT, id);
  const colours = themeColours();
  const file = join(source, "theme.scss");
  const options: sass.Options<"sync"> = {
    loadPaths: ["node_modules"],
    style: "compressed",
    quietDeps: true,
    // Bootstrap 5.3 and Pulse use Sass features that Dart Sass now reports as deprecated.
    silenceDeprecations: ["import", "global-builtin", "color-functions", "if-function"],
  };
  const { css } = colours
    ? sass.compileString(`${colours}@import "theme";`, { ...options, url: pathToFileURL(join(source, "colours.scss")) })
    : sass.compile(file, options);
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "theme.css"), css);
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.isFile() && !NOT_ASSETS.has(extname(entry.name))) {
      copyFileSync(join(source, entry.name), join(output, entry.name));
    }
  }
  console.log(`themes: ${output}/theme.css`);
}

function buildAll() {
  for (const id of themeIds()) {
    try {
      build(id);
    } catch (error) {
      console.error(`themes: ${id}: ${error instanceof Error ? error.message : error}`);
      if (!process.argv.includes("--watch")) process.exit(1);
    }
  }
}

buildAll();

if (process.argv.includes("--watch")) {
  let timer: NodeJS.Timeout | undefined;
  watch(SOURCE, { recursive: true }, (_event, file) => {
    clearTimeout(timer);
    const id = file?.split(/[\\/]/)[0];
    timer = setTimeout(() => (id && themeIds().includes(id) ? build(id) : buildAll()), 100);
  });
}
