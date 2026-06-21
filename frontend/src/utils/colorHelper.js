// Local cache memory dictionary map for session color groupings
const colorCache = {};

const TAILWIND_COLORS = [
  "text-red-400",
  "text-blue-400",
  "text-green-400",
  "text-yellow-400",
  "text-purple-400",
  "text-pink-400",
  "text-indigo-400"
];

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

export function getSessionColor(sid) {
  if (!sid) return "text-gray-500";
  
  // Checks if Darshan's explicit local storage overrides exist first
  try {
    const overrides = JSON.parse(localStorage.getItem("localmind_session_colors")) || {};
    if (overrides[sid]) return overrides[sid];
  } catch (e) {
    console.error("Failed to parse session colors", e);
  }

  // Fallback to our dynamic fallback hashing system if no override is set
  if (!colorCache[sid]) {
    const hash = Array.from(sid).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    colorCache[sid] = TAILWIND_COLORS[hash % TAILWIND_COLORS.length];
  }
  return colorCache[sid];
}

export function setSessionColor(sid, color) {
  if (!sid) return;
  colorCache[sid] = color;
  try {
    const overrides = JSON.parse(localStorage.getItem("localmind_session_colors")) || {};
    overrides[sid] = color;
    localStorage.setItem("localmind_session_colors", JSON.stringify(overrides));
  } catch (e) {
    console.error("Failed to save session color", e);
  }
}
