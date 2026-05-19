export default function Sidebar({ sessions, currentSession, onNewChat, onLoadSession, model, models, onModelChange }) {
  const SUGGESTED_MODELS = ["llama3", "mistral", "phi3", "gemma2"];
  const modelOptions = models.length > 0
    ? models.map((m) => m.name)
    : SUGGESTED_MODELS;

  return (
    <div className="w-64 flex flex-col bg-gray-900 border-r border-gray-800">
      {/* Logo */}
      <div className="px-4 pt-5 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">🧠</span>
          <div>
            <p className="font-bold text-white text-sm">LocalMind</p>
            <p className="text-xs text-gray-500">Offline AI Assistant</p>
          </div>
        </div>
        <button
          onClick={onNewChat}
          className="w-full text-sm bg-purple-700 hover:bg-purple-600 text-white py-2 rounded-xl font-medium transition"
        >
          + New Chat
        </button>
      </div>

      {/* Model selector */}
      <div className="px-4 py-3 border-b border-gray-800">
        <label className="text-xs text-gray-500 block mb-1.5">AI Model</label>
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          className="w-full text-xs bg-gray-800 text-gray-200 border border-gray-700 rounded-lg px-2 py-1.5 outline-none focus:border-purple-500"
        >
          {modelOptions.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* Sessions */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <p className="text-xs text-gray-600 px-2 mb-2 uppercase tracking-wide">Recent chats</p>
        {sessions.length === 0 && (
          <p className="text-xs text-gray-600 px-2">No chats yet</p>
        )}
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onLoadSession(s.id)}
            className={`w-full text-left text-xs px-3 py-2 rounded-lg mb-1 transition truncate ${
              currentSession === s.id
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            }`}
          >
            💬 {s.title || s.id.slice(0, 16) + "..."}
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-800">
        <p className="text-xs text-gray-600">🔒 100% private. No cloud.</p>
        <a
          href="https://github.com/yourusername/localmind"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-purple-500 hover:text-purple-400 transition"
        >
          ⭐ Star on GitHub
        </a>
      </div>
    </div>
  );
}
