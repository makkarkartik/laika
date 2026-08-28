import { useEffect, useRef, useState } from "react";
import { onHost, send } from "./bridge";
import type { ToolCard } from "@laika/core";

type Line =
  | { kind: "user"; text: string }
  | { kind: "assistant"; id: string; text: string; thought?: string | undefined; cards?: ToolCard[] | undefined }
  | { kind: "tick"; id: string; text: string; path?: string | undefined }
  | { kind: "error"; id: string; text: string };

type Approval = { id: string; summary: string; tier: string };

function fileLabel(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const i = normalized.lastIndexOf("/");
  return i < 0 ? normalized : normalized.slice(i + 1);
}

function upsertAssistant(prev: Line[], id: string): Line[] {
  if (prev.some((line) => line.kind === "assistant" && line.id === id)) return prev;
  return [...prev, { kind: "assistant", id, text: "", thought: "", cards: [] }];
}

type ModelItem = { id: string; label: string; provider: string };

const mark = document.getElementById("root")?.getAttribute("data-icon") ?? "";

function groupModels(models: ModelItem[]) {
  const providers = [...new Set(models.map((model) => model.provider))];
  if (providers.length < 2) return [{ label: "", items: models }];
  return providers.map((provider) => ({
    label: provider === "openai" ? "OpenAI" : provider === "anthropic" ? "Anthropic" : provider,
    items: models.filter((model) => model.provider === provider),
  }));
}

const MACHINE = /^(classifying|seeding context|planning|thinking|turn \d+|steer:|tools:|no tools)/i;

function whisperParts(thought: string) {
  return thought.split("\n").map((line) => line.trim()).filter(Boolean);
}

function soften(line: string): string | null {
  if (/^no tools; ready to deliver$/i.test(line)) return null;
  if (/^thinking$/i.test(line)) return "thinking";
  if (/^seeding context$/i.test(line)) return "looking around";
  if (/^planning$/i.test(line)) return "laying a path";
  if (/^classifying · /i.test(line)) return "catching the ask";
  if (/^tools: /i.test(line)) return line.replace(/^tools: /i, "reaching for ");
  if (/^turn \d+$/i.test(line)) return "another pass";
  if (/^steer: /i.test(line)) return line.replace(/^steer: /i, "heard · ");
  return line;
}

function thoughtPreview(line: string) {
  return line.length <= 88 ? line : `…${line.slice(-88)}`;
}

