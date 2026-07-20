import { useState, useEffect, useRef } from "react";
import { AppLogoIcon, ChatIcon, LockIcon, StarIcon, PinIcon } from "./Icons";
import { getSessionColor } from "../utils/colorHelper";
import { highlightText } from "../utils/search";
import { getPinnedSessions, toggleSessionPin } from "../utils/pinHelper";
import DeleteConfirmDialog from "./DeleteConfirmDialog";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" },
  { code: "kn", label: "ಕನ್ನಡ" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "ar", label: "العربية" },
];

export default function Sidebar({
  sessions,
  currentSession,
  onNewChat,
  onLoadSession,
  onDeleteSession,
  onClearAllSessions,
  model,
  models,
  onModelChange,
  language,
  onLanguageChange,
  onUpdateSessionColor,
  onRenameSession, 
  error,
  onErrorDismiss,
}) {
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [copiedId, setCopiedId] = useState(null);
  const [creating, setCreating] = useState(false);
  
  // Responsive sidebar mobile drawer toggle state
  const [isOpen, setIsOpen] = useState(false);
  
  // Persistent collapse view state for desktop viewports
  const [isExpanded, setIsExpanded] = useState(() => {
    const savedState = localStorage.getItem("sidebar_expanded_state");
    return savedState !== null ? JSON.parse(savedState) : true;
  });

  // Keep localStorage synced
  useEffect(() => {
    localStorage.setItem("sidebar_expanded_state", JSON.stringify(isExpanded));
  }, [isExpanded]);

  // Pins, context menus, and deletion states
  const [pinnedIds, setPinnedIds] = useState(() => getPinnedSessions() || []);
  const [contextMenu, setContextMenu] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Inline editing states
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const inputRef = useRef(null);

  // Auto-focus mechanic for renaming
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("contextmenu", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("contextmenu", closeMenu);
    };
  }, []);

  const modelList = models.length > 0 ? models.map((m) => m.name) : ["llama3", "mistral", "phi3", "gemma2"];
  const filtered = sessions.filter((s) => s.title?.toLowerCase().includes(search.toLowerCase()));
  const pinnedSessions = filtered.filter((s) => pinnedIds.includes(s.id));
  const unpinnedSessions = filtered.filter((s) => !pinnedIds.includes(s.id));

  // Reset keyboard navigation focus index whenever searches change
  useEffect(() => {
    setActiveIndex(-1);
  }, [search]);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    const totalItems = pinnedSessions.length + unpinnedSessions.length;
    if (totalItems === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const targetSession = activeIndex < pinnedSessions.length 
        ? pinnedSessions[activeIndex] 
        : unpinnedSessions[activeIndex - pinnedSessions.length];
      if (targetSession) {
        onLoadSession(targetSession.id);
        setIsOpen(false);
      }
    } else if (e.key === "Delete" && activeIndex >= 0) {
      e.preventDefault();
      const targetSession = activeIndex < pinnedSessions.length 
        ? pinnedSessions[activeIndex] 
        : unpinnedSessions[activeIndex - pinnedSessions.length];
      if (targetSession) {
        setDeleteConfirm({ sessionId: targetSession.id, sessionName: targetSession.title });
      }
    } else if (e.key === "Escape") {
      setActiveIndex(-1);
    }
  };

  async function handleCreateChat() {
    if (creating) return;
    setCreating(true);
    try {
      await onNewChat();
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to initialize session context:", err);
    } finally {
      setCreating(false);
    }
  }

  const handleSaveRename = (id) => {
    if (editTitle.trim() && onRenameSession) {
      onRenameSession(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleTogglePin = (e, sessionId) => {
    if (e) e.stopPropagation();
    const newPinned = toggleSessionPin(sessionId);
    setPinnedIds(newPinned);
  };

  const handleCopySession = (e, session) => {
    e.stopPropagation();
    const textToCopy = session.title || "New Chat";

    if (navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
      setCopiedId(session.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

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

  const renderSessionRow = (s) => {
    const isActive = currentSession === s.id;
    const isPinned = pinnedIds.includes(s.id);
    const globalIdx = isPinned 
      ? pinnedSessions.findIndex(x => x.id === s.id) 
      : pinnedSessions.length + unpinnedSessions.findIndex(x => x.id === s.id);
    const isFocusedViaKeyboard = activeIndex === globalIdx;
    const sessionTitle = s.title || "New Chat";

    return (
      <div
        key={s.id}
        data-testid={`session-item-${s.id}`}
        onContextMenu={(e) => handleContextMenu(e, s.id)}
        className={`relative group flex items-center justify-between rounded-lg mb-0.5 transition pl-1 pr-1
          ${isActive || isFocusedViaKeyboard ? "bg-gray-700 ring-1 ring-purple-500" : "hover:bg-gray-800"}`}
      >
        {isExpanded && (
          <span
            aria-hidden="true"
            className={`absolute left-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-purple-400 transition-opacity duration-300
              ${isActive ? "opacity-100 animate-pulse" : "opacity-0"}`}
          />
        )}
        
        {/* Interactive element boundary area wrapper */}
        <div 
          onDoubleClick={() => {
            if (!isExpanded) return;
            setEditingId(s.id);
            setEditTitle(sessionTitle);
          }}
          className={`flex-1 min-w-0 text-left text-xs py-2 text-gray-400 group-hover:text-gray-200 cursor-pointer ${isExpanded ? "pl-5 pr-1" : "flex justify-center"}`}
        >
          {editingId === s.id && isExpanded ? (
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
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <button 
              type="button"
              data-testid={`load-session-${s.id}`}
              onClick={() => {
                onLoadSession(s.id);
                setIsOpen(false);
              }} 
              title={`Switch to session: ${sessionTitle}`}
              aria-current={isActive ? "true" : undefined}
              className={`inline-flex items-center gap-1.5 outline-none ${isExpanded ? "w-full text-left" : "justify-center"} ${isActive || isFocusedViaKeyboard ? "text-white" : ""}`}
            >
              <ChatIcon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              {isExpanded ? (
                <>
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: s.color || getSessionColor(s.id) }}
                    aria-label="Tag color"
                  />
                  <span className="truncate flex-1" title="Double click to rename">
                    {highlightText(sessionTitle, search)}
                  </span>
                  {s.message_count > 0 && (
                    <span 
                      className="ml-1 text-gray-500 text-[10px] bg-gray-800/60 px-1.5 py-0.5 rounded-full shrink-0" 
                      data-testid={`msg-count-${s.id}`} 
                      aria-label={`${s.message_count} messages`}
                    >
                      {s.message_count}
                    </span>
                  )}
                </>
              ) : (
                s.message_count > 0 && (
                  <span className="absolute -top-1 -right-1 text-gray-400 text-[8px] bg-gray-900 px-1 rounded-full scale-90">
                    {s.message_count}
                  </span>
                )
              )}
            </button>
          )}
        </div>

        {isExpanded && (
          <div className="flex items-center shrink-0">
            {/* Copy Feedback Action Button */}
            <button
              onClick={(e) => handleCopySession(e, s)}
              title={copiedId === s.id ? "Copied!" : "Copy session title"}
              aria-label={`Copy session title for ${sessionTitle}`}
              className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-purple-400 px-1 py-2 transition text-xs flex items-center shrink-0"
            >
              {copiedId === s.id ? (
                <span className="text-green-400 text-[10px] font-semibold">Copied!</span>
              ) : (
                <span className="text-xs">📋</span>
              )}
            </button>

            {/* Pin Action Button */}
            <button
              onClick={(e) => handleTogglePin(e, s.id)}
              aria-label={isPinned ? "Unpin chat" : "Pin chat"}
              title={isPinned ? "Unpin chat" : "Pin chat"}
              tabIndex={-1}
              className={`relative group/pin px-1 py-2 transition text-xs ${
                isPinned ? "text-purple-400 opacity-100" : "text-gray-500 opacity-0 group-hover:opacity-100 hover:text-gray-300"
              }`}
            >
              <PinIcon className="w-3.5 h-3.5 shrink-0" filled={isPinned} />
              <span className="hidden md:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 border border-gray-700 text-gray-300 text-[10px] rounded opacity-0 group-hover/pin:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                {isPinned ? "Unpin chat" : "Pin chat"}
              </span>
            </button>

            {/* Delete Action Button */}
            <button
              data-testid={`delete-session-${s.id}`}
              onClick={() => setDeleteConfirm({ sessionId: s.id, sessionName: sessionTitle })}
              aria-label={`Delete session ${sessionTitle}`}
              title={`Delete session "${sessionTitle}"`}
              tabIndex={-1}
              className="relative group/del opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 px-1.5 py-2 transition text-sm font-medium shrink-0"
            >
              ×
              <span className="hidden md:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 border border-gray-700 text-gray-300 text-[10px] rounded opacity-0 group-hover/del:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                Delete
              </span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Hamburger Toggle Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 hover:text-white transition shadow-md outline-none"
        aria-label="Toggle Navigation Sidebar"
        title="Toggle Navigation Sidebar"
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
          data-testid="sidebar-backdrop"
        />
      )}

      {/* Main Structural Container */}
      <aside
        aria-label="Chat Management Sidebar"
        className={`
          fixed inset-y-0 left-0 z-40 transform transition-all duration-300 ease-in-out
          md:relative md:transform-none md:translate-x-0 md:z-auto
          flex flex-col bg-gray-900 border-r border-gray-800 shrink-0 outline-none
          ${isOpen ? "translate-x-0 w-[260px]" : "-translate-x-full md:translate-x-0"}
          ${!isOpen && (isExpanded ? "md:w-64" : "md:w-16")}
        `}
      >
        {/* Logo Section & Desktop Collapse Toggle */}
        <div className="px-4 pt-16 md:pt-5 pb-4 border-b border-gray-800">
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
              <AppLogoIcon className="w-6 h-6 text-purple-400 mx-auto md:block hidden" />
            )}
            
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
              title={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
              className="text-gray-500 hover:text-gray-300 transition text-xs p-1 rounded hover:bg-gray-800 hidden md:block"
            >
              {isExpanded ? "◀" : "▶"}
            </button>
          </div>
          <button
            data-testid="new-chat-btn"
            onClick={handleCreateChat}
            disabled={creating}
            title="Start a new chat session"
            aria-label="Start a new chat session"
            className="w-full text-sm bg-purple-700 hover:bg-purple-600 active:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-xl font-medium transition flex items-center justify-center flex-col"
          >
            <span>{creating ? "..." : (isExpanded ? "+ New Chat" : "+")}</span>
            {isExpanded && <span className="text-[10px] text-purple-300 font-normal opacity-75 mt-0.5">Ctrl+Shift+N</span>}
          </button>
        </div>

        {/* Error Banner */}
        {error && isExpanded && (
          <div 
            data-testid="sidebar-error-banner" 
            className="mx-4 mt-3 text-xs bg-red-950/45 border border-red-900/60 text-red-400 p-2.5 rounded-xl flex items-start gap-2"
          >
            <div className="flex-1">
              <p className="font-semibold text-red-300">Sync Failure</p>
              <p className="text-red-400/90 leading-relaxed mt-0.5">{error}</p>
            </div>
            {onErrorDismiss && (
              <button 
                type="button" 
                onClick={onErrorDismiss}
                className="text-red-400/60 hover:text-red-300 font-bold px-1 rounded transition focus:outline-none"
                aria-label="Dismiss sidebar banner"
                title="Dismiss error message"
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* Model Selector Parameters */}
        {isExpanded && (
          <div className="px-4 py-3 border-b border-gray-800">
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="ai-model-select" className="text-xs text-gray-500">AI Model</label>
              <button
                id="btn-model-info"
                onClick={async () => {
                  try {
                    const { getModelInfo } = await import("../utils/api");
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
            <select
              id="ai-model-select"
              data-testid="model-select"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              title="Select AI Model for active conversation"
              aria-label="Select AI Model"
              className="w-full text-xs bg-gray-800 text-gray-200 border border-gray-700 rounded-lg px-2 py-1.5 outline-none focus:border-purple-500"
            >
              {modelList.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <label htmlFor="language-select" className="text-xs text-gray-500 block mb-1 mt-2">Language</label>
            <select
              id="language-select"
              data-testid="language-select"
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              title="Change sidebar interface language"
              aria-label="Select Interface Language"
              className="w-full text-xs bg-gray-800 text-gray-200 border border-gray-700 rounded-lg px-2 py-1.5 outline-none focus:border-purple-500"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Search Bar container */}
        <div role="search" className="px-3 py-2 border-b border-gray-800">
          <input
            data-testid="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={!isExpanded}
            placeholder={isExpanded ? "Search chats..." : "🔍"}
            title="Filter chat history by title"
            aria-label="Search chat sessions history"
            className="w-full text-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-300 placeholder-gray-600 outline-none focus:border-purple-500 disabled:opacity-50 text-center md:text-left"
          />
        </div>

        {/* Chat Sessions Wrapper */}
        <nav 
          data-testid="sessions-list"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          aria-label="Chat Sessions History"
          className="flex-1 overflow-y-auto px-2 py-2 outline-none"
        >
          {isExpanded && filtered.length === 0 && (
            <p className="text-xs text-gray-600 px-2 py-1" data-testid="empty-message">
              {sessions.length === 0 ? "No chats yet. Start one!" : "No results."}
            </p>
          )}

          {/* Render Pinned Items Block */}
          {pinnedSessions.length > 0 && (
            <div className="mb-4">
              {isExpanded && <p className="text-[10px] font-bold text-gray-500 px-2 mb-1 uppercase tracking-wider">Pinned</p>}
              {pinnedSessions.map((s) => renderSessionRow(s))}
            </div>
          )}

          {/* Render Normal Items Block */}
          <div>
            {isExpanded && pinnedSessions.length > 0 && unpinnedSessions.length > 0 && (
              <p className="text-[10px] font-bold text-gray-500 px-2 mb-1 uppercase tracking-wider">Recent</p>
            )}
            {unpinnedSessions.map((s) => renderSessionRow(s))}
          </div>
        </nav>

        {/* Source Attributions footer */}
        <footer className="px-4 py-3 border-t border-gray-800 flex flex-col gap-1 items-center md:items-start">
          <p className="text-xs text-gray-600 inline-flex items-center gap-1" title="Local privacy statement">
            <LockIcon className="w-3.5 h-3.5 shrink-0" />
            {isExpanded && <span className="truncate">100% local · no cloud · MIT</span>}
          </p>
          <a
            href="https://github.com/imDarshanGK/localmind"
            target="_blank"
            rel="noreferrer"
            title="Open GitHub Repository in a new tab"
            className="text-xs text-purple-500 hover:text-purple-400 transition inline-flex items-center gap-1 w-max"
          >
            <StarIcon className="w-3.5 h-3.5 shrink-0" />
            {isExpanded && <span>Star on GitHub</span>}
          </a>
        </footer>
      </aside>

      {/* Delete Confirmation Portal Overlay */}
      {deleteConfirm && (
        <DeleteConfirmDialog
          sessionName={deleteConfirm.sessionName}
          onConfirm={() => {
            onDeleteSession(deleteConfirm.sessionId);
            setDeleteConfirm(null);
            setActiveIndex(-1);
          }}
          onClose={() => setDeleteConfirm(null)}
        />
      )}

      {/* Context Menu Utilities portals */}
      {contextMenu && isExpanded && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg shadow-xl py-1 z-50 min-w-[140px]"
        >
          <button
            onClick={(e) => {
              handleTogglePin(e, contextMenu.sessionId);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-2 hover:bg-gray-700 transition"
          >
            {pinnedIds.includes(contextMenu.sessionId) ? "📍 Unpin Conversation" : "📌 Pin Conversation"}
          </button>
        </div>
      )}
    </>
  );
}