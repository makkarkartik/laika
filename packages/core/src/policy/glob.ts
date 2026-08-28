/** Glob with `*` and `**`. Paths compared with forward slashes. */
export function globMatch(pattern: string, path: string): boolean {
  const value = path.replaceAll("\\", "/");
  const source = globToRegExp(pattern.replaceAll("\\", "/"));
  return source.test(value);
}

export function toPosix(path: string): string {
  return path.replaceAll("\\", "/");
}

export function globToRegExp(pattern: string): RegExp {
  let out = "^";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      const next = pattern[i + 2];
      if (next === "/") {
        out += "(?:.*/)?";
        i += 2;
      } else {
        out += ".*";
        i += 1;
      }
      continue;
    }
    if (ch === "*") {
      out += "[^/]*";
      continue;
    }
    if (ch === "?") {
      out += "[^/]";
      continue;
    }
    if (ch && /[.+^${}()|[\]\\]/.test(ch)) out += `\\${ch}`;
    else out += ch;
  }
  out += "$";
  return new RegExp(out, "i");
}

export function commandMatches(pattern: string, command: string): boolean {
  return globMatch(pattern.trim(), command.trim());
}
