import { useState, useEffect } from "react";
import { SettingsIcon } from "./Icons";

const MODELS    = ["llama3", "mistral", "phi3", "gemma2", "deepseek-r1"];
const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" },
  { code: "kn", label: "ಕನ್ನಡ" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "ja", label: "日本語" },
];

export default function SettingsPanel({ settings, onSave, onClose }) {
  const [form, setForm] = useState({
    default_model:    settings?.default_model    || "llama3",
    default_language: settings?.default_language || "en",
    temperature:      settings?.temperature      ?? 0.7,
    max_history_turns:settings?.max_history_turns|| 10,
    rag_top_k:        settings?.rag_top_k        || 4,
    rag_chunk_overlap: settings?.rag_chunk_overlap ?? 50,
    theme:            settings?.theme            || "dark",
    minimal_mode:      settings?.minimal_mode ?? false,
  });

 
  // SOLVES (#581): Persistent Collapse State Hooks
  
  const [isExpanded, setIsExpanded] = useState(() => {
    const savedState = localStorage.getItem("localmind_settings_expanded");
    return savedState !== null ? JSON.parse(savedState) : true;
  });

  useEffect(() => {
    localStorage.setItem("localmind_settings_expanded", JSON.stringify(isExpanded));
  }, [isExpanded]);
 

  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const [drafts, setDrafts] = useState(() => {
    try {
      const saved = localStorage.getItem("localmind_settings_drafts");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [newDraft, setNewDraft] = useState("");

  useEffect(() => {
    localStorage.setItem("localmind_settings_drafts", JSON.stringify(drafts));
  }, [drafts]);

  function set(key, val) { 
    setForm(p => ({ ...p, [key]: val })); 
    if (errors[key]) {
      setErrors(p => ({ ...p, [key]: "" }));
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setErrors({});
    try {
      await onSave(form);
    } catch (err) {
      if (err.response && err.response.status === 422 && err.response.data?.detail) {
        const pydanticErrors = err.response.data.detail;
        const inlineErrors = {};
        pydanticErrors.forEach(error => {
          if (error.loc && error.loc.length > 0) {
            const fieldName = error.loc[error.loc.length - 1];
            inlineErrors[fieldName] = error.msg;
          }
        });
        setErrors(inlineErrors);
      } else {
        setErrors({ global: err.message || "Failed to update configuration settings." });
      }
    } finally {
      setIsSaving(false);
    }
  }

  const handleAddDraft = () => {
    if (!newDraft.trim()) return;
    setDrafts(p => [...p, { id: crypto.randomUUID(), text: newDraft.trim() }]);
    setNewDraft("");
  };

  const handleDeleteDraft = (id) => {
    setDrafts(p => p.filter(d => d.id !== id));
  };

  const handleCopySummary = () => {
    const summaryText = `LocalMind Configuration Summary:\n- Model: ${form.default_model}\n- Language: ${form.default_language}\n- Temperature: ${form.temperature}\n- RAG Chunks: ${form.rag_top_k}\n- Max Turns: ${form.max_history_turns}\n- Theme: ${form.theme}`;
    navigator.clipboard.writeText(summaryText)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy settings summary: ", err);
      });
  };

  return (
    <div data-testid="settings-panel" className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0 transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
            <SettingsIcon className="w-4 h-4" />Settings
          </p>
          
          {/* SOLVES (#581): Persistent Collapse Button Controller */}
          <button 
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 px-2 py-0.5 rounded transition font-medium"
          >
            {isExpanded ? "Collapse ▵" : "Expand ▿"}
          </button>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
      </div>

      {errors.global && (
        <div className="mb-4 text-xs bg-red-950/50 border border-red-900/60 text-red-400 p-2 rounded-lg">
          {errors.global}
        </div>
      )}

      {/* SOLVES (#581): Controlled expanded layout rendering window wrapper */}
      {isExpanded && (
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
            <Field label="Default Model" error={errors.default_model}>
              <select value={form.default_model} onChange={e => set("default_model", e.target.value)} aria-label="Default model" className={`sel focus:ring-2 focus:ring-purple-500/20 ${errors.default_model ? "border-red-500" : ""}`}>
                {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>

            <Field label="Default Language" error={errors.default_language}>
              <select value={form.default_language} onChange={e => set("default_language", e.target.value)} aria-label="Default language" className={`sel focus:ring-2 focus:ring-purple-500/20 ${errors.default_language ? "border-red-500" : ""}`}>
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </Field>

            <Field label={`Temperature: ${form.temperature}`} error={errors.temperature}>
              <input type="range" min="0" max="2" step="0.1" value={form.temperature}
                onChange={e => set("temperature", parseFloat(e.target.value))}
                className="w-full accent-purple-500" />
            </Field>

            <Field label={`RAG Context Chunks: ${form.rag_top_k}`} error={errors.rag_top_k}>
              <input type="range" min="1" max="10" step="1" value={form.rag_top_k}
                onChange={e => set("rag_top_k", parseInt(e.target.value))}
                className="w-full accent-purple-500" />
            </Field>

            <Field label={`RAG Chunk Overlap: ${form.rag_chunk_overlap}`} error={errors.rag_chunk_overlap}>
              <input type="range" min="0" max="200" step="10" value={form.rag_chunk_overlap}
                onChange={e => set("rag_chunk_overlap", parseInt(e.target.value))}
                className="w-full accent-purple-500" />
            </Field>

            <Field label={`History Turns: ${form.max_history_turns}`} error={errors.max_history_turns}>
              <input type="range" min="2" max="20" step="2" value={form.max_history_turns}
                onChange={e => set("max_history_turns", parseInt(e.target.value))}
                className="w-full accent-purple-500" />
            </Field>

            <Field label="Theme" error={errors.theme}>
              <select value={form.theme} onChange={e => set("theme", e.target.value)} className={`sel ${errors.theme ? "border-red-500" : ""}`}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="high-contrast">High Contrast</option>
                <option value="sepia">Sepia (Warm)</option>
                <option value="comfort">Comfort (Large Text)</option>
              </select>
            </Field>

            <Field label="Minimal Mode">
              <label className="flex items-center gap-2 text-gray-300 mt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.minimal_mode}
                  onChange={e => set("minimal_mode", e.target.checked)}
                  className="accent-purple-500"
                />
                Low-bandwidth mode
              </label>
            </Field>
          </div>

          <div className="mt-5 pt-4 border-t border-gray-800 text-xs">
            <label className="text-gray-400 font-medium block mb-2">Saved Prompt Drafts / Notes</label>
            <div className="flex gap-2 mb-3">
              <input 
                type="text" 
                value={newDraft} 
                onChange={e => setNewDraft(e.target.value)}
                placeholder="Type a canned prompt snippet or scratchpad note..."
                className="flex-1 bg-gray-800 text-gray-200 border border-gray-700 rounded-lg px-3 py-1 text-xs outline-none focus:border-purple-500 placeholder-gray-600"
                onKeyDown={e => e.key === "Enter" && handleAddDraft()}
              />
              <button 
                type="button"
                onClick={handleAddDraft}
                className="bg-purple-700/40 hover:bg-purple-700 border border-purple-500/30 hover:border-purple-500 text-purple-300 hover:text-white px-3 py-1 rounded-lg font-medium transition text-xs shrink-0"
              >
                Add
              </button>
            </div>

            {drafts.length === 0 ? (
              <p className="text-[11px] text-gray-600 italic">No message drafts stored yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1 custom-scrollbar">
                {drafts.map(d => (
                  <div key={d.id} className="flex justify-between items-start gap-3 bg-gray-800/40 border border-gray-800/80 p-2 rounded-lg group hover:border-gray-700/60 transition">
                    <p className="text-[11px] text-gray-300 break-words flex-1 font-mono">{d.text}</p>
                    <button 
                      type="button"
                      onClick={() => handleDeleteDraft(d.id)}
                      className="text-gray-500 hover:text-red-400 transition font-bold px-1 text-sm leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-5 pt-3 border-t border-gray-800 justify-between items-center">
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="text-xs bg-purple-700 hover:bg-purple-600 disabled:bg-gray-800 text-white px-4 py-1.5 rounded-lg transition font-medium shadow-md"
              >
                {isSaving ? "Saving..." : "Save Settings"}
              </button>
              <button 
                type="button"
                onClick={onClose}
                className="text-xs border border-gray-700 text-gray-400 hover:bg-gray-800 px-4 py-1.5 rounded-lg transition"
              >
                Cancel
              </button>
            </div>

            <button 
              type="button"
              onClick={handleCopySummary}
              className={`text-[11px] px-3 py-1.5 rounded-lg transition font-medium border flex items-center gap-1.5 duration-200
                ${copied 
                  ? "bg-green-950/40 border-green-900/60 text-green-400" 
                  : "border-gray-700 text-gray-400 hover:bg-gray-800"}`}
            >
              {copied ? <><span>✓</span><span>Copied!</span></> : <span>Copy Config Summary</span>}
            </button>
          </div>
        </>
      )}

      <style>{`
        .sel { width:100%; background:#1f2937; color:#e5e7eb; border:1px solid #374151; border-radius:8px; padding:4px 8px; outline:none; font-size:11px; transition: border-color 0.15s ease; }
      `}</style>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div className="flex flex-col justify-between">
      <div>
        <label className="text-gray-500 block mb-1">{label}</label>
        {children}
      </div>
      {error && (
        <p className="mt-1 text-[10px] text-red-400 font-medium leading-tight">
          {error}
        </p>
      )}
    </div>
  );
}