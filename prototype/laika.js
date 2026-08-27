const drawer = document.getElementById("drawer");
const toggle = document.getElementById("drawerToggle");
const verb = document.querySelector(".status-verb");
const codeEl = document.getElementById("code");
const plusEl = document.getElementById("plus");
const minusEl = document.getElementById("minus");
const editLine = document.getElementById("editLine");
const assistantMsg = document.getElementById("assistantMsg");
const aerial = document.getElementById("aerial");
const stripEl = document.getElementById("strip");
const mosaicEl = document.getElementById("mosaic");
const aerialSub = document.getElementById("aerialSub");
const aerialStats = document.getElementById("aerialStats");
const tabsEl = document.getElementById("tabs");

const REPO = [
  "apps/web/main.ts",
  "apps/web/router.ts",
  "apps/web/session.ts",
  "apps/web/layout.ts",
  "apps/web/nav.ts",
  "apps/api/server.ts",
  "apps/api/health.ts",
  "apps/api/users.ts",
  "src/index.ts",
  "src/auth.ts",
  "src/auth.test.ts",
  "src/rateLimit.ts",
  "src/errors.ts",
  "src/config.ts",
  "src/db.ts",
  "src/logger.ts",
  "src/env.ts",
  "src/routes/login.ts",
  "src/routes/logout.ts",
  "src/routes/me.ts",
  "src/routes/signup.ts",
  "src/http/client.ts",
  "src/http/retry.ts",
  "src/http/headers.ts",
  "src/models/user.ts",
  "src/models/session.ts",
  "middleware/cors.ts",
  "middleware/session.ts",
  "middleware/trace.ts",
  "packages/ui/button.ts",
  "packages/ui/input.ts",
  "packages/ui/dialog.ts",
  "packages/ui/theme.ts",
  "packages/ui/select.ts",
  "lib/crypto.ts",
  "lib/time.ts",
  "lib/result.ts",
  "lib/assert.ts",
  "tests/e2e/login.spec.ts",
  "tests/e2e/logout.spec.ts",
  "tests/helpers.ts",
  "tests/unit/auth.spec.ts",
  "docs/auth.md",
  "scripts/seed.ts",
  "package.json",
  "tsconfig.json",
];

const AUTH_BASE = [
  { t: "export async function signIn(req: Request) {", k: "same" },
  { t: "  const session = await readSession(req)", k: "same" },
  { t: "  if (!session) throw new AuthError()", k: "same" },
  { t: "  return authorize(session)", k: "same" },
  { t: "}", k: "same" },
];

const RATE_LIMIT_NEW = [
  "import { buckets } from \"./buckets\"",
  "import { RateLimitError } from \"./errors\"",
  "import { config } from \"./config\"",
  "",
  "export type LimitResult =",
  "  | { ok: true; session: Session; remaining: number }",
  "  | { ok: false; retryAfter: number }",
  "",
  "type Bucket = {",
  "  tokens: number",
  "  updatedAt: number",
  "}",
  "",
  "const memory = new Map<string, Bucket>()",
  "",
  "function refill(bucket: Bucket, now: number) {",
  "  const elapsed = (now - bucket.updatedAt) / 1000",
  "  const next = Math.min(",
  "    config.rateLimit.capacity,",
  "    bucket.tokens + elapsed * config.rateLimit.refillPerSec",
  "  )",
  "  return { tokens: next, updatedAt: now }",
  "}",
  "",
  "export async function rateLimit(session: Session): Promise<LimitResult> {",
  "  const now = Date.now()",
  "  const key = session.id",
  "  const current = memory.get(key) ?? { tokens: config.rateLimit.capacity, updatedAt: now }",
  "  const filled = refill(current, now)",
  "  if (filled.tokens < 1) {",
  "    const retryAfter = Math.ceil((1 - filled.tokens) / config.rateLimit.refillPerSec)",
  "    await buckets.recordReject(key, retryAfter)",
  "    return { ok: false, retryAfter }",
  "  }",
  "  filled.tokens -= 1",
  "  memory.set(key, filled)",
  "  await buckets.recordPass(key, filled.tokens)",
  "  return { ok: true, session, remaining: Math.floor(filled.tokens) }",
  "}",
  "",
  "export async function peekLimit(id: string) {",
  "  const now = Date.now()",
  "  const current = memory.get(id)",
  "  if (!current) {",
  "    return { remaining: config.rateLimit.capacity, retryAfter: 0 }",
  "  }",
  "  const filled = refill(current, now)",
  "  return {",
  "    remaining: Math.floor(filled.tokens),",
  "    retryAfter: filled.tokens < 1",
  "      ? Math.ceil((1 - filled.tokens) / config.rateLimit.refillPerSec)",
  "      : 0,",
  "  }",
  "}",
  "",
  "export function drain(id: string) {",
  "  memory.set(id, { tokens: 0, updatedAt: Date.now() })",
  "}",
  "",
  "export function resetAll() {",
  "  memory.clear()",
  "}",
];

