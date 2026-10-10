const STORAGE_KEY = "luca.v1";

export function makeMessage(role, text, extra = {}) {
  return { id: crypto.randomUUID(), role, text, kind: "text", ts: Date.now(), ...extra };
}

export function initialState(persona) {
  return {
    gatePassed: false,
    calledOnce: false,
    quickReplies: persona.quickReplies,
    messages: [makeMessage("him", persona.opener)],
  };
}

export function freshConversation(persona) {
  return { ...initialState(persona), gatePassed: true, migrationSeen: true };
}

export function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.messages)) return saved;
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or disabled */
  }
}
