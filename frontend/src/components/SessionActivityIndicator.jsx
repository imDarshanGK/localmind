import { useEffect, useState } from "react";

/**
 * Format a timestamp (ISO string or Date) as a human-readable relative time.
 * Examples: "Just now", "5m ago", "2h ago", "Yesterday", "3d ago", "Jan 15"
 */
export function formatRelativeTime(input) {
  if (!input) return "";
  const date = typeof input === "string" ? new Date(input) : input;
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 30) return "Just now";
  if (diffMin < 1) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  // Older than a week: show short date
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Returns true if a session is considered "active" (last activity < 5 min ago).
 */
export function isSessionActive(input) {
  if (!input) return false;
  const date = typeof input === "string" ? new Date(input) : input;
  const diffMs = new Date() - date;
  return diffMs < 5 * 60 * 1000; // 5 minutes
}

/**
 * SessionActivityIndicator — shows the relative last-activity time
 * for a session, plus a pulsing dot if the session is currently active.
 */
export default function SessionActivityIndicator({ lastActivity, className = "" }) {
  const [, setTick] = useState(0);

  // Re-render every 30s to keep "5m ago" → "6m ago" fresh
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!lastActivity) {
    return (
      <span className={`text-[10px] text-gray-600 ${className}`} aria-label="No activity">
        No activity
      </span>
    );
  }

  const active = isSessionActive(lastActivity);
  const label = formatRelativeTime(lastActivity);

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] ${
        active ? "text-emerald-400" : "text-gray-500"
      } ${className}`}
      title={new Date(lastActivity).toLocaleString()}
      aria-label={`Last activity: ${label}${active ? " (active)" : ""}`}
    >
      {active && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
          aria-hidden="true"
        />
      )}
      {label}
    </span>
  );
}
