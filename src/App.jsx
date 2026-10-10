import { useEffect, useRef, useState } from "react";
import Gate from "./components/Gate.jsx";
import Chat from "./components/Chat.jsx";
import Profile from "./components/Profile.jsx";
import IncomingCall from "./components/IncomingCall.jsx";
import Call from "./components/Call.jsx";
import { authorizeLine, declineInvite, defineRelationship, fetchPersona, fetchProfile, fetchRelationship, forgetMemory, openChapter, patchPreferences, resetRelationship, sendChat } from "./lib/api.js";
import { freshConversation, initialState, loadState, makeMessage, saveState } from "./lib/store.js";
import { CRISIS_REPLY, detectCrisis } from "../server/safety.js";
import { formatDuration } from "../server/format.js";

const RING_DELAY_MS = 1200;

export default function App() {
  const [persona, setPersona] = useState(null);
  const [state, setState] = useState(null);
  const [bond, setBond] = useState(null);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState("chat");
  const [typing, setTyping] = useState(false);
  const stateRef = useRef(null);
  const chatGen = useRef(0);

  useEffect(() => {
    fetchPersona()
      .then(async (p) => {
        const saved = loadState();
        let s = saved || initialState(p);
        if (saved && !saved.migrationSeen) {
          s = {
            ...saved,
            migrationSeen: true,
            messages: [
              ...saved.messages,
              makeMessage("him", "Your old messages stay on this phone. What we learn from here starts at the beginning.", { kind: "notice" }),
            ],
          };
        }
        stateRef.current = s;
        setPersona(p);
        setState(s);
        try {
          setBond(await fetchRelationship());
        } catch {
          /* chat still works if the relationship service is down */
        }
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
    const quickReplies = res.replaceReplies ? res.quickReplies || [] : res.quickReplies?.length ? res.quickReplies : s.quickReplies;
    if (res.progress) setBond(res.progress);
    const willCall = Boolean(res.call);
    const him = makeMessage("him", res.reply, fields);
    const incoming = res.progress?.stageChanged ? [him, makeMessage("him", "A new side of Luca is open to you.", { kind: "notice" })] : [him];
    commit({
      ...s,
      calledOnce: s.calledOnce || willCall,
      quickReplies,
      messages: [...s.messages, ...incoming],
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

  function clearChat() {
    chatGen.current += 1;
    setTyping(false);
    setView("chat");
    commit(freshConversation(persona));
  }

  async function resetChat() {
    chatGen.current += 1;
    setTyping(false);
    setProfile(null);
    setView("chat");
    try {
      const next = await resetRelationship();
      setBond(next.bond);
    } catch {
      /* local thread still clears */
    }
    commit(freshConversation(persona));
  }

  async function showProfile() {
    setView("profile");
    try {
      setProfile(await fetchProfile());
    } catch {
      setProfile(false);
    }
  }

  async function continueChapter(chapterId) {
    const opened = await openChapter(chapterId);
    const s = stateRef.current;
    const already = s.messages.at(-1)?.text === opened.hook;
    commit({
      ...s,
      quickReplies: opened.choices.map((choice) => choice.label),
      messages: already ? s.messages : [...s.messages, makeMessage("him", opened.hook)],
    });
    setView("chat");
  }

  async function changePreference(patch) {
    const next = await patchPreferences(patch);
    setBond(next);
    setProfile((current) => (current ? { ...current, bond: next } : current));
  }

  async function chooseDefinition(definition) {
    const next = await defineRelationship(definition);
    setBond(next.bond);
    setProfile(await fetchProfile());
  }

  async function dropMemory(memoryId) {
    setProfile(await forgetMemory(memoryId));
    setBond((await fetchProfile()).bond);
  }

  function callNow() {
    commit({ ...stateRef.current, calledOnce: true });
    setView("call");
  }

  function decline() {
    setView("chat");
    declineInvite();
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
  if (view === "profile") {
    if (profile === false) return <div className="screen-center">Couldn't open his profile. Go back and try again.</div>;
    return (
      <Profile
        data={profile || null}
        onBack={() => setView("chat")}
        onContinue={continueChapter}
        onForget={dropMemory}
        onPreference={changePreference}
        onDefine={chooseDefinition}
      />
    );
  }

  return (
    <>
      <Chat
        persona={persona}
        bond={bond}
        messages={state.messages}
        quickReplies={state.quickReplies}
        typing={typing}
        onSend={sendText}
        onCall={callNow}
        onResend={resend}
        onProfile={showProfile}
        onClear={clearChat}
        onReset={resetChat}
      />
      {view === "incoming" && <IncomingCall persona={persona} onAnswer={() => setView("call")} onDecline={decline} />}
      {view === "call" && (
        <Call
          persona={persona}
          messages={state.messages}
          actions={bond?.actions}
          authorize={authorizeLine}
          onLine={onLine}
          onEnd={onEnd}
        />
      )}
    </>
  );
}
