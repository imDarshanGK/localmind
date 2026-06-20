import { useState, useEffect } from "react";
import { AppLogoIcon, ChatIcon, LockIcon, StarIcon, PinIcon } from "./Icons";
import { PALETTE } from "../utils/colorHelper";
import { highlightText } from "../utils/search";
import { getPinnedSessions, toggleSessionPin } from "../utils/pinHelper";

const LANGUAGES = [
  {code:"en",label:"English"},{code:"hi",label:"हिन्दी"},{code:"ta",label:"தமிழ்"},
  {code:"te",label:"తెలుగు"},{code:"kn",label:"ಕನ್ನಡ"},{code:"fr",label:"Français"},
  {code:"de",label:"Deutsch"},{code:"es",label:"Español"},  {code:"ar",label:"العربية"},

];

export default function Sidebar({ sessions, currentSession, onNewChat, onLoadSession, onDeleteSession, onClearAllSessions, model, models, onModelChange, language, onLanguageChange, onUpdateSessionColor }) {
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState(null); // { sessionId, x, y }
  const [pinnedIds, setPinnedIds] = useState(() => getPinnedSessions());

  const [isResizing, setIsResizing] = useState(false);
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem("sidebarWidth");
    let w = saved !== null && !isNaN(parseInt(saved, 10)) ? parseInt(saved, 10) : 280;
    if (w < 10) w = 10;
    if (w > window.innerWidth - 10) w = window.innerWidth - 10;
    return w;
  });

  useEffect(() => {
    if (!isResizing) return;
    
    const handleMouseMove = (e) => {
      let newWidth = e.clientX;
      if (newWidth < 10) newWidth = 10;
      if (newWidth > window.innerWidth - 10) newWidth = window.innerWidth - 10;
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  useEffect(() => {
    if (!isResizing) {
      localStorage.setItem("sidebarWidth", width);
    }
  }, [isResizing, width]);

  const modelList = models.length > 0 ? models.map(m=>m.name) : ["llama3","mistral","phi3","gemma2"];
  const filtered  = sessions.filter(s => s.title?.toLowerCase().includes(search.toLowerCase()));
  const pinnedSessions = filtered.filter(s => pinnedIds.includes(s.id));
  const unpinnedSessions = filtered.filter(s => !pinnedIds.includes(s.id));

  const handleTogglePin = (e, sessionId) => {
    e.stopPropagation();
    const newPinned = toggleSessionPin(sessionId);
    setPinnedIds(newPinned);
  };

  const renderSessionRow = (s) => {
    const isActive = currentSession === s.id;
    const isPinned = pinnedIds.includes(s.id);
    return (
      <div key={s.id}
        onContextMenu={(e) => handleContextMenu(e, s.id)}
        className={`relative group flex items-center rounded-lg mb-0.5 transition
          ${isActive ? "bg-gray-700" : "hover:bg-gray-800"}`}>
        <span
          aria-hidden="true"
          className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-purple-400 transition-opacity duration-300
            ${isActive ? "opacity-100 animate-pulse" : "opacity-0"}`}
        />
        <button onClick={()=>onLoadSession(s.id)}
          className="flex-1 text-left text-xs pl-6 pr-1 py-2 truncate text-gray-400 group-hover:text-gray-200">
          <span className={isActive ? "text-white" : ""}>
            <span className="inline-flex items-center gap-1.5">
              <ChatIcon className="w-3.5 h-3.5 text-gray-500" />
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
                title="Tag color"
              />
              <span>{highlightText(s.title || "New Chat", search)}</span>
            </span>
          </span>
          {s.message_count > 0 && (
            <span className="ml-1 text-gray-600">{s.message_count}</span>
          )}
        </button>
        <button onClick={(e) => handleTogglePin(e, s.id)}
          title={isPinned ? "Unpin chat" : "Pin chat"}
          className={`px-1.5 py-2 transition text-xs ${isPinned ? "text-purple-400 opacity-100" : "text-gray-500 opacity-0 group-hover:opacity-100 hover:text-gray-300"}`}>
          <PinIcon className="w-3.5 h-3.5" filled={isPinned} />
        </button>
        <button onClick={()=>onDeleteSession(s.id)}
          className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 px-1.5 py-2 transition text-xs">
          ×
        </button>
      </div>
    );
  };

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("contextmenu", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("contextmenu", closeMenu);
    };
  }, []);

  const handleContextMenu = (e, sessionId) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 190;
    const menuHeight = 40;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;
    setContextMenu({ sessionId, x, y });
  };

  return (
    <div 
      className="relative flex flex-col bg-gray-900 border-r border-gray-800 shrink-0 overflow-x-hidden transition-[width] duration-0"
      style={{ width: `${width}px` }}
    >
      {/* Drag handle */}
      <div 
        onMouseDown={() => setIsResizing(true)}
        className="absolute top-0 right-0 w-[5px] h-full cursor-col-resize hover:bg-purple-500/50 z-50 transition-colors"
      />
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
          title="New Chat"
          className="w-full text-sm bg-purple-700 hover:bg-purple-600 active:bg-purple-800 text-white py-2 rounded-xl font-medium transition">
          + New Chat
          <span className="block text-xs text-purple-300 font-normal opacity-75">Ctrl+Shift+N</span>
        </button>
      </div>

      {/* Model */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500">AI Model</label>
          <button 
            id="btn-model-info"
            onClick={async () => {
              try {
                const { getModelInfo } = await import('../utils/api');
                const info = await getModelInfo(model);
                alert(`Model Info for ${model}:\n\nFamily: ${info.details?.family}\nFormat: ${info.details?.format}\nParameter Size: ${info.details?.parameter_size}\nQuantization: ${info.details?.quantization_level}`);
              } catch (e) {
                alert(`Failed to fetch model info: ${e.message}`);
              }
            }}
            className="text-[10px] text-purple-400 hover:text-purple-300"
            title="View Model Metadata (Cached)"
          >
            [Info]
          </button>
        </div>
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
        
        {pinnedSessions.length > 0 && (
          <div className="mb-4">
            <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 mb-1.5">Pinned</h3>
            {pinnedSessions.map(renderSessionRow)}
          </div>
        )}

        {unpinnedSessions.length > 0 && (
          <div>
            {pinnedSessions.length > 0 && (
              <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 mb-1.5">Recent</h3>
            )}
            {unpinnedSessions.map(renderSessionRow)}
          </div>
        )}
      </div>

      {/* Custom Context Menu Color Picker */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-2 flex gap-1.5"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          {PALETTE.map((color) => (
            <button
              key={color.hex}
              onClick={() => {
                onUpdateSessionColor(contextMenu.sessionId, color.hex);
                setContextMenu(null);
              }}
              title="Click to change color"
              className="w-5 h-5 rounded-full border border-gray-600 hover:scale-110 active:scale-95 transition-transform"
              style={{ backgroundColor: color.hex }}
            />
          ))}
        </div>
      )}

      {sessions.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-800 shrink-0">
          <button
            onClick={() => {
              if (window.confirm("Delete all sessions? This cannot be undone.")) {
                onClearAllSessions();
              }
            }}
            className="w-full text-left text-xs text-gray-500 hover:text-red-400 hover:bg-red-950/20 px-3 py-2 rounded-lg transition inline-flex items-center gap-2 font-medium"
          >
            <span>🗑</span>
            <span>Clear all sessions</span>
          </button>
        </div>
      )}

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
