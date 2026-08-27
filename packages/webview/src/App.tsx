import { useEffect, useRef, useState } from "react";
import { onHost, send } from "./bridge";

type Line =
  | { kind: "user"; text: string }
  | { kind: "assistant"; id: string; text: string }
  | { kind: "error"; id: string; text: string };

export function App() {
  const [ready, setReady] = useState(false);
  const [orbit, setOrbit] = useState(false);
  const [status, setStatus] = useState("idle · set an API key to start");
  const [draft, setDraft] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const off = onHost((message) => {
      if (message.type === "ready") setReady(true);
      if (message.type === "orbit/set") setOrbit(message.open);
      if (message.type === "status") setStatus(message.text);
      if (message.type === "chat/start") {
        setBusy(true);
        setLines((prev) => [...prev, { kind: "assistant", id: message.id, text: "" }]);
      }
      if (message.type === "chat/delta") {
        setLines((prev) =>
          prev.map((line) =>
            line.kind === "assistant" && line.id === message.id
              ? { ...line, text: line.text + message.text }
              : line,
          ),
        );
      }
      if (message.type === "chat/done") setBusy(false);
      if (message.type === "chat/error") {
        setBusy(false);
        setLines((prev) => [...prev, { kind: "error", id: message.id, text: message.message }]);
      }
    });
    send({ type: "hello" });
    return off;
  }, []);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines]);

  function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setLines((prev) => [...prev, { kind: "user", text }]);
    send({ type: "chat/send", text });
  }

  return (
    <div className="shell">
      <header className="head">
        <strong>Laika</strong>
        <span className="mode">Guarded</span>
      </header>
      <div className="chat" ref={scroller}>
        {lines.length === 0 ? (
          <p className="hint">
            {ready
              ? "Chat is the product. File deltas stay out of this transcript — they land in the editor, and Orbit is the 50,000-ft morph."
              : "Connecting to the extension host…"}
          </p>
        ) : (
          lines.map((line, i) => (
            <article className={`msg ${line.kind}`} key={line.kind === "user" ? `u-${i}` : line.id}>
              <div className="who">{line.kind === "user" ? "You" : line.kind === "error" ? "Laika" : "Laika"}</div>
              <div className="body">{line.text || (busy ? "…" : "")}</div>
            </article>
          ))
        )}
      </div>
      <div className="dock">
        <div className="status">
          <span>{status}</span>
          <button
            className={orbit ? "orbit is-on" : "orbit"}
            type="button"
            onClick={() => send({ type: "orbit/toggle" })}
          >
            Orbit{orbit ? " on" : ""}
          </button>
        </div>
        <textarea
          rows={2}
          placeholder="Message Laika"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>
    </div>
  );
}
