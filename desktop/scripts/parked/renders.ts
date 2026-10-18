// Converts the handoff renders to WebP at 1600 px (previews) and 480 px (tiles) in src/assets/renders/.
// Run: pnpm renders. Imports go through Vite so files are hashed and bundled.
import { mkdirSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const src = fileURLToPath(new URL("../../handoff/renders/", import.meta.url));
const out = fileURLToPath(new URL("../src/assets/renders/", import.meta.url));
mkdirSync(out, { recursive: true });

for (const file of readdirSync(src).filter((f) => f.endsWith(".png"))) {
  const name = basename(file, ".png");
  for (const [suffix, width] of [["", 1600], ["-tile", 480]] as const) {
    const target = join(out, `${name}${suffix}.webp`);
    await sharp(join(src, file)).resize({ width, withoutEnlargement: true }).webp({ quality: suffix ? 78 : 84 }).toFile(target);
    process.stdout.write(`${target}\n`);
  }
}
