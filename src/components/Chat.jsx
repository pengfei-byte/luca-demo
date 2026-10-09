import { useEffect, useRef, useState } from "react";

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path fill="currentColor" d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v1.6l3.6-2.4A1 1 0 0 1 21 6.5v11a1 1 0 0 1-1.4.8L16 15.9v1.6a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 17.5z" />
    </svg>
  );
}

export default function Chat({ persona, messages, quickReplies, typing, onSend, onCall, onResend }) {
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typing]);

  function submit(text) {
    if (!text.trim() || typing) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="chat">
      <header className="chat-top">
        <img className="avatar" src={persona.photo} alt="" />
        <div className="chat-who">
          <strong>{persona.shortName}</strong>
          <span>{typing ? "typing…" : "online"}</span>
        </div>
        <button type="button" className="chat-call" onClick={onCall} aria-label={`Video call ${persona.shortName}`}>
          <CameraIcon />
        </button>
      </header>

      <main className="chat-log">
        {messages.map((m) =>
          m.kind === "call" ? (
            <div key={m.id} className="call-record">
              {m.text}
            </div>
          ) : (
            <div
              key={m.id}
              className={`bubble ${m.role === "user" ? "me" : "him"}${m.kind === "notice" ? " notice" : ""}`}
            >
              {m.text}
              {m.retryable && (
                <button type="button" className="resend" onClick={() => onResend(m.id)}>
                  Resend
                </button>
              )}
            </div>
          ),
        )}
        {typing && (
          <div className="bubble him typing" aria-label={`${persona.shortName} is typing`}>
            <span />
            <span />
            <span />
          </div>
        )}
        <div ref={endRef} />
      </main>

      <footer className="chat-bottom">
        {!typing && quickReplies?.length > 0 && (
          <div className="quick">
            {quickReplies.map((q) => (
              <button key={q} type="button" onClick={() => submit(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message" maxLength={500} />
          <button type="submit" disabled={!draft.trim() || typing}>
            Send
          </button>
        </form>
        <p className="legal">
          {persona.shortName} is an AI character · 18+ ·{" "}
          <a href="/safety.html" target="_blank" rel="noreferrer">
            Safety
          </a>
        </p>
      </footer>
    </div>
  );
}
