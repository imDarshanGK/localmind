import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import UploadPanel from "./components/UploadPanel";
import PluginsPanel from "./components/PluginsPanel";
import SettingsPanel from "./components/SettingsPanel";
import PromptRegistryPage from "./components/PromptRegistryPage";
import StatusBar from "./components/StatusBar";
import * as api from "./utils/api";
import SharedView from "./components/SharedView";
import { getSessionColor, setSessionColor } from "./utils/colorHelper";

export default function App() {
  const [sessionId,  setSessionId]  = useState(() => uuidv4());
  const [messages,   setMessages]   = useState([]);
  const [sessions,   setSessions]   = useState([]);
  const [model,      setModel]      = useState("llama3");
  const [models,     setModels]     = useState([]);
  const [documents,  setDocuments]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [streaming,  setStreaming]  = useState(false);
  const [panel,      setPanel]      = useState(null); // "upload"|"plugins"|"settings"|null
  const [view,       setView]       = useState("chat"); // "chat"|"prompts"
  const [language,   setLanguage]   = useState("en");
  const [ollamaOk,   setOllamaOk]   = useState(null);
  const [settings,   setSettings]   = useState({});
  const minimalMode = settings?.minimal_mode === true;
  const [useStream,  setUseStream]  = useState(true);

  // Check if the current browser path is for a shared snapshot link
  const path = window.location.pathname;
  const isSharedPath = path.startsWith("/shared/");

  useEffect(() => {
    // Only fetch layout configurations if the user isn't on the public read-only page
    if (!isSharedPath) {
      bootstrap();
    }
  }, [isSharedPath]);
  // --- FEATURE REFERENCE: TRACK ACTIVE REQUEST ABORT SIGNAL ---
  const abortControllerRef = useRef(null);

  useEffect(() => { bootstrap(); }, []);

  // --- Global Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "N") {
        e.preventDefault();
        newChat();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Apply the selected theme preset globally (contrast / readability).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme || "dark");
  }, [settings.theme]);

  // Poll Ollama status and refresh models on recovery
  useEffect(() => {
    if (minimalMode) return;
    const interval = setInterval(async () => {
      try {
        const stRes = await api.getOllamaStatus();
        const isRunning = stRes.ollama_running;
        setOllamaOk((prev) => {
          if (prev === false && isRunning === true) {
            api.getModels().then(mRes => setModels(mRes.models || []));
          }
          return isRunning;
        });
      } catch {
        setOllamaOk(false);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [minimalMode]);

  async function bootstrap() {
    try {
      const [mRes, sRes, settRes, stRes] = await Promise.allSettled([
        api.getModels(), api.getSessions(), api.getSettings(), api.getOllamaStatus(),
      ]);
      if (mRes.status === "fulfilled") setModels(mRes.value.models || []);
      if (sRes.status === "fulfilled") setSessions((sRes.value || []).map(s => ({ ...s, color: getSessionColor(s.id) })));
      if (settRes.status === "fulfilled") {
        setSettings(settRes.value);
        if (settRes.value.default_model) setModel(settRes.value.default_model);
        if (settRes.value.default_language) setLanguage(settRes.value.default_language);
      }
      if (stRes.status === "fulfilled") setOllamaOk(stRes.value.ollama_running);
    } catch { }
  }

  const refreshSessions = useCallback(async () => {
    try { 
      const s = await api.getSessions(); 
      setSessions((s || []).map(sess => ({ ...sess, color: getSessionColor(sess.id) }))); 
    } catch { }
  }, []);

  const refreshDocuments = useCallback(async (sid) => {
    try { const d = await api.getDocuments(sid); setDocuments(d.documents || []); } catch { }
  }, []);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreaming(false);
    setLoading(false);

    // Call backend to actually stop the ongoing generation task
    if (sessionId) {
      api.cancelStream(sessionId).catch(e => console.error("Cancel stream error:", e));
    }

    // Clean up the trailing 'typing' state bubble indicators in the messages layout array
    setMessages(prev =>
      prev.map(m => m.streaming ? { ...m, streaming: false, content: m.content + "\n\n[Generation Stopped]" } : m)
    );
  }, [sessionId]);

  // ─── Core Message Pipelines ───────────────────────────────────────────────

  async function sendMessage(text) {
    if (!text.trim() || loading || streaming) return;
    let activeSid = sessionId;
    if (!activeSid) {
      activeSid = uuidv4();
      setSessionId(activeSid);
    }
    
    // Temporary ID for rendering while waiting
    const tempUserId = Date.now();
    const userMsg = { role: "user", content: text, id: tempUserId };
    setMessages(prev => [...prev, userMsg]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (useStream) {
      setStreaming(true);
      const aiMsg = { role: "assistant", content: "", sources: [], id: tempUserId + 1, streaming: true };
      setMessages(prev => [...prev, aiMsg]);
      try {
        await api.streamMessage(
          { message: text, session_id: activeSid, model, use_documents: documents.length > 0, language },
          (token) => setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: m.content + token } : m)),
          async (resData) => {
            try {
              const freshRes = await api.getMessages(activeSid);
              // Extract from the new .messages dictionary array key wrapper safely
              const freshMessages = freshRes.messages || freshRes || [];
              setMessages(freshMessages.map(m => ({ ...m, id: m.id })));
            } catch {
              setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, streaming: false } : m));
            }
            refreshSessions();
          },
          controller.signal
        );
      } catch (e) {
        if (e.name !== 'AbortError') {
          setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: e.message, streaming: false } : m));
        }
      } finally {
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
        setStreaming(false);
      }
    } else {
      setLoading(true);
      try {
        await api.sendMessage(
          { message: text, session_id: activeSid, model, use_documents: documents.length > 0, language },
          controller.signal
        );
        // Fetch fresh rows with verified primary keys for standard chat too
        const freshRes = await api.getMessages(activeSid);
        const freshMessages = freshRes.messages || freshRes || [];
        setMessages(freshMessages.map(m => ({ ...m, id: m.id })));
        refreshSessions();
      } catch (e) {
        if (e.name !== 'AbortError') {
          setMessages(prev => [...prev, { role: "assistant", content: e.message, id: Date.now() + 1 }]);
        }
      } finally {
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
        setLoading(false);
      }
    }
  }

  async function newChat() {
    const sid = uuidv4();
    try {
      await api.createSession({ title: "New Chat", model, language });
    } catch { }

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
      const [msgRes, docRes, freshSessions] = await Promise.all([
        api.getMessages(sid),
        api.getDocuments(sid),
        api.getSessions(),
      ]);
      const freshMessages = msgRes.messages || msgRes || [];
      setMessages(freshMessages.map(m => ({ ...m, id: m.id })));
      setDocuments(docRes.documents || []);

      // Use freshly fetched sessions to avoid stale closure bug
      const sess = (freshSessions || []).find(s => s.id === sid);
      if (sess) {
        setLanguage(sess.language || settings.default_language || "en");
        setSessions((freshSessions || []).map(s => ({ ...s, color: getSessionColor(s.id) })));
      }
    } catch { }
  }


  async function handleDeleteMessage(messageId) {
    setMessages(prev => prev.filter(m => m.id !== messageId));
    try {
      await api.deleteMessage(sessionId, messageId);
      refreshSessions();
    } catch { }
  }

  async function handleDeleteSession(sid) {
    await api.deleteSession(sid);
    if (sid === sessionId) { setSessionId(uuidv4()); setMessages([]); setDocuments([]); }
    refreshSessions();
  }

  async function handleClearAllSessions() {
    try {
      await api.clearAllSessions();
      setSessions([]);
      setSessionId(null);
      setMessages([]);
      setDocuments([]);
      setPanel(null);
    } catch { }
  }

  async function handleClearChat() {
    await api.clearMessages(sessionId);
    setMessages([]);
  }

  // ─── Routing Interceptor ───
  if (isSharedPath) {
    return <SharedView />;
  }
  const handleLanguageChange = useCallback(async (newLang) => {
    setLanguage(newLang);
    if (sessionId) {
      try {
        await api.updateSession(sessionId, { language: newLang });
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, language: newLang } : s));
      } catch (e) {
        console.error("Failed to update session language:", e);
      }
    }
  }, [sessionId]);

  const handleUpdateSessionColor = useCallback((sid, color) => {
    setSessionColor(sid, color);
    setSessions(prev => prev.map(s => s.id === sid ? { ...s, color } : s));
  }, []);

  return (
    <div className={`flex h-screen overflow-hidden ${settings.theme === "light" ? "bg-gray-100" : "bg-gray-950"} text-gray-100`}>
      <Sidebar
        sessions={sessions}
        currentSession={sessionId}
        onNewChat={newChat}
        onLoadSession={loadSession}
        onDeleteSession={handleDeleteSession}
        onClearAllSessions={handleClearAllSessions}
        model={model}
        models={models}
        onModelChange={setModel}
        language={language}
        onLanguageChange={handleLanguageChange}
        onUpdateSessionColor={handleUpdateSessionColor}
      />

      <div className="flex flex-col flex-1 overflow-hidden relative">
        <StatusBar
          ollamaOk={ollamaOk}
          model={model}
          docCount={documents.length}
          onUpload={() => setPanel(panel === "upload" ? null : "upload")}
          onPrompts={() => { setView("prompts"); setPanel(null); }}
          onPlugins={() => setPanel(panel === "plugins" ? null : "plugins")}
          onSettings={() => setPanel(panel === "settings" ? null : "settings")}
          onClear={handleClearChat}
          useStream={useStream}
          onToggleStream={() => setUseStream(p => !p)}
        />

        <UploadPanel
          show={panel === "upload"}
          sessionId={sessionId}
          documents={documents}
          onUploaded={() => refreshDocuments(sessionId)}
          onClose={() => setPanel(null)}
          minimalMode={minimalMode}
        />
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

        {view === "prompts" ? (
          <PromptRegistryPage onBack={() => setView("chat")} />
        ) : (
          <ChatWindow
            messages={messages}
            loading={loading || streaming}
            onSend={sendMessage}
            onDeleteMessage={handleDeleteMessage}
            onStop={stopGeneration}
            sessionId={sessionId}
            minimalMode={minimalMode}
          />
        )}
      </div>
    </div>
  );
}