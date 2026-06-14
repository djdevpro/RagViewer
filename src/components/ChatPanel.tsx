import { useEffect, useRef, useState, type FormEvent } from "react";
import { useStore } from "@tanstack/react-store";
import { Streamdown } from "streamdown";
import {
  ragStore,
  activeConversation,
  newConversation,
  setActiveConversation,
  deleteConversation,
  pushChat,
  updateChat,
  setRag,
  setActiveChunk,
} from "../store/rag-store";
import { patchActive } from "../store/doclang-store";
import { retrieve } from "../lib/rag";
import { chatStream, buildContext, SYSTEM_PROMPT, type ChatTurn } from "../lib/chat";
import { Icon } from "./icons";

function timeLabel(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// Full-screen RAG chat: conversation history on the left, the active thread on the
// right. Each conversation is bound to a chunking version, so retrieval always
// queries that version's RAG index. The version strip toggles a filter over the
// conversation list (a version selected → only its conversations; none → all).
export function ChatPanel() {
  const conversations = useStore(ragStore, (s) => s.conversations);
  const activeId = useStore(ragStore, (s) => s.activeConversationId);
  const filterVersionId = useStore(ragStore, (s) => s.activeVersionId);
  const versions = useStore(ragStore, (s) => s.versions);
  const conv = useStore(ragStore, activeConversation);
  const busy = useStore(ragStore, (s) => s.chatBusy);
  const settings = useStore(ragStore, (s) => s.settings);
  const messages = conv?.messages ?? [];
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const versionLabel = (id: string | null): string =>
    versions.find((v) => v.id === id)?.label ?? "no version";
  // Toggle filter: a version selected in the strip → only its conversations.
  const visible = filterVersionId ? conversations.filter((c) => c.versionId === filterVersionId) : conversations;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    pushChat({ id: crypto.randomUUID(), role: "user", text: q });
    // Read the version AFTER pushChat created/bound the conversation (the `conv`
    // closure above is stale on the first message of a fresh chat).
    const versionId = activeConversation(ragStore.state)?.versionId ?? null;
    const aid = crypto.randomUUID();
    pushChat({ id: aid, role: "assistant", text: "", pending: true });
    setRag({ chatBusy: true });
    try {
      // Embed the question and pull the nearest chunks from THIS conversation's index.
      const hits = await retrieve(q, settings.topK, versionId);
      const history: ChatTurn[] = messages
        .filter((m) => !m.pending)
        .map((m) => ({ role: m.role, content: m.text }));
      const context = buildContext(hits);
      // The retrieved chunks are delivered as a dedicated system message so the
      // model clearly sees them as grounding ("Here are the detected chunks: …").
      const turns: ChatTurn[] = [
        { role: "system", content: settings.chatSystemPrompt || SYSTEM_PROMPT },
        ...history,
        {
          role: "system",
          content: hits.length
            ? `Here are the retrieved document chunks most relevant to the question (most relevant first). Ground your answer in them and cite them by [n]:\n\n${context}`
            : "No relevant document chunk was retrieved for this question.",
        },
        { role: "user", content: q },
      ];
      const answer = await chatStream(
        {
          provider: settings.chatProvider,
          openai: { apiKey: settings.openaiKey, model: settings.openaiModel },
          ollama: { url: settings.ollamaUrl, model: settings.ollamaModel },
        },
        turns,
        (full) => updateChat(aid, { text: full, pending: false }),
      );
      updateChat(aid, {
        pending: false,
        text: answer || "(empty answer)",
        sources: hits.map((h) => ({ rawText: h.rawText, headingPath: h.headingPath, page: h.page, elementIds: h.elementIds })),
      });
    } catch (err) {
      updateChat(aid, { pending: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setRag({ chatBusy: false });
    }
  };

  return (
    <div className="chatwrap">
      <aside className="convo-list">
        <button className="convo-new" onClick={() => newConversation()}>
          <Icon name="plus" size={14} /> New chat
        </button>
        {filterVersionId && (
          <p className="convo-filter">Filtered to {versionLabel(filterVersionId)} · click its tile again for all</p>
        )}
        <div className="convo-items">
          {visible.length === 0 && (
            <p className="convo-empty">{filterVersionId ? "No conversation for this version yet." : "No conversation yet."}</p>
          )}
          {visible.map((c) => (
            <div
              key={c.id}
              className={"convo-item" + (c.id === activeId ? " convo-item--on" : "")}
              role="button"
              tabIndex={0}
              onClick={() => setActiveConversation(c.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setActiveConversation(c.id);
              }}
            >
              <span className="convo-item__time">{timeLabel(c.createdAt)}</span>
              <span className="convo-item__title">{c.title}</span>
              <span className="convo-item__ver">{versionLabel(c.versionId)}</span>
              <button
                type="button"
                className="convo-del"
                aria-label="Delete conversation"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(c.id);
                }}
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <div className="chatpane">
        <div className="chatpane__head">
          <Icon name="ai" size={15} />
          <span>Chat · {settings.chatProvider === "openai" ? "OpenAI" : "Ollama"}</span>
          {conv && <span className="chatpane__ver">RAG: {versionLabel(conv.versionId)}</span>}
        </div>

        <div className="search-chat" ref={scrollRef}>
          {messages.length === 0 && (
            <p className="search-empty">Ask a question about your document. Answers are grounded in the closest passages.</p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={"bubble " + (m.role === "user" ? "bubble--user" : "bubble--bot") + (m.pending && !m.text ? " bubble--pending" : "")}
            >
              {m.role === "user" ? (
                m.text
              ) : m.pending && !m.text ? (
                <Icon name="spinner" size={15} className="spin" />
              ) : (
                <div className="md">
                  <Streamdown>{m.text}</Streamdown>
                </div>
              )}
              {m.sources && m.sources.length > 0 && (
                <details className="chat-src">
                  <summary>{m.sources.length} source(s)</summary>
                  {m.sources.map((h, i) => (
                    <button
                      key={i}
                      type="button"
                      className="hit"
                      onClick={() => {
                        setActiveChunk(null);
                        patchActive({ currentPage: h.page ?? 0, activeZoneId: h.elementIds[0] ?? null });
                      }}
                    >
                      <div className="hit__path">
                        <span className="hit__crumb">{h.headingPath.length ? h.headingPath.join(" › ") : "Document"}</span>
                        {h.page != null && <span className="hit__score">p.{h.page + 1}</span>}
                      </div>
                      <div className="hit__snippet">{h.rawText}</div>
                    </button>
                  ))}
                </details>
              )}
            </div>
          ))}
        </div>

        <form className="search-input" onSubmit={(e) => void submit(e)}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the document…"
            spellCheck={false}
            aria-label="Question"
          />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Send">
            <Icon name={busy ? "spinner" : "send"} size={16} className={busy ? "spin" : undefined} />
          </button>
        </form>
      </div>
    </div>
  );
}
