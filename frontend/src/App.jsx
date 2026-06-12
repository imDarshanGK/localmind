import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import UploadPanel from "./components/UploadPanel";
import PluginsPanel from "./components/PluginsPanel";
import SettingsPanel from "./components/SettingsPanel";
import PromptRegistryPage from "./components/PromptRegistryPage";
import StatusBar from "./components/StatusBar";
import * as api from "./utils/api";

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
  const [view,        setView]       = useState("chat"); // "chat"|"prompts"
  const [language,   setLanguage]   = useState("en");
  const [ollamaOk,   setOllamaOk]   = useState(null);
  const [settings,   setSettings]   = useState({});
  const [useStream,  setUseStream]  = useState(true);

  useEffect(() => { bootstrap(); }, []);

  // ── Global keyboard shortcut: Ctrl+Shift+N (or Cmd+Shift+N on Mac) → New Chat ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      console.log("Key pressed:", e.key, "Ctrl:", e.ctrlKey, "Shift:", e.shiftKey); // ADD THIS
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "N") {
        e.preventDefault();
        newChat();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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
    } catch { }
  }

  const refreshSessions = useCallback(async () => {
    try { const s = await api.getSessions(); setSessions(s || []); } catch { }
  }, []);

  const refreshDocuments = useCallback(async (sid) => {
    try { const d = await api.getDocuments(sid); setDocuments(d.documents || []); } catch { }
  }, []);

  async function sendMessage(text) {
    if (!text.trim() || loading || streaming) return;
    let activeSid = sessionId;
    if (!activeSid) {
      activeSid = uuidv4();
      setSessionId(activeSid);
    }
    const userMsg = { role: "user", content: text, id: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    if (useStream) {
      setStreaming(true);
      const aiMsg = { role: "assistant", content: "", sources: [], id: Date.now() + 1, streaming: true };
      setMessages(prev => [...prev, aiMsg]);
      try {
        await api.streamMessage(
          { message: text, session_id: activeSid, model, use_documents: documents.length > 0, language },
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
        const data = await api.sendMessage({ message: text, session_id: activeSid, model, use_documents: documents.length > 0, language });
        setMessages(prev => [...prev, { role: "assistant", content: data.reply, sources: data.sources || [], id: Date.now() + 1 }]);
        refreshSessions();
      } catch (e) {
        setMessages(prev => [...prev, { role: "assistant", content: e.message, id: Date.now() + 1 }]);
      } finally { setLoading(false); }
    }
  }

  async function newChat() {
      const sid = uuidv4();
      try {
        await api.createSession({ title: "New Chat", model });
      } catch {}
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
        onLanguageChange={setLanguage}
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

        {view === "prompts" ? (
          <PromptRegistryPage onBack={() => setView("chat")} />
        ) : (
          <ChatWindow
            messages={messages}
            loading={loading || streaming}
            onSend={sendMessage}
            sessionId={sessionId}
          />
        )}
      </div>
    </div>
  );
}
