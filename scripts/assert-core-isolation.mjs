import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const core = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "core", "src");
const banned = /from\s+["']vscode["']|require\(\s*["']vscode["']\s*\)/;

function scan(dir) {
  const hits = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) hits.push(...scan(path));
    else if (name.endsWith(".ts")) {
      if (banned.test(readFileSync(path, "utf8"))) hits.push(path);
    }
  }
  return hits;
}

const hits = scan(core);
if (hits.length) {
  console.error("@laika/core must not import vscode:\n" + hits.join("\n"));
  process.exit(1);
}