const TEST_ADDS = [
  "test(\"signIn rejects when the bucket is empty\", async () => {",
  "  drain(user.id)",
  "  await expect(signIn(req)).rejects.toBeInstanceOf(RateLimitError)",
  "})",
  "",
  "test(\"signIn decrements remaining tokens\", async () => {",
  "  const first = await signIn(req)",
  "  const second = await signIn(req)",
  "  expect(second.remaining).toBe(first.remaining - 1)",
  "})",
  "",
  "test(\"signIn refills after the window elapses\", async () => {",
  "  drain(user.id)",
  "  vi.advanceTimersByTime(2_000)",
  "  await expect(signIn(req)).resolves.toBeTruthy()",
  "})",
  "",
  "test(\"peekLimit reports retryAfter when empty\", async () => {",
  "  drain(user.id)",
  "  const peek = await peekLimit(user.id)",
  "  expect(peek.retryAfter).toBeGreaterThan(0)",
  "})",
  "",
  "test(\"resetAll restores capacity\", async () => {",
  "  drain(user.id)",
  "  resetAll()",
  "  const peek = await peekLimit(user.id)",
  "  expect(peek.remaining).toBe(config.rateLimit.capacity)",
  "})",
];

const RETRY_BASE = [
  { t: "export async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {", k: "same" },
  { t: "  let last: unknown", k: "same" },
  { t: "  for (let i = 0; i < attempts; i += 1) {", k: "same" },
  { t: "    try {", k: "same" },
  { t: "      return await fn()", k: "same" },
  { t: "    } catch (error) {", k: "same" },
  { t: "      last = error", k: "same" },
  { t: "      await sleep(100 * i)", k: "same" },
  { t: "    }", k: "same" },
  { t: "  }", k: "same" },
  { t: "  throw last", k: "same" },
  { t: "}", k: "same" },
];

const SESSION_BASE = [
  { t: "export function readBrowserSession() {", k: "same" },
  { t: "  const raw = document.cookie", k: "same" },
  { t: "  const match = raw.match(/sid=([^;]+)/)", k: "same" },
  { t: "  if (!match) return null", k: "same" },
  { t: "  return JSON.parse(atob(match[1]))", k: "same" },
  { t: "}", k: "same" },
];

