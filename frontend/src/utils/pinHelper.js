export function getPinnedSessions() {
  try {
    const pinned = JSON.parse(localStorage.getItem("localmind_pinned_sessions") || "[]");
    return Array.isArray(pinned) ? pinned : [];
  } catch (e) {
    return [];
  }
}

export function toggleSessionPin(sessionId) {
  try {
    let pinned = getPinnedSessions();
    if (pinned.includes(sessionId)) {
      pinned = pinned.filter(id => id !== sessionId);
    } else {
      pinned.push(sessionId);
    }
    localStorage.setItem("localmind_pinned_sessions", JSON.stringify(pinned));
    return pinned;
  } catch (e) {
    return [];
  }
}
