import React from "react";

export function highlightText(text, query) {
  if (!text) return "";
  if (!query || !query.trim()) return text;

  const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark
        key={index}
        className="bg-purple-500/40 text-purple-200 rounded px-0.5 font-medium"
        data-testid="highlight-mark"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}
