import { useState, useEffect, useRef } from "react";
import { AppLogoIcon, ChatIcon, LockIcon, StarIcon } from "./Icons";

const LANGUAGES = [
  {code:"en",label:"English"},{code:"hi",label:"हिन्दी"},{code:"ta",label:"தமிழ்"},
  {code:"te",label:"తెలుగు"},{code:"kn",label:"ಕನ್ನಡ"},{code:"fr",label:"Français"},
  {code:"de",label:"Deutsch"},{code:"es",label:"Español"},
];

export default function Sidebar({ sessions, currentSession, onNewChat, onLoadSession, onDeleteSession, model, models, onModelChange, language, onLanguageChange, onRenameSession }) {
  const [search, setSearch] = useState("");
  
  // Issue #226 states for inline editing
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const inputRef = useRef(null);

  // Auto-focus mechanic: triggers the exact millisecond the input mounts
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select(); // Highlight existing text for quick typing
    }
  }, [editingId]);

  const modelList = models.length > 0 ? models.map(m=>m.name) : ["llama3","mistral","phi3","gemma2"];
  const filtered  = sessions.filter(s => s.title?.toLowerCase().includes(search.toLowerCase()));

  const handleSaveRename = (id) => {
    if (editTitle.trim() && onRenameSession) {
      onRenameSession(id, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="w-64 flex flex-col bg-gray-900 border-r border-gray-800 shrink-0">
      {/* Logo */}
      <div className="px-4 pt-5 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-2 mb-4">
          <AppLogoIcon className="w-6 h-6 text-purple-400" />
          <div>
            <p className="font-bold text-white text-sm">LocalMind</p>
            <p className="text-xs text-gray-500">v2.0 · Offline AI</p>
          </div>
        </div>
        <button onClick={onNewChat}
          className="w-full text-sm bg-purple-700 hover:bg-purple-600 active:bg-purple-800 text-white py-2 rounded-xl font-medium transition">
          + New Chat
        </button>
      </div>

      {/* Model */}
      <div className="px-4 py-3 border-b border-gray-800">
        <label className="text-xs text-gray-500 block mb-1">AI Model</label>
        <select value={model} onChange={e=>onModelChange(e.target.value)}
          className="w-full text-xs bg-gray-800 text-gray-200 border border-gray-700 rounded-lg px-2 py-1.5 outline-none focus:border-purple-500">
          {modelList.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <label className="text-xs text-gray-500 block mb-1 mt-2">Language</label>
        <select value={language} onChange={e=>onLanguageChange(e.target.value)}
          className="w-full text-xs bg-gray-800 text-gray-200 border border-gray-700 rounded-lg px-2 py-1.5 outline-none focus:border-purple-500">
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-800">
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search chats..."
          className="w-full text-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-300 placeholder-gray-600 outline-none focus:border-purple-500" />
      </div>

      {/* Sessions */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {filtered.length === 0 && (
          <p className="text-xs text-gray-600 px-2 py-1">
            {sessions.length === 0 ? "No chats yet. Start one!" : "No results."}
          </p>
        )}
        {filtered.map(s => (
          <div key={s.id} className={`group flex items-center justify-between rounded-lg mb-0.5 transition pl-1 pr-1
            ${currentSession === s.id ? "bg-gray-700" : "hover:bg-gray-800"}`}>
            
            {/* Issue #96: min-w-0 forces flex bounding context */}
            <div 
              onDoubleClick={() => {
                setEditingId(s.id);
                setEditTitle(s.title || "New Chat");
              }}
              className="flex-1 text-left text-xs px-2 py-2 text-gray-400 group-hover:text-gray-200 min-w-0 cursor-pointer"
            >
              {editingId === s.id ? (
                // Issue #226: Focus-targeted input field
                <input
                  ref={inputRef}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => handleSaveRename(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveRename(s.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="w-full bg-gray-800 border border-purple-500 text-white rounded px-1 outline-none text-xs"
                />
              ) : (
                <span className={`inline-flex items-center gap-1.5 w-full ${currentSession === s.id ? "text-white" : ""}`}>
                  <ChatIcon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                  {/* Issue #96: Bounded truncation context wrapper */}
                  <span className="truncate flex-1" title="Double click to rename">{s.title || "New Chat"}</span>
                  {s.message_count > 0 && (
                    <span className="ml-1 text-gray-500 text-[10px] shrink-0">{s.message_count}</span>
                  )}
                </span>
              )}
            </div>

            <button onClick={()=>onDeleteSession(s.id)}
              className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 px-2 py-2 transition text-sm font-medium shrink-0">
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-800">
        <p className="text-xs text-gray-600 inline-flex items-center gap-1">
          <LockIcon className="w-3.5 h-3.5" />
          <span>100% local · no cloud · MIT</span>
        </p>
        <a href="https://github.com/yourusername/localmind" target="_blank" rel="noreferrer"
          className="text-xs text-purple-500 hover:text-purple-400 transition inline-flex items-center gap-1">
          <StarIcon className="w-3.5 h-3.5" />
          <span>Star on GitHub</span>
        </a>
      </div>
    </div>
  );
}