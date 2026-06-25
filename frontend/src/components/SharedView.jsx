import { useState, useEffect } from "react";
import { getSharedSnapshot } from "../utils/api";
import { AppLogoIcon, FileIcon, LockIcon } from "../components/Icons";

export default function SharedView() {
  const shareId = window.location.pathname.split("/shared/")[1];
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadSnapshot() {
      try {
        setLoading(true);
        const res = await getSharedSnapshot(shareId);
        if (res.success && res.snapshot) {
          setSnapshot(res.snapshot);
        } else {
          setError("Conversation snapshot not found.");
        }
      } catch (err) {
        console.error("Error loading shared snapshot:", err);
        setError(err.message || "Failed to load the shared conversation.");
      } finally {
        setLoading(false);
      }
    }
    loadSnapshot();
  }, [shareId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-gray-400">
        <AppLogoIcon className="w-12 h-12 text-purple-500 animate-pulse mb-4" />
        <p className="text-sm">Retrieving shared conversation snapshot...</p>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-gray-400 px-4 text-center">
        <div className="border border-red-900/30 bg-red-950/10 p-6 rounded-2xl max-w-md">
          <p className="text-red-400 font-semibold mb-2">Unable to View Chat</p>
          <p className="text-sm text-gray-500 mb-4">{error || "This link might be broken or expired."}</p>
          <a href="/" className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl transition">
            Go to LocalMind Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen h-screen bg-gray-950 overflow-hidden text-gray-100 max-w-4xl mx-auto border-x border-gray-900">
      {/* Read-Only Top Header */}
      <header className="flex justify-between items-center px-6 py-4 border-b border-gray-900 bg-gray-950/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <AppLogoIcon className="w-8 h-8 text-purple-400" />
          <div>
            <h1 className="text-sm font-semibold max-w-md truncate">{snapshot.title}</h1>
            <p className="text-xs text-gray-500">
              Shared read-only snapshot · Model: <span className="text-purple-400/80 font-mono">{snapshot.model}</span>
            </p>
          </div>
        </div>
        <a href="/" className="text-xs font-medium border border-purple-500/30 text-purple-400 hover:bg-purple-900/20 px-3 py-1.5 rounded-xl transition">
          Launch LocalMind
        </a>
      </header>

      {/* Message History Timeline View */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {snapshot.messages.map((msg, i) => (
          <div key={msg.id || i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-2xl ${msg.role === "user" ? "max-w-xl" : "max-w-2xl"}`}>
              {msg.role === "assistant" && (
                <div className="flex items-center gap-1.5 mb-1.5 ml-1">
                  <AppLogoIcon className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-purple-400">LocalMind</span>
                </div>
              )}
              <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words
                ${msg.role === "user"
                  ? "bg-purple-700 text-white rounded-br-sm"
                  : "bg-gray-800 text-gray-100 rounded-bl-sm border border-gray-700"}`}>
                {msg.content}
              </div>
              {msg.sources?.length > 0 && (
                <div className="mt-1.5 ml-1 flex flex-wrap gap-1">
                  {msg.sources.map((s, idx) => (
                    <span key={idx} className="text-xs bg-gray-800 text-blue-400 px-2 py-0.5 rounded-full border border-gray-700">
                      <span className="inline-flex items-center gap-1">
                        <FileIcon className="w-3 h-3" />
                        <span>{s}</span>
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Read-Only Footer Banner */}
      <footer className="px-6 py-3 border-t border-gray-900 bg-gray-900/20 text-center text-xs text-gray-600 shrink-0">
        <span className="inline-flex items-center gap-1">
          <LockIcon className="w-3.5 h-3.5" />
          <span>This conversation was recorded locally via LocalMind and exported as an immutable snapshot.</span>
        </span>
      </footer>
    </div>
  );
}