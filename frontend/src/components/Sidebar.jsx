import { useState, useEffect } from "react";
import { AppLogoIcon, ChatIcon, LockIcon, StarIcon, PinIcon } from "./Icons";
import { PALETTE } from "../utils/colorHelper";
import { highlightText } from "../utils/search";
import { getPinnedSessions, toggleSessionPin } from "../utils/pinHelper";
import DeleteConfirmDialog from "./DeleteConfirmDialog";

const LANGUAGES = [
  {code:"en",label:"English"},{code:"hi",label:"हिन्दी"},{code:"ta",label:"தமிழ்"},
  {code:"te",label:"తెలుగు"},{code:"kn",label:"ಕನ್ನಡ"},{code:"fr",label:"Français"},
  {code:"de",label:"Deutsch"},{code:"es",label:"Español"},  {code:"ar",label:"العربية"},

];

export default function Sidebar({ sessions, currentSession, onNewChat, onLoadSession, onDeleteSession, onClearAllSessions, model, models, onModelChange, language, onLanguageChange, onUpdateSessionColor }) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false); // Mobile drawer toggle state
  
  const [contextMenu, setContextMenu] = useState(null); // { sessionId, x, y }
  const [pinnedIds, setPinnedIds] = useState(() => getPinnedSessions());
  const [deleteConfirm, setDeleteConfirm] = useState(null);

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
          className="flex-1 min-w-0 text-left text-xs pl-6 pr-1 py-2 truncate text-gray-400 group-hover:text-gray-200">
          <span className={isActive ? "text-white" : ""}>
            <span className="inline-flex items-center gap-1.5">
              <ChatIcon className="w-3.5 h-3.5 text-gray-500" />
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
                aria-label="Tag color"
              />
              <span>{highlightText(s.title || "New Chat", search)}</span>
            </span>
          </span>
          {s.message_count > 0 && (
            <span className="ml-1 text-gray-600">{s.message_count}</span>
          )}
        </button>
        <button onClick={(e) => handleTogglePin(e, s.id)}
          aria-label={isPinned ? "Unpin chat" : "Pin chat"}
          className={`relative group/pin px-1.5 py-2 transition text-xs ${isPinned ? "text-purple-400 opacity-100" : "text-gray-500 opacity-0 group-hover:opacity-100 hover:text-gray-300"}`}>
          <PinIcon className="w-3.5 h-3.5" filled={isPinned} />
          <span className="hidden md:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 border border-gray-700 text-gray-300 text-[10px] rounded opacity-0 group-hover/pin:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
            {isPinned ? "Unpin chat" : "Pin chat"}
          </span>
        </button>
        <button onClick={()=>setDeleteConfirm({sessionId: s.id, sessionName: s.title})}
          aria-label="Delete chat"
          className="relative group/del opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 px-1.5 py-2 transition text-xs">
          ×
          <span className="hidden md:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 border border-gray-700 text-gray-300 text-[10px] rounded opacity-0 group-hover/del:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
            Delete
          </span>
        </button>
        {deleteConfirm && (
          <DeleteConfirmDialog
            sessionName={deleteConfirm.sessionName}
            onConfirm={() => {
              onDeleteSession(deleteConfirm.sessionId);
              setDeleteConfirm(null);
            }}
            onClose={() => setDeleteConfirm(null)}
          />
        )}
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
    <>
      {/* --- Mobile Hamburger Toggle Trigger --- */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 hover:text-white transition shadow-md"
        aria-label="Toggle Navigation Sidebar"
      >
        {isOpen ? (
          <span className="text-xl leading-none font-bold block w-5 h-5 flex items-center justify-center">×</span>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* --- Mobile Dim Backdrop Overlay --- */}
      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-xs transition"
        />
      )}

      {/* --- Responsive Sidebar Shell Container --- */}
      <div 
        style={{ width: window.innerWidth >= 768 ? width : undefined }}
        className={`
          fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out
          md:relative md:transform-none md:translate-x-0 md:z-auto
          flex flex-col bg-gray-900 border-r border-gray-800 shrink-0
          ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Logo Section */}
        <div className="px-4 pt-16 md:pt-5 pb-4 border-b border-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <AppLogoIcon className="w-6 h-6 text-purple-400" />
            <div>
              <p className="font-bold text-white text-sm">LocalMind</p>
              <p className="text-xs text-gray-500">v2.0 · Offline AI</p>
            </div>
          </div>
        <button onClick={() => { onNewChat(); setIsOpen(false); }}
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

        {/* Search Bar */}
        <div className="px-3 py-2 border-b border-gray-800">
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search chats..."
            className="w-full text-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-300 placeholder-gray-600 outline-none focus:border-purple-500" />
        </div>

       {/* Historical Chat Sessions List */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {pinnedSessions.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-semibold text-gray-500 px-2 mb-1 tracking-wider uppercase">Pinned</p>
              {pinnedSessions.map(renderSessionRow)}
            </div>
          )}
          <div>
            {pinnedSessions.length > 0 && unpinnedSessions.length > 0 && (
              <p className="text-[10px] font-semibold text-gray-500 px-2 mb-1 tracking-wider uppercase">Recent</p>
            )}
            {unpinnedSessions.length === 0 && pinnedSessions.length === 0 && (
              <p className="text-xs text-gray-600 px-2 py-1">
                {sessions.length === 0 ? "No chats yet. Start one!" : "No results."}
              </p>
            )}
            {unpinnedSessions.map(renderSessionRow)}
          </div>
        </div>

        {/* Local Security and Source Attributions Footer */}
        <div className="px-4 py-3 border-t border-gray-800 flex flex-col gap-1">
          <p className="text-xs text-gray-600 inline-flex items-center gap-1">
            <LockIcon className="w-3.5 h-3.5" />
            <span>100% local · no cloud · MIT</span>
          </p>
          <a href="https://github.com/yourusername/localmind" target="_blank" rel="noreferrer"
            className="text-xs text-purple-500 hover:text-purple-400 transition inline-flex items-center gap-1 w-max">
            <StarIcon className="w-3.5 h-3.5" />
            <span>Star on GitHub</span>
          </a>
        </div>
        <div 
          onMouseDown={() => setIsResizing(true)}
          className="hidden md:block absolute top-0 right-0 bottom-0 w-1 cursor-col-resize bg-transparent hover:bg-purple-500/40 transition-colors"
        />
      </div>
    </>
  );
}