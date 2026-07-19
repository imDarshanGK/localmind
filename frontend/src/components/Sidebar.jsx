import { useState, useEffect } from "react";
import { AppLogoIcon, ChatIcon, LockIcon, StarIcon } from "./Icons";

const LANGUAGES = [
  {code:"en",label:"English"},{code:"hi",label:"हिन्दी"},{code:"ta",label:"தமிழ்"},
  {code:"te",label:"తెలుగు"},{code:"kn",label:"ಕನ್ನಡ"},{code:"fr",label:"Français"},
  {code:"de",label:"Deutsch"},{code:"es",label:"Español"},
];

export default function Sidebar({ sessions, currentSession, onNewChat, onLoadSession, onDeleteSession, model, models, onModelChange, language, onLanguageChange }) {
  const [search, setSearch] = useState("");
  
  // Initialize view state from localStorage, default to true (expanded) if not present
  const [isExpanded, setIsExpanded] = useState(() => {
    const savedState = localStorage.getItem("sidebar_expanded_state");
    return savedState !== null ? JSON.parse(savedState) : true;
  });

  // Keep localStorage perfectly synced whenever the view state changes
  useEffect(() => {
    localStorage.setItem("sidebar_expanded_state", JSON.stringify(isExpanded));
  }, [isExpanded]);

  const modelList = models.length > 0 ? models.map(m=>m.name) : ["llama3","mistral","phi3","gemma2"];
  const filtered  = sessions.filter(s => s.title?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className={`flex flex-col bg-gray-900 border-r border-gray-800 shrink-0 transition-all duration-300 ${isExpanded ? "w-64" : "w-16"}`}>
      {/* Logo & Toggle Control */}
      <div className="px-4 pt-5 pb-4 border-b border-gray-800">
        <div className="flex items-center justify-between gap-2 mb-4">
          {isExpanded ? (
            <div className="flex items-center gap-2 truncate">
              <AppLogoIcon className="w-6 h-6 text-purple-400 shrink-0" />
              <div className="truncate">
                <p className="font-bold text-white text-sm truncate">LocalMind</p>
                <p className="text-xs text-gray-500 truncate">v2.0 · Offline AI</p>
              </div>
            </div>
          ) : (
            <AppLogoIcon className="w-6 h-6 text-purple-400 mx-auto" />
          )}
          
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
            className="text-gray-500 hover:text-gray-300 transition text-xs p-1 rounded hover:bg-gray-800"
          >
            {isExpanded ? "◀" : "▶"}
          </button>
        </div>
        
        <button onClick={onNewChat}
          title={!isExpanded ? "New Chat" : undefined}
          className="w-full text-sm bg-purple-700 hover:bg-purple-600 active:bg-purple-800 text-white py-2 rounded-xl font-medium transition flex items-center justify-center">
          {isExpanded ? "+ New Chat" : "+"}
        </button>
      </div>

      {/* Configuration Settings (Hidden when collapsed to avoid UI breakage) */}
      {isExpanded && (
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
      )}

      {/* Search Input Box */}
      <div className="px-3 py-2 border-b border-gray-800">
        <input value={search} onChange={e=>setSearch(e.target.value)}
          disabled={!isExpanded}
          placeholder={isExpanded ? "Search chats..." : "🔍"}
          className="w-full text-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-300 placeholder-gray-600 outline-none focus:border-purple-500 disabled:opacity-50 text-center md:text-left" />
      </div>

      {/* Navigational Active Chat Sessions Stream */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isExpanded && filtered.length === 0 && (
          <p className="text-xs text-gray-600 px-2 py-1">
            {sessions.length === 0 ? "No chats yet. Start one!" : "No results."}
          </p>
        )}
        {filtered.map(s => (
          <div key={s.id} className={`group flex items-center gap-1 rounded-lg mb-0.5 transition justify-center
            ${currentSession === s.id ? "bg-gray-700" : "hover:bg-gray-800"}`}>
            <button onClick={()=>onLoadSession(s.id)}
              title={!isExpanded ? s.title || "New Chat" : undefined}
              className={`flex-1 text-xs py-2 truncate text-gray-400 group-hover:text-gray-200 flex items-center ${isExpanded ? "text-left px-3 gap-1.5" : "justify-center"}`}>
              <ChatIcon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              {isExpanded && (
                <>
                  <span className={`truncate ${currentSession === s.id ? "text-white" : ""}`}>
                    {s.title || "New Chat"}
                  </span>
                  {s.message_count > 0 && (
                    <span className="ml-auto text-gray-600 text-[10px] bg-gray-900 px-1.5 py-0.5 rounded-full">{s.message_count}</span>
                  )}
                </>
              )}
            </button>
            {isExpanded && (
              <button onClick={()=>onDeleteSession(s.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 px-2 py-2 transition text-xs shrink-0">
                ×
              </button>
            )}
          </div>
        ))}
      </div>


      {/* Informational Footer Blocks */}
      <div className="px-4 py-3 border-t border-gray-800 flex flex-col gap-2 items-center md:items-start">
        <p className="text-xs text-gray-600 inline-flex items-center gap-1" title="100% local · no cloud · MIT">
          <LockIcon className="w-3.5 h-3.5 shrink-0" />
          {isExpanded && <span className="truncate">100% local · no cloud · MIT</span>}
        </p>
        <a href="https://github.com/yourusername/localmind" target="_blank" rel="noreferrer"
          className="text-xs text-purple-500 hover:text-purple-400 transition inline-flex items-center gap-1">
          <StarIcon className="w-3.5 h-3.5 shrink-0" />
          {isExpanded && <span>Star on GitHub</span>}
        </a>
      </div>
    </div>
  );
}