const FILES = {
  "src/auth.ts": {
    badge: null,
    editor: AUTH_BASE.map((l) => ({ ...l })),
    hunks: [
      { k: "del", t: "  return authorize(session)" },
      { k: "add", t: "  const limited = await rateLimit(session)" },
      { k: "add", t: "  if (!limited.ok) throw new RateLimitError(limited.retryAfter)" },
      { k: "add", t: "  return authorize(limited.session)" },
    ],
  },
  "src/rateLimit.ts": {
    badge: "new",
    editor: [],
    hunks: RATE_LIMIT_NEW.map((t) => ({ k: "add", t })),
  },
  "src/http/retry.ts": {
    badge: null,
    editor: RETRY_BASE.map((l) => ({ ...l })),
    hunks: [
      { k: "del", t: "  let last: unknown" },
      { k: "del", t: "  for (let i = 0; i < attempts; i += 1) {" },
      { k: "del", t: "    try {" },
      { k: "del", t: "      return await fn()" },
      { k: "del", t: "    } catch (error) {" },
      { k: "del", t: "      last = error" },
      { k: "del", t: "      await sleep(100 * i)" },
      { k: "del", t: "    }" },
      { k: "del", t: "  }" },
      { k: "del", t: "  throw last" },
      { k: "add", t: "  const delays = [200, 800, 2400].slice(0, attempts)" },
      { k: "add", t: "  let error: unknown" },
      { k: "add", t: "  for (const ms of delays) {" },
      { k: "add", t: "    try {" },
      { k: "add", t: "      return await fn()" },
      { k: "add", t: "    } catch (caught) {" },
      { k: "add", t: "      error = caught" },
      { k: "add", t: "      if (caught instanceof RateLimitError) throw caught" },
      { k: "add", t: "      await sleep(ms + Math.random() * 40)" },
      { k: "add", t: "    }" },
      { k: "add", t: "  }" },
      { k: "add", t: "  throw error" },
    ],
  },
  "src/logger.ts": {
    badge: null,
    editor: [
      { t: "export function log(level: string, msg: string) {", k: "same" },
      { t: "  if (level === \"debug\" && !config.verbose) return", k: "same" },
      { t: "  console.log(level, msg)", k: "same" },
      { t: "}", k: "same" },
      { t: "export function debug(...args: unknown[]) {", k: "same" },
      { t: "  console.debug(...args)", k: "same" },
      { t: "}", k: "same" },
      { t: "export function trace(span: string, meta: object) {", k: "same" },
      { t: "  spans.push({ span, meta, at: Date.now() })", k: "same" },
      { t: "}", k: "same" },
      { t: "export function dumpSpans() {", k: "same" },
      { t: "  return spans.splice(0)", k: "same" },
      { t: "}", k: "same" },
      { t: "const spans: { span: string; meta: object; at: number }[] = []", k: "same" },
    ],
    hunks: [
      { k: "del", t: "export function debug(...args: unknown[]) {" },
      { k: "del", t: "  console.debug(...args)" },
      { k: "del", t: "}" },
      { k: "del", t: "export function trace(span: string, meta: object) {" },
      { k: "del", t: "  spans.push({ span, meta, at: Date.now() })" },
      { k: "del", t: "}" },
      { k: "del", t: "export function dumpSpans() {" },
      { k: "del", t: "  return spans.splice(0)" },
      { k: "del", t: "}" },
      { k: "del", t: "const spans: { span: string; meta: object; at: number }[] = []" },
    ],
  },
  "apps/web/session.ts": {
    badge: null,
    editor: SESSION_BASE.map((l) => ({ ...l })),
    hunks: [
      { k: "del", t: "  const raw = document.cookie" },
      { k: "del", t: "  const match = raw.match(/sid=([^;]+)/)" },
      { k: "del", t: "  if (!match) return null" },
      { k: "del", t: "  return JSON.parse(atob(match[1]))" },
      { k: "add", t: "  const cached = sessionStorage.getItem(\"sid\")" },
      { k: "add", t: "  const raw = cached ?? document.cookie.match(/sid=([^;]+)/)?.[1]" },
      { k: "add", t: "  if (!raw) return null" },
      { k: "add", t: "  try {" },
      { k: "add", t: "    const session = JSON.parse(atob(raw))" },
      { k: "add", t: "    if (session.exp * 1000 < Date.now()) return null" },
      { k: "add", t: "    return session" },
      { k: "add", t: "  } catch {" },
      { k: "add", t: "    return null" },
      { k: "add", t: "  }" },
    ],
  },
  "src/auth.test.ts": {
    badge: null,
    editor: [
      { t: 'test("signIn returns a session", async () => {', k: "same" },
      { t: "  await expect(signIn(req)).resolves.toBeTruthy()", k: "same" },
      { t: "})", k: "same" },
      { t: 'test("signIn never throttles a valid session", async () => {', k: "same" },
      { t: "  await signIn(req)", k: "same" },
      { t: "  await expect(signIn(req)).resolves.toBeTruthy()", k: "same" },
      { t: "})", k: "same" },
    ],
    hunks: [
      { k: "del", t: 'test("signIn never throttles a valid session", async () => {' },
      { k: "del", t: "  await signIn(req)" },
      { k: "del", t: "  await expect(signIn(req)).resolves.toBeTruthy()" },
      { k: "del", t: "})" },
      ...TEST_ADDS.map((t) => ({ k: "add", t })),
    ],
  },
  "src/errors.ts": {
    size: "sm",
    badge: null,
    editor: [{ t: "export class AuthError extends Error {}", k: "same" }],
    hunks: [
      { k: "add", t: "export class RateLimitError extends AuthError {" },
      { k: "add", t: '  constructor(readonly retryAfter: number) { super("rate limited") }' },
      { k: "add", t: "}" },
    ],
  },
  "src/config.ts": {
    size: "sm",
    badge: null,
    editor: [
      { t: "export const config = {", k: "same" },
      { t: "  sessionTtl: 3600,", k: "same" },
      { t: "}", k: "same" },
    ],
    hunks: [{ k: "add", t: "  rateLimit: { capacity: 20, refillPerSec: 0.5 }," }],
  },
  "middleware/session.ts": {
    size: "sm",
    badge: null,
    editor: [
      { t: "export async function attachSession(req: Request) {", k: "same" },
      { t: "  req.session = await readSession(req)", k: "same" },
      { t: "}", k: "same" },
    ],
    hunks: [{ k: "add", t: "  req.rateLimit = await buckets.peek(req.session?.id)" }],
  },
};

