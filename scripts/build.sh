#!/usr/bin/env bash
# Build all Laika packages. Used by VS Code/Cursor preLaunchTask; avoids relying on npx being on PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "build.sh: node not found on PATH" >&2
  exit 127
fi

run_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    pnpm "$@"
    return
  fi
  if command -v corepack >/dev/null 2>&1; then
    corepack pnpm "$@"
    return
  fi
  if command -v npx >/dev/null 2>&1; then
    npx --yes pnpm@9.15.4 "$@"
    return
  fi
  echo "build.sh: pnpm not found (install pnpm, enable corepack, or add npx to PATH)" >&2
  exit 127
}

run_pnpm build
