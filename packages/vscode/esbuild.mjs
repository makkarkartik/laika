import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

mkdirSync(join(here, "dist"), { recursive: true });
copyFileSync(join(repoRoot, "models", "models.json"), join(here, "dist", "models.json"));

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  outfile: "dist/extension.js",
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