function Thought({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const raw = whisperParts(text);
  const voice = raw.filter((line) => !MACHINE.test(line));
  const trail = raw.map(soften).filter((line): line is string => Boolean(line));
  if (!live && voice.length === 0) return null;
  const shown = (live ? voice.at(-1) ?? trail.at(-1) : voice.at(-1)) ?? "thinking";
  const full = (voice.length ? voice : trail).join("\n");
  return (
    <button
      className={`whisper${open ? " is-open" : ""}${live ? " is-live" : ""}`}
      type="button"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
    >
      {open ? <span className="whisper-full">{full}</span> : thoughtPreview(shown)}
    </button>
  );
}

function ModelMenu({
  models,
  modelId,
  onPick,
}: {
  models: ModelItem[];
  modelId: string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const current = models.find((model) => model.id === modelId);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="model-wrap" ref={wrap}>
      <button
        className="model"
        type="button"
        aria-label="Model"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {current?.label ?? "Model"}
      </button>
      {open ? (
        <div className="model-menu" role="listbox" aria-label="Models">
          {groupModels(models).map((group) => (
            <div key={group.label || "all"}>
              {group.label ? <div className="model-group">{group.label}</div> : null}
              {group.items.map((model) => (
                <button
                  className={model.id === modelId ? "model-item is-on" : "model-item"}
                  type="button"
                  role="option"
                  aria-selected={model.id === modelId}
                  key={model.id}
                  onClick={() => {
                    onPick(model.id);
                    setOpen(false);
                  }}
                >
                  {model.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function upsertCard(cards: ToolCard[] | undefined, card: ToolCard): ToolCard[] {
  const rows = cards ?? [];
  const i = rows.findIndex((row) => row.id === card.id);
  if (i < 0) return [...rows, card];
  const next = rows.slice();
  next[i] = card;
  return next;
}

function peekLines(text: string, n: number) {
  return text.split("\n").filter((line) => line.length > 0).slice(0, n).join("\n");
}

function EditCard({ card }: { card: Extract<ToolCard, { kind: "edit" }> }) {
  const [open, setOpen] = useState(false);
  const peek = open ? card.hunks : card.hunks.slice(0, 8);
  return (
    <div className="card edit">
      <button className="card-head" type="button" onClick={() => send({ type: "editor/reveal", path: card.path })}>
        <span className="card-path">{card.path}</span>
        <span className="card-meta">
          {card.deleted ? <em className="gone">gone</em> : card.created ? <em>new</em> : null}
          <span className="plus">+{card.plus}</span>
          <span className="minus">−{card.minus}</span>
        </span>
      </button>
      {peek.length ? (
        <button className="card-body" type="button" onClick={() => setOpen((value) => !value)}>
          {peek.map((hunk, i) => (
            <div className={`hunk is-${hunk.type}`} key={`${card.id}-${i}`}>
              {hunk.text || " "}
            </div>
          ))}
          {!open && card.hunks.length > peek.length ? <div className="card-more">Show {card.hunks.length - peek.length} more</div> : null}
        </button>
      ) : null}
    </div>
  );
}

function CommandCard({ card }: { card: Extract<ToolCard, { kind: "command" }> }) {
  const [open, setOpen] = useState(false);
  const peek = card.running ? "running…" : peekLines(card.output, 4);
  const more = !card.running && card.output.split("\n").length > 4;
  return (
    <div className={card.error ? "card cmd is-err" : "card cmd"}>
      <button className="card-head" type="button" onClick={() => setOpen((value) => !value)}>
        <span className="card-path">
          <span className="chev">{open ? "▾" : "▸"}</span> $ {card.command}
        </span>
        <span className="card-meta">
          {card.running ? "running" : card.exit != null ? `exit ${card.exit}` : null}
        </span>
      </button>
      {open && card.output ? (
        <pre className="card-out">{card.output}</pre>
      ) : peek ? (
        <button className="card-body" type="button" onClick={() => setOpen(true)}>
          <pre className="card-out is-peek">
            {peek}
            {more ? "\n…" : ""}
          </pre>
        </button>
      ) : null}
    </div>
  );
}

function LogCard({ card }: { card: Extract<ToolCard, { kind: "log" }> }) {
  if (card.path) {
    return (
      <button className="tick-line is-file" type="button" onClick={() => send({ type: "editor/reveal", path: card.path ?? "" })}>
        {card.text}
      </button>
    );
  }
  return <div className="tick-line">{card.text}</div>;
}

function Cards({ cards }: { cards: ToolCard[] }) {
  return (
    <div className="cards">
      {cards.map((card) =>
        card.kind === "edit" ? (
          <EditCard key={card.id} card={card} />
        ) : card.kind === "command" ? (
          <CommandCard key={card.id} card={card} />
        ) : (
          <LogCard key={card.id} card={card} />
        ),
      )}
    </div>
  );
}

export function App() {
  const [ready, setReady] = useState(false);
  const [orbit, setOrbit] = useState(false);
  const [status, setStatus] = useState("idle · set an API key to start");
  const [mode, setMode] = useState("Guarded");
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<Approval | undefined>();
  const [models, setModels] = useState<Array<{ id: string; label: string; provider: string }>>([]);
  const [modelId, setModelId] = useState("");
  const [lit, setLit] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const off = onHost((message) => {
      if (message.type === "ready") setReady(true);
      if (message.type === "orbit/set") setOrbit(message.open);
      if (message.type === "status") setStatus(message.text);
      if (message.type === "session/restore") {
        setLines(message.lines);
        setBusy(message.busy);
        setStatus(message.status);
      }
      if (message.type === "composer/attached") {
        setAttachments((prev) => [...new Set([...prev, ...message.paths])]);
      }
      if (message.type === "models") {
        setModels(message.items);
        setModelId(message.current);
      }
      if (message.type === "autonomy") {
        setMode(message.mode === "manual" ? "Manual" : message.mode === "autonomous" ? "Autonomous" : "Guarded");
      }
      if (message.type === "chat/start") {
        setBusy(true);
        setLines((prev) => upsertAssistant(prev, message.id));
      }
      if (message.type === "thought/delta") {
        setLines((prev) => {
          const rows = upsertAssistant(prev, message.id);
          return rows.map((line) =>
            line.kind === "assistant" && line.id === message.id
              ? { ...line, thought: `${line.thought ?? ""}${message.text}` }
              : line,
          );
        });
      }
      if (message.type === "chat/delta") {
        setLines((prev) => {
          const rows = upsertAssistant(prev, message.id);
          return rows.map((line) =>
            line.kind === "assistant" && line.id === message.id
              ? { ...line, text: line.text + message.text }
              : line,
          );
        });
      }
      if (message.type === "tool/card") {
        setLines((prev) => {
          const rows = upsertAssistant(prev, message.id);
          return rows.map((line) => {
            if (line.kind !== "assistant" || line.id !== message.id) return line;
            return { ...line, cards: upsertCard(line.cards, message.card) };
          });
        });
      }
      if (message.type === "tool/log") {
        setLines((prev) => {
          const rows = upsertAssistant(prev, message.id);
          return rows.map((line) => {
            if (line.kind !== "assistant" || line.id !== message.id) return line;
            const card: ToolCard = message.path !== undefined
              ? { kind: "log", id: `${message.id}-log-${(line.cards ?? []).length}`, text: message.summary, path: message.path }
              : { kind: "log", id: `${message.id}-log-${(line.cards ?? []).length}`, text: message.summary };
            return { ...line, cards: upsertCard(line.cards, card) };
          });
        });
      }
      if (message.type === "chat/done") {
        setBusy(false);
        setApproval(undefined);
      }
      if (message.type === "chat/error") {
        setBusy(false);
        setLines((prev) => [...prev, { kind: "error", id: message.id, text: message.message }]);
      }
      if (message.type === "approval/ask") {
        setApproval({ id: message.id, summary: message.summary, tier: message.tier });
      }
      if (message.type === "approval/clear") setApproval(undefined);
    });
    send({ type: "hello" });
    return off;
  }, []);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines, approval]);

  function submit() {
    const text = draft.trim();
    if (!text && attachments.length === 0) return;
    const display = text || `Attached ${attachments.join(", ")}`;
    setDraft("");
    if (box.current) box.current.style.height = "";
    const files = attachments;
    setAttachments([]);
    setLines((prev) => [...prev, { kind: "user", text: display }]);
    send({ type: "chat/send", text, attachments: files });
  }

  const liveAssistantId = busy
    ? [...lines].reverse().find((row) => row.kind === "assistant")?.id
    : undefined;
  const canSend = Boolean(draft.trim() || attachments.length);

  return (
    <div className="shell">
      <header className="head">
        <strong>
          {mark ? <img className="mark" src={mark} alt="" /> : null}
          Laika
        </strong>
        <span className="mode">{mode}</span>
        <button className="expand" type="button" onClick={() => send({ type: "chat/popout" })}>
          Expand
        </button>
      </header>
      <div className="chat" ref={scroller}>
        {lines.length === 0 ? (
          <p className="hint">
            {ready
              ? "Chat is the product. Edits and commands peek in the turn — click to expand. File deltas also land in the editor."
              : "Connecting to the extension host…"}
          </p>
        ) : (
          lines.map((line, i) =>
            line.kind === "assistant" ? (
              <article className="msg assistant" key={line.id}>
                <div className="who">
                  Laika
                  {liveAssistantId === line.id ? <span className="ember" aria-hidden="true" /> : null}
                </div>
                <Thought text={line.thought ?? ""} live={liveAssistantId === line.id} />
                {line.cards?.length ? <Cards cards={line.cards} /> : null}
                {line.text ? <div className="body">{line.text}</div> : null}
              </article>
            ) : (
              <article
                className={`msg ${line.kind}`}
                key={line.kind === "user" ? `u-${i}` : line.id}
              >
                {line.kind !== "tick" ? (
                  <div className="who">{line.kind === "user" ? "You" : "Laika"}</div>
                ) : null}
                <div className="body">{line.text}</div>
              </article>
            ),
          )
        )}
      </div>
        <div className="dock">
        {approval ? (
          <div className="approve">
            <span>
              {approval.summary} · {approval.tier}
            </span>
            <span className="approve-actions">
              <button type="button" onClick={() => send({ type: "approval/respond", id: approval.id, decision: "allow" })}>
                Allow
              </button>
              <button type="button" onClick={() => send({ type: "approval/respond", id: approval.id, decision: "always" })}>
                Always
              </button>
              <button type="button" onClick={() => send({ type: "approval/respond", id: approval.id, decision: "deny" })}>
                Deny
              </button>
            </span>
          </div>
        ) : null}
        <div
          className={[
            "well",
            busy ? "is-busy" : "",
            !busy && status === "ready" ? "is-ready" : "",
            lit ? "is-lit" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="well-top">
            <span className="well-left">
              {models.length ? (
                <ModelMenu
                  models={models}
                  modelId={modelId}
                  onPick={(id) => {
                    setModelId(id);
                    send({ type: "model/set", id });
                  }}
                />
              ) : (
                <button className="ghost" type="button" onClick={() => send({ type: "keys/manage" })}>
                  Set a key
                </button>
              )}
              <span className="pulse" aria-hidden="true" />
              <span className="status-text">{status}</span>
            </span>
            <span className="well-right">
              {busy ? (
                <button className="ghost" type="button" onClick={() => send({ type: "chat/abort" })}>
                  Cancel
                </button>
              ) : null}
              <button
                className={orbit ? "ghost is-on" : "ghost"}
                type="button"
                onClick={() => send({ type: "orbit/toggle" })}
              >
                Orbit
              </button>
            </span>
          </div>
          {attachments.length ? (
            <div className="chips">
              {attachments.map((path) => (
                <span className="chip" key={path} title={path}>
                  {fileLabel(path)}
                  <button type="button" aria-label={`Remove ${path}`} onClick={() => setAttachments((prev) => prev.filter((row) => row !== path))}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <textarea
            ref={box}
            rows={3}
            placeholder={busy ? "Steer the next turn…" : "Message Laika"}
            value={draft}
            onFocus={() => setLit(true)}
            onBlur={() => setLit(false)}
            onChange={(e) => {
              setDraft(e.target.value);
              const node = e.target;
              node.style.height = "auto";
              node.style.height = `${Math.min(Math.max(node.scrollHeight, 72), 168)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && approval) {
                e.preventDefault();
                send({ type: "approval/respond", id: approval.id, decision: "deny" });
                return;
              }
              if (e.key === "Enter" && !e.shiftKey && approval) {
                e.preventDefault();
                send({ type: "approval/respond", id: approval.id, decision: "allow" });
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="well-bar">
            <button className="ghost" type="button" onClick={() => send({ type: "composer/attach" })}>
              + Attach
            </button>
            {models.length ? (
              <button className="ghost" type="button" onClick={() => send({ type: "keys/manage" })}>
                Keys
              </button>
            ) : null}
            <button
              className={canSend ? "send is-hot" : "send"}
              type="button"
              disabled={!canSend}
              onClick={submit}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
