import { useState } from "react";
import { SettingsIcon } from "./Icons";

const MODELS    = ["llama3", "mistral", "phi3", "gemma2", "deepseek-r1"];
const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" },
  { code: "kn", label: "ಕನ್ನಡ" },
  { code: "fr", label: "Français" }
];

export default function SettingsPanel({ settings, onSave, onClose }) {
  const [form, setForm] = useState({
    default_model:    settings?.default_model    || "llama3",
    default_language: settings?.default_language || "en",
    temperature:      settings?.temperature      ?? 0.7,
    max_history_turns:settings?.max_history_turns|| 10,
    rag_top_k:        settings?.rag_top_k        || 4,
    theme:            settings?.theme            || "dark",
  });

  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  function set(key, val) { 
    setForm(p => ({ ...p, [key]: val })); 
    // Clear inline error layout instantly as user corrects the field input values
    if (errors[key]) {
      setErrors(p => ({ ...p, [key]: "" }));
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setErrors({}); // Wipe out previous error trackers
  
    try {
      // Execute parent submission logic handler asynchronously
      await onSave(form);
    } catch (err) {
      // Safely intercept standard FastAPI validation structure arrays
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

  return (
    <div data-testid="settings-panel" className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
          <SettingsIcon className="w-4 h-4" />Settings
        </p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
      </div>

      {errors.global && (
        <div className="mb-4 text-xs bg-red-950/50 border border-red-900/60 text-red-400 p-2 rounded-lg">
          {errors.global}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
        <Field label="Default Model" error={errors.default_model}>
          <select value={form.default_model} onChange={e => set("default_model", e.target.value)} className={`sel ${errors.default_model ? "border-red-500" : ""}`}>
            {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>

        <Field label="Default Language" error={errors.default_language}>
          <select value={form.default_language} onChange={e => set("default_language", e.target.value)} className={`sel ${errors.default_language ? "border-red-500" : ""}`}>
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

        <Field label={`History Turns: ${form.max_history_turns}`} error={errors.max_history_turns}>
          <input type="range" min="2" max="20" step="2" value={form.max_history_turns}
            onChange={e => set("max_history_turns", parseInt(e.target.value))}
            className="w-full accent-purple-500" />
        </Field>

        <Field label="Theme" error={errors.theme}>
          <select value={form.theme} onChange={e => set("theme", e.target.value)} className={`sel ${errors.theme ? "border-red-500" : ""}`}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </Field>
      </div>

      <div className="flex gap-2 mt-4">
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="text-xs bg-purple-700 hover:bg-purple-600 disabled:bg-gray-800 text-white px-4 py-1.5 rounded-lg transition font-medium">
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
        <button onClick={onClose}
          className="text-xs border border-gray-700 text-gray-400 hover:bg-gray-800 px-4 py-1.5 rounded-lg transition">
          Cancel
        </button>
      </div>

      <style>{`.sel { width:100%; background:#1f2937; color:#e5e7eb; border:1px solid #374151; border-radius:8px; padding:4px 8px; outline:none; font-size:11px; transition: border-color 0.15s ease; }`}</style>
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