import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import UploadPanel from "./components/UploadPanel";

const API = "http://localhost:8000/api";

export default function App() {
  const [sessionId, setSessionId] = useState(() => uuidv4());
  const [messages, setMessages] = useState([]);
  const [model, setModel] = useState("llama3");
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    fetchModels();
    fetchSessions();
  }, []);

  async function fetchModels() {
    try {
      const res = await fetch(`${API}/models/`);
      const data = await res.json();
      setModels(data.models || []);
    } catch {}
  }

  async function fetchSessions() {
    try {
      const res = await fetch(`${API}/chat/sessions`);
      const data = await res.json();
      setSessions(data);
    } catch {}
  }

  async function sendMessage(text) {
    if (!text.trim()) return;

    const userMsg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch(`${API}/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          session_id: sessionId,
          model,
          use_documents: documents.length > 0,
        }),
      });
      const data = await res.json();
      const aiMsg = {
        role: "assistant",
        content: data.reply,
        sources: data.sources || [],
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "❌ Error connecting to LocalMind backend. Is Ollama running?" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    setSessionId(uuidv4());
    setMessages([]);
    setDocuments([]);
  }

  async function loadSession(sid) {
    setSessionId(sid);
    setMessages([]);
    try {
      const res = await fetch(`${API}/chat/sessions/${sid}/history`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {}
  }

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 font-mono">
      <Sidebar
        sessions={sessions}
        currentSession={sessionId}
        onNewChat={newChat}
        onLoadSession={loadSession}
        model={model}
        models={models}
        onModelChange={setModel}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="flex items-center justify-between px-6 py-3 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <span className="text-purple-400 text-lg">🧠</span>
            <span className="font-semibold text-white">LocalMind</span>
            <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded">offline</span>
          </div>
          <div className="flex items-center gap-3">
            {documents.length > 0 && (
              <span className="text-xs text-purple-400">{documents.length} doc(s) loaded</span>
            )}
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="text-xs border border-gray-700 px-3 py-1.5 rounded hover:bg-gray-800 transition"
            >
              📄 Upload Doc
            </button>
          </div>
        </header>

        {showUpload && (
          <UploadPanel
            sessionId={sessionId}
            onUploaded={(filename) => {
              setDocuments((prev) => [...prev, filename]);
              setShowUpload(false);
            }}
          />
        )}

        <ChatWindow messages={messages} loading={loading} onSend={sendMessage} />
      </div>
    </div>
  );
}
