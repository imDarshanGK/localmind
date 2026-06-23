const BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

// NEW: Handed 'signal' into options unpacking to attach it straight onto fetch
async function req(path, opts = {}) {
  const { signal, ...restOpts } = opts; // Separate signal from rest of parameters
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    signal, // <--- Attaches the AbortController listener to normal HTTP requests
    ...restOpts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

// NEW: sendMessage can now accept an optional trailing signal parameter
export const sendMessage = (b, signal) => req("/chat/", { method: "POST", body: JSON.stringify(b), signal });
export const cancelStream = (id) => req(`/chat/cancel/${id}`, { method: "POST" });
export const getSessions = () => req("/sessions/");
export const createSession = (b) => req("/sessions/", { method: "POST", body: JSON.stringify(b) });
export const updateSession = (id, b) => req(`/sessions/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteSession = (id) => req(`/sessions/${id}`, { method: "DELETE" });
export const clearAllSessions = () => req("/sessions/", { method: "DELETE" });
export const getMessages = (id) => req(`/sessions/${id}/messages`);
export const clearMessages = (id) => req(`/sessions/${id}/messages`, { method: "DELETE" });
export const deleteMessage = (id, messageId) => req(`/sessions/${id}/messages/${messageId}`, { method: "DELETE" });
export const getDocuments = (id) => req(`/sessions/${id}/documents`);
export const getModels = () => req("/models/");
export const getModelInfo = (modelName) => req(`/models/${modelName}/info`);
export const getOllamaStatus = () => req("/models/status");
export const getPlugins = () => req("/plugins/");
export const runPlugin = (b) => req("/plugins/run", { method: "POST", body: JSON.stringify(b) });
export const getPluginLogs = (limit = 50) => req(`/plugins/logs?limit=${limit}`);
export const getSettings = () => req("/settings/");
export const saveSettings = (b) => req("/settings/", { method: "PUT", body: JSON.stringify(b) });
export const exportSession = (id, fmt) => window.open(`${BASE}/export/${id}/${fmt}`, "_blank");
export const deleteDocument = (docId) => req(`/upload/${docId}`, { method: "DELETE" });

// Prompt Templates
export const getPromptTemplates      = ()     => req("/prompt-templates/");
export const createPromptTemplate    = (b)    => req("/prompt-templates/", { method: "POST", body: JSON.stringify(b) });
export const updatePromptTemplate    = (id,b) => req(`/prompt-templates/${id}`, { method: "PUT", body: JSON.stringify(b) });
export const deletePromptTemplate    = (id)   => req(`/prompt-templates/${id}`, { method: "DELETE" });

export async function uploadDocument(file, session_id) {
  const fd = new FormData();
  fd.append("file", file); fd.append("session_id", session_id);
  const res = await fetch(`${BASE}/upload/`, { method: "POST", body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Upload failed"); }
  return res.json();
}
// Message Reactions API Toggle
export const toggleMessageReaction = (messageId, emoji) => 
  req("/chat/messages/toggle-reaction", { 
    method: "POST", 
    body: JSON.stringify({ message_id: messageId, emoji }) 
  });

// NEW: Appended 'signal' parameter right to the tail of your token reader stream
export function streamMessage(body, onToken, onDone, signal) {
  return fetch(`${BASE}/chat/stream`, {
    method: "POST", 
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal // <--- Attaches the cancel token listener directly to your chunk stream reader
  }).then(res => {
    const reader = res.body.getReader(); const decoder = new TextDecoder();
    function pump() {
      return reader.read().then(({ done, value }) => {
        if (done) return;
        decoder.decode(value).split("\n").forEach(line => {
          if (line.startsWith("data: ")) {
            try { const d = JSON.parse(line.slice(6)); if (d.token) onToken(d.token); if (d.done) onDone(d.sources || [], d.benchmarks || null); } catch { }
          }
          
          const text = decoder.decode(value, { stream: true });
          text.split("\n").forEach(line => {
            if (line.startsWith("data: ")) {
              try {
                const d = JSON.parse(line.slice(6));
                if (d.token) {
                  accumulatedText += d.token;
                  onToken(d.token);
                }
                if (d.done) {
                  doneReceived = true;
                  sourcesList = d.sources || [];
                  onDone({
                    message_id: d.message_id,
                    sources: sourcesList,
                    benchmarks: d.benchmarks || null
                  });
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          });
          return pump();
        });
        return pump();
      });
    }
    return pump();
  });
}