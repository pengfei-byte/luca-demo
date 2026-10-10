import { useEffect, useRef, useState } from "react";

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path fill="currentColor" d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v1.6l3.6-2.4A1 1 0 0 1 21 6.5v11a1 1 0 0 1-1.4.8L16 15.9v1.6a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 17.5z" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="5" cy="12" r="1.7" fill="currentColor" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
      <circle cx="19" cy="12" r="1.7" fill="currentColor" />
    </svg>
  );
}

export default function Chat({ persona, bond, messages, quickReplies, typing, onSend, onCall, onResend, onProfile, onClear, onReset }) {
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState(null);
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
        <button type="button" className="chat-id" onClick={onProfile}>
          <img className="avatar" src={persona.photo} alt="" />
          <span className="chat-who">
            <strong>{persona.shortName}</strong>
            <span>{typing ? "typing…" : bond?.stageName ? `${bond.stageName} · online` : "online"}</span>
          </span>
        </button>
        {typeof bond?.closeness === "number" && (
          <button type="button" className="chat-bond" onClick={onProfile}>
            <span className="chat-bond-label">
              <em>Closeness</em>
              <strong>
                {bond.closeness}
                <span>/100</span>
              </strong>
            </span>
            <span
              className="chat-bond-track"
              role="progressbar"
              aria-valuenow={bond.closeness}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Closeness ${bond.closeness} of 100`}
            >
              <span style={{ width: `${Math.min(100, Math.max(0, bond.closeness))}%` }} />
            </span>
          </button>
        )}
        <div className="chat-menu">
          <button
            type="button"
            className="chat-more"
            aria-label="More"
            aria-expanded={menu !== null}
            onClick={() => setMenu((open) => (open ? null : "main"))}
          >
            <MoreIcon />
          </button>
          {menu && (
            <div className="chat-sheet" role="menu">
              {menu === "main" && (
                <>
                  <button type="button" role="menuitem" onClick={onProfile}>
                    His profile
                  </button>
                  <button type="button" role="menuitem" onClick={() => setMenu("clear")}>
                    Clear this chat
                  </button>
                  <button type="button" role="menuitem" onClick={() => setMenu("reset")}>
                    Start over
                  </button>
                </>
              )}
              {menu === "clear" && (
                <>
                  <p>Clear this chat? He keeps what he already knows.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(null);
                      onClear();
                    }}
                  >
                    Clear chat
                  </button>
                  <button type="button" onClick={() => setMenu("main")}>
                    Cancel
                  </button>
                </>
              )}
              {menu === "reset" && (
                <>
                  <p>Start over? This clears closeness, chapters, and secrets.</p>
                  <button
                    type="button"
                    className="is-danger"
                    onClick={() => {
                      setMenu(null);
                      onReset();
                    }}
                  >
                    Start over
                  </button>
                  <button type="button" onClick={() => setMenu("main")}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
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