const SEARCH_HITS = [
  "src/auth.ts",
  "src/routes/login.ts",
  "src/config.ts",
  "src/http/retry.ts",
  "src/logger.ts",
  "middleware/session.ts",
  "apps/web/session.ts",
  "docs/auth.md",
];

let state = resetState();
let timer = 0;
let caret = -1;
let generation = 0;

function resetState() {
  const files = {};
  for (const [path, spec] of Object.entries(FILES)) {
    files[path] = {
      path,
      badge: spec.badge,
      plus: 0,
      minus: 0,
      shown: 0,
      live: false,
      review: null,
      editor: spec.editor.map((l) => ({ ...l })),
    };
  }
  return {
    files,
    read: new Set(),
    focused: "src/auth.ts",
    selected: null,
    selectedBucket: null,
    livePath: null,
  };
}

function paint(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\b(export|async|function|const|await|if|throw|new|return|test|class|extends|constructor|readonly|super)\b/g, '<span class="kw">$1</span>');
}

function splitPath(path) {
  const i = path.lastIndexOf("/");
  return i === -1 ? { dir: "", name: path } : { dir: path.slice(0, i + 1), name: path.slice(i + 1) };
}

function dirname(path) {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function fileKind(path) {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (/\.(test|spec)\.[^.]+$/.test(name)) return "tests";
  if (/(^|\/)(__tests__|tests?)\//.test(path)) return "tests";
  if (/\.(md|mdx|rst)$/.test(name) || /(^|\/)docs\//.test(path)) return "docs";
  const stem = name.replace(/\.[^.]+$/, "");
  if (/^(config|env|settings)$/.test(stem) || /\.config\./.test(name)) return "config";
  if (/^(package|tsconfig|jsconfig|cargo|pyproject|go|makefile|dockerfile|procfile)$/.test(stem)) return "config";
  if (!path.includes("/") && /\.(json|ya?ml|toml|ini|lock)$/.test(name)) return "config";
  return null;
}

function analyzeTree(paths) {
  const filesAt = new Map([["", []]]);
  const children = new Map([["", new Set()]]);
  const ensure = (dir) => {
    if (!filesAt.has(dir)) filesAt.set(dir, []);
    if (!children.has(dir)) children.set(dir, new Set());
  };
  for (const path of paths) {
    const parts = path.split("/");
    parts.pop();
    let prefix = "";
    for (const part of parts) {
      ensure(prefix);
      children.get(prefix).add(part);
      prefix = prefix ? `${prefix}/${part}` : part;
      ensure(prefix);
    }
    ensure(prefix);
    filesAt.get(prefix).push(path);
  }
  return { filesAt, children };
}

function describeBucket(id) {
  if (!id.includes("/")) return { id, label: id, parent: "" };
  const i = id.lastIndexOf("/");
  return { id, label: id.slice(i + 1), parent: id.slice(0, i + 1) };
}

function inferBuckets(paths) {
  const { filesAt, children } = analyzeTree(paths);
  const isNamespace = (dir) => (filesAt.get(dir) || []).length === 0 && (children.get(dir) || new Set()).size >= 1;
  const thick = new Set();
  for (const [dir, kids] of children) {
    if (!dir || isNamespace(dir)) continue;
    for (const kid of kids) {
      const prefix = `${dir}/${kid}`;
      const n = paths.filter((path) => dirname(path) === prefix).length;
      if (n >= 3) thick.add(prefix);
    }
  }

  const of = new Map();
  const first = new Map();
  for (const [i, path] of paths.entries()) {
    const kind = fileKind(path);
    let id = kind;
    if (!id) {
      const parts = path.split("/");
      if (parts.length === 1) id = "root";
      else if (isNamespace(parts[0])) id = `${parts[0]}/${parts[1]}`;
      else {
        const nested = `${parts[0]}/${parts[1]}`;
        id = thick.has(nested) ? nested : parts[0];
      }
    }
    of.set(path, id);
    if (!first.has(id)) first.set(id, i);
  }
  const kindRank = { tests: 1, config: 2, docs: 3 };
  const order = [...first.keys()]
    .sort((a, b) => {
      const ka = kindRank[a] || 0;
      const kb = kindRank[b] || 0;
      if (ka !== kb) return ka - kb;
      return first.get(a) - first.get(b);
    })
    .map(describeBucket);
  return { of, order };
}

const BUCKETS = inferBuckets(REPO);

function bucketOf(path) {
  return BUCKETS.of.get(path) || dirname(path) || "root";
}

function bucketMeta(id) {
  return BUCKETS.order.find((bucket) => bucket.id === id) || describeBucket(id);
}

function pathsInBucket(id) {
  return REPO.filter((path) => bucketOf(path) === id);
}

function activeBucket() {
  if (state.selectedBucket) return state.selectedBucket;
  if (state.livePath) return bucketOf(state.livePath);
  if (state.selected) return bucketOf(state.selected);
  return null;
}

function fileDelta(file) {
  return file.plus + file.minus;
}

function editedCount() {
  return Object.keys(FILES).length;
}

function totals() {
  let plus = 0;
  let minus = 0;
  let n = 0;
  for (const file of Object.values(state.files)) {
    if (file.shown === 0 && !file.live) continue;
    n += 1;
    plus += file.plus;
    minus += file.minus;
  }
  return { plus, minus, n };
}

function renderEditor() {
  const file = state.files[state.focused];
  const lines = file ? file.editor : [];
  let n = 0;
  codeEl.innerHTML = lines
    .map((line, i) => {
      if (line.k !== "del") n += 1;
      const num = line.k === "del" ? "" : String(n);
      const caretCls = i === caret ? " caret" : "";
      return `<div class="line ${line.k}${caretCls}"><i class="gutter"></i><span class="ln">${num}</span><span class="src">${paint(line.t)}</span></div>`;
    })
    .join("");
}

function renderTabs() {
  const open = ["src/auth.ts", "src/auth.test.ts", "src/rateLimit.ts"];
  tabsEl.innerHTML = open
    .map((path) => {
      const file = state.files[path];
      const on = path === state.focused ? " is-on" : "";
      const { name } = splitPath(path);
      const delta =
        file && fileDelta(file)
          ? `<span class="tab-delta"><span class="plus">+${file.plus}</span> <span class="minus">−${file.minus}</span></span>`
          : "";
      return `<button class="tab${on}" type="button" data-path="${path}">${name}${delta}</button>`;
    })
    .join("");
}

function setTicker() {
  const live = state.livePath ? state.files[state.livePath] : null;
  const focused = state.files[state.focused];
  const file = live || focused;
  const { plus, minus } = file ? { plus: file.plus, minus: file.minus } : totals();
  plusEl.textContent = `+${plus}`;
  minusEl.textContent = `−${minus}`;
  const label = document.querySelector(".edit-label");
  if (live) label.textContent = `Editing ${live.path}`;
  else if (totals().n) label.textContent = `Edited ${state.focused}`;
}

function cellClass(path) {
  const file = state.files[path];
  const classes = ["cell"];
  if (state.livePath === path) classes.push("is-live");
  else if (file && file.shown) {
    classes.push("is-hot");
    if (file.plus && file.minus) classes.push("is-mix");
    else if (file.minus > file.plus) classes.push("is-del");
    if (file.badge === "new") classes.push("is-new");
  } else if (state.read.has(path)) classes.push("is-read");
  return classes.join(" ");
}

function churnOf(file) {
  return file.plus + file.minus;
}

function tileSize(file) {
  const n = churnOf(file);
  if (file.badge === "new" && n >= 40) return "xl";
  if (n >= 24) return "lg";
  if (n >= 8) return "md";
  return file.size || "sm";
}

function renderStrip() {
  const mapped = activeBucket();
  stripEl.innerHTML = BUCKETS.order
    .map((bucket) => {
      const paths = pathsInBucket(bucket.id);
      if (!paths.length) return "";
      const hot = paths.some((path) => {
        const file = state.files[path];
        return file && (file.shown > 0 || file.live);
      });
      const live = paths.some((path) => state.livePath === path);
      const on = mapped === bucket.id;
      const cells = paths
        .map((path) => {
          const file = state.files[path];
          const title = file && file.shown ? `${path}  +${file.plus} −${file.minus}` : path;
          return `<button class="${cellClass(path)}" type="button" data-path="${path}" title="${title}"></button>`;
        })
        .join("");
      return `<div class="strip-group${hot ? " is-hot" : ""}${live ? " is-live" : ""}${on ? " is-on" : ""}" data-bucket="${bucket.id}">
      <div class="strip-label">${bucket.parent ? `<span>${bucket.parent}</span>` : ""}${bucket.label}</div>
      <div class="strip-cells">${cells}</div>
    </div>`;
    })
    .join("");
}

function hunkLines(file) {
  return FILES[file.path].hunks.slice(0, file.shown).map(
    (line) =>
      `<div class="line ${line.k}"><i class="gutter"></i><span class="src">${paint(line.t)}</span></div>`
  );
}

function renderTile(file) {
  const { dir, name } = splitPath(file.path);
  const live = file.live ? " is-live" : "";
  const on = state.selected === file.path ? " is-on" : "";
  const review = file.review ? ` is-${file.review}` : "";
  const badge = file.badge === "new" ? `<span class="badge-new">new</span>` : "";
  const acts =
    document.body.dataset.scene === "review"
      ? `<div class="tile-acts"><button type="button" data-act="accept" data-path="${file.path}">accept</button><button class="danger" type="button" data-act="reject" data-path="${file.path}">reject</button></div>`
      : "";
  return `<article class="tile is-${tileSize(file)}${live}${on}${review}" data-path="${file.path}">
    <div class="tile-top">
      <div class="tile-path"><span>${dir}</span><b>${name}</b></div>
      <div class="tile-meta">${badge}<span class="plus">+${file.plus}</span> <span class="minus">−${file.minus}</span></div>
    </div>
    <div class="tile-hunks">${hunkLines(file).join("")}</div>
    ${acts}
  </article>`;
}

function renderMosaic() {
  const tiles = Object.values(state.files).filter((f) => f.shown > 0 || f.live);
  if (!tiles.length) {
    mosaicEl.innerHTML = `<div class="mosaic-empty">Waiting for the first mutation. The strip above is the workspace, bucketed from the tree and file types.</div>`;
    return;
  }
  const mapped = activeBucket();
  const byBucket = new Map();
  for (const file of tiles) {
    const id = bucketOf(file.path);
    if (!byBucket.has(id)) byBucket.set(id, []);
    byBucket.get(id).push(file);
  }
  mosaicEl.innerHTML = BUCKETS.order
    .map((bucket) => {
      const files = byBucket.get(bucket.id);
      if (!files) return "";
      const plus = files.reduce((n, f) => n + f.plus, 0);
      const minus = files.reduce((n, f) => n + f.minus, 0);
      const live = files.some((f) => f.live);
      const on = mapped === bucket.id;
      return `<section class="band${live ? " is-live" : ""}${on ? " is-on" : ""}" data-bucket="${bucket.id}">
      <header class="band-head">
        <b>${bucket.label}</b>
        ${bucket.parent ? `<span class="origin">${bucket.parent}</span>` : ""}
        <em>${files.length} file${files.length === 1 ? "" : "s"} · <span class="plus">+${plus}</span> <span class="minus">−${minus}</span></em>
      </header>
      <div class="band-tiles">${files.map(renderTile).join("")}</div>
    </section>`;
    })
    .join("");
  const focus = state.livePath ? bucketOf(state.livePath) : mapped;
  if (focus) {
    mosaicEl.querySelector(`[data-bucket="${focus}"]`)?.scrollIntoView({ block: "nearest" });
  }
}

function renderOrbit() {
  const { plus, minus, n } = totals();
  aerialStats.innerHTML = `${n} file${n === 1 ? "" : "s"} · <span class="plus">+${plus}</span> <span class="minus">−${minus}</span>`;
  if (state.livePath) {
    aerialSub.textContent = `morphing · ${bucketMeta(bucketOf(state.livePath)).label} · ${state.livePath}`;
  } else if (n) {
    const names = BUCKETS.order
      .filter((bucket) =>
        Object.values(state.files).some((file) => (file.shown > 0 || file.live) && bucketOf(file.path) === bucket.id)
      )
      .map((bucket) => bucket.label);
    aerialSub.textContent = `${names.join(" · ")} · one plane`;
  } else aerialSub.textContent = "workspace · waiting";
  renderStrip();
  renderMosaic();
}

function render() {
  renderEditor();
  renderTabs();
  setTicker();
  renderOrbit();
}

function sleep(ms) {
  return new Promise((resolve) => {
    timer = window.setTimeout(resolve, ms);
  });
}

function setOrbit(open) {
  document.body.dataset.orbit = open ? "on" : "off";
  aerial.hidden = !open;
  document.getElementById("actOrbit").classList.toggle("is-armed", open);
  document.getElementById("orbitToggle").classList.toggle("is-on", open);
}

function focusFile(path) {
  if (!state.files[path]) return;
  state.focused = path;
  state.selected = path;
  state.selectedBucket = bucketOf(path);
  caret = -1;
  render();
}

function applyHunkToEditor(file, hunk) {
  if (hunk.k === "del") {
    const i = file.editor.findIndex((l) => l.t === hunk.t && l.k !== "del");
    if (i >= 0) {
      file.editor[i] = { ...file.editor[i], k: "del" };
      caret = i;
    }
    return;
  }
  file.editor = file.editor.filter((l) => l.k !== "del");
  if (file.badge === "new") {
    file.editor.push({ t: hunk.t, k: "add" });
    caret = file.editor.length - 1;
    return;
  }
  const close = file.editor.findIndex((l) => l.t === "}");
  const at = close >= 0 ? close : file.editor.length;
  file.editor.splice(at, 0, { t: hunk.t, k: "add" });
  caret = at;
}

function applyHunk(path) {
  const file = state.files[path];
  const hunk = FILES[path].hunks[file.shown];
  if (!hunk) return false;
  file.shown += 1;
  if (hunk.k === "add") file.plus += 1;
  if (hunk.k === "del") file.minus += 1;
  applyHunkToEditor(file, hunk);
  if (hunk.k === "del") file.editor = file.editor.filter((l) => l.k !== "del");
  return true;
}

async function revealFile(path, gen) {
  const spec = FILES[path];
  const file = state.files[path];
  const batch = spec.hunks.length > 16 ? 10 : 1;
  while (file.shown < spec.hunks.length) {
    if (gen !== generation) return;
    const n = Math.min(batch, spec.hunks.length - file.shown);
    for (let i = 0; i < n; i += 1) applyHunk(path);
    if (document.body.dataset.orbit !== "on") state.focused = path;
    render();
    await sleep(batch > 1 ? 70 : 180);
  }
}

function snapToFinal() {
  for (const file of Object.values(state.files)) {
    const spec = FILES[file.path];
    file.live = false;
    file.review = null;
    file.shown = spec.hunks.length;
    file.plus = spec.hunks.filter((h) => h.k === "add").length;
    file.minus = spec.hunks.filter((h) => h.k === "del").length;
    file.editor = spec.editor.map((l) => ({ ...l }));
    for (const hunk of spec.hunks) applyHunkToEditor(file, hunk);
    file.editor = file.editor.filter((l) => l.k !== "del");
  }
  state.livePath = null;
  caret = -1;
}

async function replay() {
  window.clearTimeout(timer);
  generation += 1;
  const gen = generation;
  state = resetState();
  caret = -1;
  assistantMsg.hidden = true;
  editLine.classList.remove("is-on");
  document.querySelectorAll(".tools [data-step]").forEach((el) => el.classList.remove("is-on"));
  render();

  if (document.body.dataset.scene !== "running") return;

  verb.textContent = "reading auth.ts";
  document.querySelector('[data-step="read"]').classList.add("is-on");
  state.read.add("src/auth.ts");
  renderOrbit();
  await sleep(450);
  if (gen !== generation) return;

  verb.textContent = "searching rateLimit";
  document.querySelector('[data-step="search"]').classList.add("is-on");
  SEARCH_HITS.forEach((p) => state.read.add(p));
  renderOrbit();
  await sleep(380);
  if (gen !== generation) return;

  editLine.classList.add("is-on");
  const order = [
    "src/auth.ts",
    "src/rateLimit.ts",
    "src/http/retry.ts",
    "src/logger.ts",
    "apps/web/session.ts",
    "src/errors.ts",
    "src/config.ts",
    "middleware/session.ts",
    "src/auth.test.ts",
  ];

  for (const path of order) {
    if (gen !== generation) return;
    state.livePath = path;
    state.files[path].live = true;
    verb.textContent = `editing ${splitPath(path).name}`;
    document.querySelector(".edit-label").textContent = `Editing ${path}`;
    if (document.body.dataset.orbit !== "on") state.focused = path;
    render();
    await revealFile(path, gen);
    state.files[path].live = false;
  }

  state.livePath = null;
  caret = -1;
  verb.textContent = "idle";
  document.querySelector(".edit-label").textContent = `Edited ${editedCount()} files`;
  assistantMsg.hidden = false;
  render();
}

function setDrawer(open) {
  drawer.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
}

toggle.addEventListener("click", (e) => {
  if (e.target.closest(".orbit-chip")) return;
  setDrawer(drawer.hidden);
});

document.getElementById("orbitChip").addEventListener("click", (e) => {
  e.stopPropagation();
  setOrbit(document.body.dataset.orbit !== "on");
});

document.getElementById("orbitToggle").addEventListener("click", () => {
  setOrbit(document.body.dataset.orbit !== "on");
});

document.getElementById("orbitClose").addEventListener("click", () => setOrbit(false));
document.getElementById("actOrbit").addEventListener("click", () => {
  setOrbit(document.body.dataset.orbit !== "on");
});

editLine.addEventListener("click", () => {
  if (totals().n > 1) setOrbit(true);
  else document.querySelector(".editor")?.scrollIntoView({ block: "nearest" });
});

tabsEl.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-path]");
  if (tab) focusFile(tab.dataset.path);
});

