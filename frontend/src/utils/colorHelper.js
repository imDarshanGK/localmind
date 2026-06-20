export const PALETTE = [
  { name: "Blue", hex: "#3b82f6" },
  { name: "Green", hex: "#22c55e" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Red", hex: "#ef4444" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Gray", hex: "#6b7280" }
];

export function hashSessionIdToColor(sessionId) {
  if (!sessionId) return PALETTE[0].hex;
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = sessionId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index].hex;
}

export function getSessionColor(sessionId) {
  try {
    const overrides = JSON.parse(localStorage.getItem("localmind_session_colors") || "{}");
    if (overrides[sessionId]) {
      return overrides[sessionId];
    }
  } catch (e) {
    // Fallback if localStorage fails or is disabled
  }
  return hashSessionIdToColor(sessionId);
}

export function setSessionColor(sessionId, color) {
  try {
    const overrides = JSON.parse(localStorage.getItem("localmind_session_colors") || "{}");
    overrides[sessionId] = color;
    localStorage.setItem("localmind_session_colors", JSON.stringify(overrides));
  } catch (e) {
    // Fail silently if localStorage is disabled
  }
}
