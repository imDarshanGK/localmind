const BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export const sendMessage = (b) => req("/chat/", { method: "POST", body: JSON.stringify(b) });
export const getSessions = () => req("/sessions/");
export const createSession = (b) => req("/sessions/", { method: "POST", body: JSON.stringify(b) });
export const updateSession = (id, b) => req(`/sessions/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteSession = (id) => req(`/sessions/${id}`, { method: "DELETE" });
export const clearAllSessions = () => req("/sessions/", { method: "DELETE" });
export const getMessages = (id) => req(`/sessions/${id}/messages`);
export const clearMessages = (id) => req(`/sessions/${id}/messages`, { method: "DELETE" });
export const getDocuments = (id) => req(`/sessions/${id}/documents`);
export const getModels = () => req("/models/");
export const getOllamaStatus = () => req("/models/status");
export const getPlugins = () => req("/plugins/");
export const runPlugin = (b) => req("/plugins/run", { method: "POST", body: JSON.stringify(b) });
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
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.detail||"Upload failed"); }
  return res.json();
}

export function streamMessage(body, onToken, onDone) {
  let accumulatedText = "";
  let sourcesList = [];
  let doneReceived = false;
  let retriesLeft = 3;

  function runStream(offset = 0) {
    const requestBody = { ...body, resume_offset: offset };
    
    return fetch(`${BASE}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    })
    .then(res => {
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      
      function pump() {
        return reader.read().then(({ done, value }) => {
          if (done) {
            if (doneReceived) {
              return;
            }
            throw new Error("Stream closed prematurely");
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
      }
      return pump();
    })
    .catch(err => {
      if (doneReceived) {
        return;
      }
      if (retriesLeft > 0) {
        retriesLeft--;
        // Wait 1 second before retrying
        return new Promise(resolve => setTimeout(resolve, 1000))
          .then(() => runStream(accumulatedText.length));
      }
      throw err;
    });
  }

  return runStream(0);
}
