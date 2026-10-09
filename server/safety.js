const CRISIS_PATTERNS = [
  /\bkill(ing)?\s+my\s*self\b/i,
  /\bsuicid(e|al)\b/i,
  /\bend\s+(it\s+all|my\s+life)\b/i,
  /\bwant\s+to\s+die\b/i,
  /\bself[-\s]?harm/i,
  /\b(cut|cutting|hurt|hurting)\s+my\s*self\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  /\bbetter\s+off\s+dead\b/i,
];

export function detectCrisis(text) {
  const value = String(text ?? "");
  return CRISIS_PATTERNS.some((pattern) => pattern.test(value));
}

export const CRISIS_REPLY =
  "Stepping out of the story for a moment. It sounds like you might be going through something really hard, and you deserve real support right now. In the US you can call or text 988 (Suicide & Crisis Lifeline), or text HOME to 741741 (Crisis Text Line). Outside the US, findahelpline.com lists free services near you. I'm an AI character, not a substitute for a person who can help.";
