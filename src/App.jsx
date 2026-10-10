import { useEffect, useRef, useState } from "react";
import Gate from "./components/Gate.jsx";
import Chat from "./components/Chat.jsx";
import IncomingCall from "./components/IncomingCall.jsx";
import Call from "./components/Call.jsx";
import { fetchPersona, sendChat } from "./lib/api.js";
import { freshConversation, initialState, loadState, makeMessage, saveState } from "./lib/store.js";
import { CRISIS_REPLY, detectCrisis } from "../server/safety.js";
import { formatDuration } from "../server/format.js";

const RING_DELAY_MS = 1200;

export default function App() {
  const [persona, setPersona] = useState(null);
  const [state, setState] = useState(null);
  const [view, setView] = useState("chat");
  const [typing, setTyping] = useState(false);
  const stateRef = useRef(null);
  const chatGen = useRef(0);

  useEffect(() => {
    fetchPersona()
      .then((p) => {
        const s = loadState() || initialState(p);
        stateRef.current = s;
        setPersona(p);
        setState(s);
      })
      .catch(() => setPersona(false));
  }, []);

  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

  function commit(next) {
    stateRef.current = next;
    setState(next);
  }

  function append(...msgs) {
    const s = stateRef.current;
    commit({ ...s, messages: [...s.messages, ...msgs] });
  }

  async function askHim(extra = {}) {
    const gen = ++chatGen.current;
    setTyping(true);
    const before = stateRef.current;
    const res = await sendChat({ messages: before.messages, calledOnce: before.calledOnce, ...extra });
    if (gen !== chatGen.current) return;
    setTyping(false);

    let fields = {};
    if (res.notice) fields = { kind: "notice" };
    else if (res.retryable) fields = { kind: "notice", retryable: true, retryWith: extra };

    const s = stateRef.current;
    const quickReplies = res.quickReplies?.length ? res.quickReplies : s.quickReplies;
    const willCall = Boolean(res.call) && !s.calledOnce;
    commit({
      ...s,
      calledOnce: s.calledOnce || willCall,
      quickReplies,
      messages: [...s.messages, makeMessage("him", res.reply, fields)],
    });
    if (willCall) {
      setTimeout(() => setView((v) => (v === "chat" ? "incoming" : v)), RING_DELAY_MS);
    }
  }

  function sendText(text) {
    const value = text.trim();
    if (!value) return;
    if (detectCrisis(value)) {
      const s = stateRef.current;
      commit({
        ...s,
        quickReplies: [],
        messages: [
          ...s.messages,
          makeMessage("user", value, { kind: "notice" }),
          makeMessage("him", CRISIS_REPLY, { kind: "notice" }),
        ],
      });
      return;
    }
    append(makeMessage("user", value));
    askHim();
  }

  function resend(id) {
    const s = stateRef.current;
    const failed = s.messages.find((m) => m.id === id);
    commit({ ...s, messages: s.messages.filter((m) => m.id !== id) });
    askHim(failed?.retryWith || {});
  }

  function passGate() {
    commit({ ...stateRef.current, gatePassed: true });
  }

  function resetChat() {
    chatGen.current += 1;
    setTyping(false);
    setView("chat");
    commit(freshConversation(persona));
  }

  function callNow() {
    commit({ ...stateRef.current, calledOnce: true });
    setView("call");
  }

  function decline() {
    setView("chat");
    askHim({ event: "call_declined" });
  }

  function onLine(role, text) {
    append(makeMessage(role, text));
  }

  function onEnd({ reason, durationMs }) {
    setView("chat");
    if (reason === "busy") {
      append(makeMessage("him", "I'll call you back."));
      return;
    }
    if (reason === "crisis") {
      const s = stateRef.current;
      commit({
        ...s,
        quickReplies: [],
        messages: [...s.messages, makeMessage("him", CRISIS_REPLY, { kind: "notice" })],
      });
      return;
    }
    append(makeMessage("him", `Video call · ${formatDuration(durationMs)}`, { kind: "call", durationMs }));
    askHim({ event: reason === "dropped" ? "call_dropped" : "call_ended", durationMs });
  }

  if (persona === false) {
    return <div className="screen-center">Couldn't reach Luca. Refresh to try again.</div>;
  }
  if (!persona || !state) return <div className="screen-center" />;
  if (!state.gatePassed) return <Gate persona={persona} onEnter={passGate} />;

  return (
    <>
      <Chat
        persona={persona}
        messages={state.messages}
        quickReplies={state.quickReplies}
        typing={typing}
        onSend={sendText}
        onCall={callNow}
        onResend={resend}
        onReset={resetChat}
      />
      {view === "incoming" && <IncomingCall persona={persona} onAnswer={() => setView("call")} onDecline={decline} />}
      {view === "call" && <Call persona={persona} messages={state.messages} onLine={onLine} onEnd={onEnd} />}
    </>
  );
}
