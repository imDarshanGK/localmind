import { useState, useEffect } from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AppLogoIcon, ChatIcon, LockIcon, StarIcon } from "./Icons";
import { highlightText } from "../utils/search";
import { api } from "../utils/api";

const LANGUAGES = [
  { code: "en", label: "English" }, { code: "hi", label: "हिन्दी" }, { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" }, { code: "kn", label: "ಕನ್ನಡ" }, { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" }, { code: "es", label: "Español" },
];

// Individual sortable session item
function SortableSessionItem({ session, isActive, search, onLoad, onDelete, messageCount }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: session.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div
        className={`group flex items-center gap-1 rounded-lg mb-0.5 transition ${
          isActive ? "bg-gray-700" : "hover:bg-gray-800"
        }`}
      >
        <button
          onClick={() => onLoad(session.id)}
          className="flex-1 text-left text-xs px-3 py-2 truncate text-gray-400 group-hover:text-gray-200"
        >
          <span className={isActive ? "text-white" : ""}>
            <span className="inline-flex items-center gap-1.5">
              <ChatIcon className="w-3.5 h-3.5 text-gray-500" />
              <span>{highlightText(session.title || "New Chat", search)}</span>
            </span>
          </span>
          {messageCount > 0 && <span className="ml-1 text-gray-600">{messageCount}</span>}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(session.id);
          }}
          className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 px-2 py-2 transition text-xs"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export default function Sidebar({
  sessions,
  currentSession,
  onNewChat,
  onLoadSession,
  onDeleteSession,
  model,
  models,
  onModelChange,
  language,
  onLanguageChange,
  refreshSessions, // optional: function to refresh sessions after reorder
}) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  const [loadingReorder, setLoadingReorder] = useState(false);
  const modelList = models.length > 0 ? models.map((m) => m.name) : ["llama3", "mistral", "phi3", "gemma2"];
  const filtered = sessions.filter((s) => s.title?.toLowerCase().includes(search.toLowerCase()));

  // Sync items with session IDs when sessions change
  useEffect(() => {
    setItems(sessions.map((s) => s.id));
  }, [sessions]);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = items.indexOf(active.id);
      const newIndex = items.indexOf(over.id);
      const newItems = arrayMove(items, oldIndex, newIndex);
      setItems(newItems);
      setLoadingReorder(true);
      try {
        await api.reorderSessions(newItems);
        // Optionally refresh sessions from backend
        if (refreshSessions) refreshSessions();
      } catch (err) {
        console.error("Reorder failed:", err);
        setItems(sessions.map((s) => s.id)); // revert
      } finally {
        setLoadingReorder(false);
      }
    }
  };

  // Map items to session objects in the new order
  const orderedSessions = items
    .map((id) => sessions.find((s) => s.id === id))
    .filter(Boolean);

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
        <button
          onClick={onNewChat}
          title="New Chat"
          className="w-full text-sm bg-purple-700 hover:bg-purple-600 active:bg-purple-800 text-white py-2 rounded-xl font-medium transition"
        >
          + New Chat
          <span className="block text-xs text-purple-300 font-normal opacity-75">Ctrl+Shift+N</span>
        </button>
      </div>

      {/* Model & Language */}
      <div className="px-4 py-3 border-b border-gray-800">
        <label className="text-xs text-gray-500 block mb-1">AI Model</label>
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          className="w-full text-xs bg-gray-800 text-gray-200 border border-gray-700 rounded-lg px-2 py-1.5 outline-none focus:border-purple-500"
        >
          {modelList.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <label className="text-xs text-gray-500 block mb-1 mt-2">Language</label>
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          className="w-full text-xs bg-gray-800 text-gray-200 border border-gray-700 rounded-lg px-2 py-1.5 outline-none focus:border-purple-500"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-800">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search chats..."
          className="w-full text-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-300 placeholder-gray-600 outline-none focus:border-purple-500"
        />
      </div>

      {/* Sessions (with drag-and-drop) */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {orderedSessions.length === 0 && (
          <p className="text-xs text-gray-600 px-2 py-1">
            {sessions.length === 0 ? "No chats yet. Start one!" : "No results."}
          </p>
        )}
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            {orderedSessions.map((session) => (
              <SortableSessionItem
                key={session.id}
                session={session}
                isActive={currentSession === session.id}
                search={search}
                onLoad={onLoadSession}
                onDelete={onDeleteSession}
                messageCount={session.message_count || 0}
              />
            ))}
          </SortableContext>
        </DndContext>
        {loadingReorder && (
          <div className="text-xs text-gray-500 text-center mt-2">Saving order...</div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-800">
        <p className="text-xs text-gray-600 inline-flex items-center gap-1">
          <LockIcon className="w-3.5 h-3.5" />
          <span>100% local · no cloud · MIT</span>
        </p>
        <a
          href="https://github.com/yourusername/localmind"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-purple-500 hover:text-purple-400 transition inline-flex items-center gap-1 mt-1 block"
        >
          <StarIcon className="w-3.5 h-3.5" />
          <span>Star on GitHub</span>
        </a>
      </div>
    </div>
  );
}