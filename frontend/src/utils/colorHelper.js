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

export function getSessionColor(sid) {
  if (!sid) return "text-gray-500";
  if (!colorCache[sid]) {
    // Generate a consistent pseudorandom assignment string index selection based on string characters
    const hash = Array.from(sid).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    colorCache[sid] = TAILWIND_COLORS[hash % TAILWIND_COLORS.length];
  }
  return colorCache[sid];
}

export function setSessionColor(sid, color) {
  if (sid) colorCache[sid] = color;
}