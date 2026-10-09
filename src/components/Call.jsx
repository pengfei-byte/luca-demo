import { useEffect, useRef, useState } from "react";
import { R2Client } from "../lib/r2.js";
import { endCall, heartbeatCall, startCall } from "../lib/api.js";
import { detectCrisis } from "../../server/safety.js";
import { formatDuration } from "../../server/format.js";

const MAX_CALL_MS = 300_000;
const BUSY_GIVE_UP_MS = 30_000;
const WARN_MS = 30_000;
const GOODBYE_MS = 20_000;
const GOODBYE_LINE = "The user has to go in a moment.";
const ACTIONS = [
  { label: "smile", line: "The user smiles at you." },
  { label: "look away", line: "The user looks away, flustered." },
  { label: "bite your lip", line: "The user bites her lip." },
];

function endReason(reason) {
  if (reason === "budget_exhausted") return "time_up";
  if (reason === "client_closed" || reason === "server_closed") return "hangup";
  return "dropped";
}

export default function Call({ persona, messages, onLine, onEnd }) {
  const videoRef = useRef(null);
  const clientRef = useRef(null);
  const sessionRef = useRef(null);
  const startedAtRef = useRef(0);
  const billedRef = useRef(0);
  const goodbyeRef = useRef(false);
  const endedRef = useRef(false);
  const onLineRef = useRef(onLine);
  const onEndRef = useRef(onEnd);
  onLineRef.current = onLine;
  onEndRef.current = onEnd;

  const [phase, setPhase] = useState("connecting");
  const [caption, setCaption] = useState("");
  const [idle, setIdle] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [needsTap, setNeedsTap] = useState(false);
  const [draft, setDraft] = useState("");

  function finish(reason) {
    if (endedRef.current) return;
    endedRef.current = true;
    const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    clientRef.current?.close();
    endCall(sessionRef.current);
    onEndRef.current({ reason, durationMs });
  }

  function handleEvent(msg) {
    const d = msg.data || {};
    if (msg.type === "media.clip") {
      if (!startedAtRef.current) {
        startedAtRef.current = Date.now();
        setPhase("live");
      }
      setIdle(d.kind === "idle");
    }
    if (msg.type === "turn.text" && d.text) {
      setCaption(d.text);
      onLineRef.current("him", d.text);
    }
    if (msg.type === "usage.tick" && typeof d.billed_ms === "number") {
      billedRef.current = d.billed_ms;
    }
  }

  useEffect(() => {
    let cancelled = false;
    const firstTry = Date.now();

    function open({ credentials, session }) {
      sessionRef.current = session.session_id;
      const client = new R2Client({
        credentials,
        remoteVideo: videoRef.current,
        onRemoteStream: () => {
          videoRef.current?.play().catch(() => setNeedsTap(true));
        },
        onEvent: handleEvent,
        onError: (err) => {
          if (err?.code === "content_rejected") setCaption("Careful.");
        },
        onEnded: (data) => finish(endReason(data?.reason)),
      });
      clientRef.current = client;
      client.start();
    }

    async function connect() {
      while (!cancelled) {
        const res = await startCall(messages);
        if (cancelled) {
          if (res.ok) endCall(res.data.session.session_id);
          return;
        }
        if (res.ok) {
          open(res.data);
          return;
        }
        const error = res.data?.error || {};
        if (error.code === "busy" && Date.now() - firstTry < BUSY_GIVE_UP_MS) {
          setPhase("busy");
          await new Promise((resolve) => setTimeout(resolve, error.retry_after_ms || 5000));
          continue;
        }
        finish(error.code === "busy" ? "busy" : "dropped");
        return;
      }
    }

    connect();
    const beat = setInterval(() => heartbeatCall(sessionRef.current), 10_000);

    return () => {
      cancelled = true;
      clearInterval(beat);
      if (!endedRef.current) {
        endedRef.current = true;
        clientRef.current?.close();
        endCall(sessionRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "live") return undefined;
    const tick = setInterval(() => {
      const ms = Math.max(Date.now() - startedAtRef.current, billedRef.current);
      setElapsed(ms);
      if (ms >= MAX_CALL_MS) {
        finish("time_up");
        return;
      }
      if (MAX_CALL_MS - ms <= GOODBYE_MS && !goodbyeRef.current) {
        goodbyeRef.current = true;
        clientRef.current?.say(GOODBYE_LINE);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [phase]);

  function send(text) {
    const value = text.trim();
    if (!value || phase !== "live") return;
    if (detectCrisis(value)) {
      finish("crisis");
      return;
    }
    clientRef.current?.say(value);
    onLineRef.current("user", value);
    setDraft("");
  }

  function act(action) {
    if (phase !== "live") return;
    clientRef.current?.say(action.line);
    onLineRef.current("user", `*${action.label}*`);
  }

  const remaining = MAX_CALL_MS - elapsed;
  const live = phase === "live";
  let clock = "";
  if (live) clock = remaining <= WARN_MS ? `${Math.max(0, Math.ceil(remaining / 1000))}s left` : formatDuration(elapsed);

  return (
    <div className="call">
      <video ref={videoRef} className="call-video" playsInline autoPlay />
      {!live && (
        <div className="call-cover">
          <img src={persona.photo} alt="" />
          <p>{phase === "busy" ? `${persona.shortName} is on another line…` : "Connecting…"}</p>
        </div>
      )}
      <div className={`call-vignette${idle && live ? " is-idle" : ""}`} />

      <header className="call-top">
        <span className="call-name">{persona.shortName}</span>
        <span className={`call-clock${live && remaining <= WARN_MS ? " is-warn" : ""}`}>{clock}</span>
        <span className="ai-badge">AI</span>
      </header>

      {needsTap && (
        <button
          type="button"
          className="call-unmute"
          onClick={() => {
            videoRef.current?.play().then(() => setNeedsTap(false)).catch(() => {});
          }}
        >
          Tap to hear him
        </button>
      )}

      {caption && <p className="call-caption">{caption}</p>}

      <footer className="call-bottom">
        <div className="call-actions">
          {ACTIONS.map((a) => (
            <button key={a.label} type="button" onClick={() => act(a)} disabled={!live}>
              *{a.label}*
            </button>
          ))}
        </div>
        <div className="call-row">
          <form
            className="call-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={live ? "Say something…" : "Waiting for him…"}
              maxLength={500}
              disabled={!live}
            />
            <button type="submit" disabled={!live || !draft.trim()}>
              Send
            </button>
          </form>
          <button type="button" className="call-hangup" onClick={() => finish("hangup")} aria-label="End call">
            End
          </button>
        </div>
      </footer>
    </div>
  );
}