stripEl.addEventListener("click", (e) => {
  const cell = e.target.closest("[data-path]");
  if (cell) {
    const path = cell.dataset.path;
    state.selectedBucket = bucketOf(path);
    if (state.files[path] && (state.files[path].shown || state.files[path].live)) {
      state.selected = path;
    }
    renderOrbit();
    return;
  }
  const group = e.target.closest("[data-bucket]");
  if (group) {
    state.selectedBucket = group.dataset.bucket;
    state.selected = null;
    renderOrbit();
  }
});

mosaicEl.addEventListener("click", (e) => {
  const act = e.target.closest("[data-act]");
  if (act) {
    e.stopPropagation();
    const file = state.files[act.dataset.path];
    if (file) file.review = act.dataset.act === "accept" ? "accepted" : "rejected";
    renderOrbit();
    return;
  }
  const tile = e.target.closest(".tile[data-path]");
  if (tile) {
    const path = tile.dataset.path;
    state.selected = path;
    state.selectedBucket = bucketOf(path);
    if (e.detail === 2) {
      focusFile(path);
      setOrbit(false);
      return;
    }
    renderOrbit();
    return;
  }
  const band = e.target.closest("[data-bucket]");
  if (band) {
    state.selectedBucket = band.dataset.bucket;
    renderOrbit();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (document.body.dataset.orbit === "on") {
      setOrbit(false);
      return;
    }
    setDrawer(false);
  }
});

document.querySelectorAll(".scene").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".scene").forEach((b) => b.classList.remove("is-on"));
    btn.classList.add("is-on");
    const scene = btn.dataset.scene;
    document.body.dataset.scene = scene;
    verb.textContent = verb.dataset[scene] || "idle";
    if (scene === "onboard") {
      setDrawer(false);
      setOrbit(false);
    }
    if (scene === "running") replay();
    if (scene === "review") {
      window.clearTimeout(timer);
      generation += 1;
      verb.textContent = "idle";
      snapToFinal();
      editLine.classList.add("is-on");
      document.querySelector(".edit-label").textContent = `Edited ${editedCount()} files`;
      assistantMsg.hidden = false;
      setOrbit(true);
      render();
    }
  });
});

document.getElementById("replay").addEventListener("click", () => {
  document.body.dataset.scene = "running";
  document.querySelectorAll(".scene").forEach((b) => b.classList.toggle("is-on", b.dataset.scene === "running"));
  replay();
});

document.body.dataset.scene = "running";
setOrbit(false);
replay();
