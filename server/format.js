export function formatDuration(ms) {
  const total = Math.max(0, Math.round(Number(ms) / 1000) || 0);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
