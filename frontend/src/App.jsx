import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import UploadPanel from "./components/UploadPanel";
import PluginsPanel from "./components/PluginsPanel";
import SettingsPanel from "./components/SettingsPanel";
import StatusBar from "./components/StatusBar";
import * as api from "./utils/api";

export default function App() {
  const [sessionId,   setSessionId]  = useState(() => uuidv4());
  const [messages,    setMessages]   = useState([]);
  const [sessions,    setSessions]   = useState([]);
  const [model,      setModel]      = useState("llama3");
  const [models,     setModels]     = useState([]);
  const [documents,  setDocuments]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [streaming,  setStreaming]  = useState(false);
  const [panel,      setPanel]      = useState(null); // "upload"|"plugins"|"settings"|null
  const [language,   setLanguage]   = useState("en");
  const [ollamaOk,   setOllamaOk]   = useState(null);
  const [settings,   setSettings]   = useState({});
  const [useStream,  setUseStream]  = useState(true);

  // --- Issue #261: Undo Delete Cache Management ---
  const [deletedSessionCache, setDeletedSessionCache] = useState(null); // stores { id, title, position }
  const [showUndoToast, setShowUndoToast] = useState(false);
  const deleteTimeoutRef = useRef(null);

  useEffect(() => { bootstrap(); }, []);

  // Clean up timers if component unmounts unexpectedly
  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
    };
  }, []);

  async function bootstrap() {
    try {
      const [mRes, sRes, settRes, stRes] = await Promise.allSettled([
        api.getModels(), api.getSessions(), api.getSettings(), api.getOllamaStatus(),
      ]);
      if (mRes.status === "fulfilled") setModels(mRes.value.models || []);
      if (sRes.status === "fulfilled") setSessions(sRes.value || []);
      if (settRes.status === "fulfilled") {
        setSettings(settRes.value);
        if (settRes.value.default_model) setModel(settRes.value.default_model);
        if (settRes.value.default_language) setLanguage(settRes.value.default_language);
      }
      if (stRes.status === "fulfilled") setOllamaOk(stRes.value.ollama_running);
    } catch {}
  }

  const refreshSessions = useCallback(async () => {
    try { const s = await api.getSessions(); setSessions(s || []); } catch {}
  }, []);

  const refreshDocuments = useCallback(async (sid) => {
    try { const d = await api.getDocuments(sid); setDocuments(d.documents || []); } catch {}
  }, []);

  async function sendMessage(text) {
    if (!text.trim() || loading || streaming) return;
    const userMsg = { role: "user", content: text, id: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    if (useStream) {
      setStreaming(true);
      const aiMsg = { role: "assistant", content: "", sources: [], id: Date.now() + 1, streaming: true };
      setMessages(prev => [...prev, aiMsg]);
      try {
        await api.streamMessage(
          { message: text, session_id: sessionId, model, use_documents: documents.length > 0, language },
          (token) => setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: m.content + token } : m)),
          (sources) => {
            setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, sources, streaming: false } : m));
            refreshSessions();
          }
        );
      } catch (e) {
        setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: e.message, streaming: false } : m));
      } finally { setStreaming(false); }
    } else {
      setLoading(true);
      try {
        const data = await api.sendMessage({ message: text, session_id: sessionId, model, use_documents: documents.length > 0, language });
        setMessages(prev => [...prev, { role: "assistant", content: data.reply, sources: data.sources || [], id: Date.now() + 1 }]);
        refreshSessions();
      } catch (e) {
        setMessages(prev => [...prev, { role: "assistant", content: e.message, id: Date.now() + 1 }]);
      } finally { setLoading(false); }
    }
  }

  async function newChat() {
    const sid = uuidv4();
    await api.createSession({ title: "New Chat", model });
    setSessionId(sid);
    setMessages([]);
    setDocuments([]);
    setPanel(null);
    refreshSessions();
  }

  async function loadSession(sid) {
    setSessionId(sid);
    setPanel(null);
    try {
      const [msgRes, docRes] = await Promise.all([api.getMessages(sid), api.getDocuments(sid)]);
      setMessages((msgRes.messages || []).map((m, i) => ({ ...m, id: i })));
      setDocuments(docRes.documents || []);
    } catch {}
  }

  // --- Issue #261: Updated Non-Blocking Delete Flow handler ---
  async function handleDeleteSession(sid) {
    // If a previous delete is pending, commit it immediately before processing the new one
    if (deleteTimeoutRef.current) {
      clearTimeout(deleteTimeoutRef.current);
      if (deletedSessionCache) {
        await api.deleteSession(deletedSessionCache.id);
      }
    }

    const targetIndex = sessions.findIndex(s => s.id === sid);
    if (targetIndex === -1) return;

    const sessionToBackup = sessions[targetIndex];

    // Cache it locally so we can restore later if requested
    setDeletedSessionCache({
      id: sid,
      title: sessionToBackup.title,
      index: targetIndex,
      sessionObj: sessionToBackup
    });

    // Optimistically update the layout arrays immediately for UI snappiness
    const filteredSessions = sessions.filter(s => s.id !== sid);
    setSessions(filteredSessions);

    if (sid === sessionId) {
      if (filteredSessions.length > 0) {
        loadSession(filteredSessions[0].id);
      } else {
        setSessionId(uuidv4());
        setMessages([]);
        setDocuments([]);
      }
    }

    setShowUndoToast(true);

    // Set a 5-second countdown timer before hitting the persistence database
    deleteTimeoutRef.current = setTimeout(async () => {
      try {
        await api.deleteSession(sid);
      } catch (err) {
        console.error("Delayed delete failed:", err);
      } finally {
        setShowUndoToast(false);
        setDeletedSessionCache(null);
        deleteTimeoutRef.current = null;
      }
    }, 5000);
  }

  // --- Issue #261: Undo Handler Mechanism ---
  const handleUndoDelete = () => {
    if (!deletedSessionCache) return;

    // Clear the database execution timer block
    if (deleteTimeoutRef.current) {
      clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }

    // Re-insert the item back into its exact historical position in the state loop
    setSessions(prev => {
      const updated = [...prev];
      updated.splice(deletedSessionCache.index, 0, deletedSessionCache.sessionObj);
      return updated;
    });

    // Fall back to making the restored session the active window panel view
    setSessionId(deletedSessionCache.id);
    loadSession(deletedSessionCache.id);

    // Wipe layout toast triggers clean
    setShowUndoToast(false);
    setDeletedSessionCache(null);
  };

  // Issue #226 sync hook handler
  async function handleRenameSession(sid, newTitle) {
    try {
      await api.updateSession(sid, { title: newTitle });
      refreshSessions();
    } catch (e) {
      console.error("Failed to rename session:", e);
    }
  }

  async function handleClearChat() {
    await api.clearMessages(sessionId);
    setMessages([]);
  }

  return (
    <div className={`flex h-screen overflow-hidden ${settings.theme === "light" ? "bg-gray-100" : "bg-gray-950"} text-gray-100 relative`}>
      <Sidebar
        sessions={sessions}
        currentSession={sessionId}
        onNewChat={newChat}
        onLoadSession={loadSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        model={model}
        models={models}
        onModelChange={setModel}
        language={language}
        onLanguageChange={setLanguage}
      />

      <div className="flex flex-col flex-1 overflow-hidden relative">
        <StatusBar
          ollamaOk={ollamaOk}
          model={model}
          docCount={documents.length}
          onUpload={() => setPanel(panel === "upload" ? null : "upload")}
          onPlugins={() => setPanel(panel === "plugins" ? null : "plugins")}
          onSettings={() => setPanel(panel === "settings" ? null : "settings")}
          onClear={handleClearChat}
          useStream={useStream}
          onToggleStream={() => setUseStream(p => !p)}
        />

        {panel === "upload" && (
          <UploadPanel
            sessionId={sessionId}
            documents={documents}
            onUploaded={() => refreshDocuments(sessionId)}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === "plugins" && (
          <PluginsPanel sessionId={sessionId} onClose={() => setPanel(null)} />
        )}
        {panel === "settings" && (
          <SettingsPanel
            settings={settings}
            onSave={async (s) => { await api.saveSettings(s); setSettings(s); setPanel(null); }}
            onClose={() => setPanel(null)}
          />
        )}

        <ChatWindow
          messages={messages}
          loading={loading || streaming}
          onSend={sendMessage}
          sessionId={sessionId}
        />

        {/* --- Issue #261: Dynamic Absolute Positioned Undo Toast Element --- */}
        {showUndoToast && deletedSessionCache && (
          <div className="fixed bottom-5 right-5 z-50 flex items-center justify-between gap-4 bg-gray-900 border border-purple-500/40 text-gray-200 text-xs rounded-xl shadow-2xl px-4 py-3 animate-fade-in min-w-[240px]">
            <p className="truncate max-w-[160px]">
              Deleted <span className="text-purple-400 font-medium">"{deletedSessionCache.title}"</span>
            </p>
            <button
              onClick={handleUndoDelete}
              className="text-purple-400 hover:text-purple-300 font-semibold underline underline-offset-2 transition active:scale-95 shrink-0"
            >
              Undo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}