// Compiles each src/themes/<id>/theme.scss to public/themes/<id>/theme.css and
// copies the theme's assets (fonts, images) beside it. With --watch it compiles
// again when a theme changes.
//   node scripts/themes.mts [--watch]

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, watch, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import * as sass from "sass";

const SOURCE = "src/themes";
const OUTPUT = "public/themes";
const NOT_ASSETS = new Set([".scss", ".ts", ".py"]);

function themeIds() {
  return readdirSync(SOURCE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(SOURCE, entry.name, "theme.scss")))
    .map((entry) => entry.name);
}

function build(id: string) {
  const source = join(SOURCE, id);
  const output = join(OUTPUT, id);
  const { css } = sass.compile(join(source, "theme.scss"), {
    loadPaths: ["node_modules"],
    style: "compressed",
    quietDeps: true,
    // Bootstrap 5.3 and Pulse use Sass features that Dart Sass now reports as deprecated.
    silenceDeprecations: ["import", "global-builtin", "color-functions", "if-function"],
  });
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
