import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

// The Orbit panel ships its UI as an inline <script> inside a template literal, which tsc cannot
// syntax-check. Parse it here so a broken quote fails the build instead of a silent dead panel.
checkInlineScript(join(here, "src", "orbit", "panel.ts"));

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

function checkInlineScript(file) {
  const source = readFileSync(file, "utf8");
  const match = /<script nonce="\$\{nonce\}">([\s\S]*?)<\/script>/.exec(source);
  if (!match) throw new Error(`${file}: inline Orbit script not found`);
  const body = match[1].replace("${data}", "{}");
  try {
    new Script(body, { filename: `${file}#inline-script` });
  } catch (err) {
    throw new Error(`Orbit inline script does not parse: ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
