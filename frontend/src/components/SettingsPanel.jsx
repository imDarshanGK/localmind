import { useState } from "react";
import { SettingsIcon } from "./Icons";

const MODELS    = ["llama3","mistral","phi3","gemma2","deepseek-r1"];
const LANGUAGES = [{code:"en",label:"English"},{code:"hi",label:"हिन्दी"},{code:"ta",label:"தமிழ்"},{code:"te",label:"తెలుగు"},{code:"kn",label:"ಕನ್ನಡ"},{code:"fr",label:"Français"}];

export default function SettingsPanel({ settings, onSave, onClose }) {
  const [form, setForm] = useState({
    default_model:    settings.default_model    || "llama3",
    default_language: settings.default_language || "en",
    temperature:      settings.temperature      ?? 0.7,
    max_history_turns:settings.max_history_turns|| 10,
    rag_top_k:        settings.rag_top_k        || 4,
    theme:            settings.theme            || "dark",
  });

  // FIXED (#583): State to manage copy animation/feedback visibility
  const [copied, setCopied] = useState(false);

  function set(key, val) { setForm(p => ({...p, [key]: val})); }

  // FIXED (#583): Core clipboard injection logic with state clear trigger
  const handleCopySummary = () => {
    const summaryText = `LocalMind Configuration Summary:\n- Model: ${form.default_model}\n- Language: ${form.default_language}\n- Temperature: ${form.temperature}\n- RAG Chunks: ${form.rag_top_k}\n- Max Turns: ${form.max_history_turns}\n- Theme: ${form.theme}`;
    
    navigator.clipboard.writeText(summaryText)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000); // Resets state back after 2 seconds
      })
      .catch((err) => {
        console.error("Failed to copy settings summary: ", err);
      });
  };

  return (
    <div className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5"><SettingsIcon className="w-4 h-4" />Settings</p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
        <Field label="Default Model">
          <select value={form.default_model} onChange={e=>set("default_model",e.target.value)} className="sel">
            {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Default Language">
          <select value={form.default_language} onChange={e=>set("default_language",e.target.value)} className="sel">
            {LANGUAGES.map(l=><option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </Field>
        <Field label={`Temperature: ${form.temperature}`}>
          <input type="range" min="0" max="2" step="0.1" value={form.temperature}
            onChange={e=>set("temperature",parseFloat(e.target.value))}
            className="w-full accent-purple-500" />
        </Field>
        <Field label={`RAG Context Chunks: ${form.rag_top_k}`}>
          <input type="range" min="1" max="10" step="1" value={form.rag_top_k}
            onChange={e=>set("rag_top_k",parseInt(e.target.value))}
            className="w-full accent-purple-500" />
        </Field>
        <Field label={`History Turns: ${form.max_history_turns}`}>
          <input type="range" min="2" max="20" step="2" value={form.max_history_turns}
            onChange={e=>set("max_history_turns",parseInt(e.target.value))}
            className="w-full accent-purple-500" />
        </Field>
        <Field label="Theme">
          <select value={form.theme} onChange={e=>set("theme",e.target.value)} className="sel">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </Field>
      </div>

      <div className="flex gap-2 mt-4 justify-between items-center">
        <div className="flex gap-2">
          <button onClick={()=>onSave(form)}
            className="text-xs bg-purple-700 hover:bg-purple-600 text-white px-4 py-1.5 rounded-lg transition font-medium shadow-md">
            Save Settings
          </button>
          <button onClick={onClose}
            className="text-xs border border-gray-700 text-gray-400 hover:bg-gray-800 px-4 py-1.5 rounded-lg transition">
            Cancel
          </button>
        </div>

        {/* FIXED (#583): Dynamic feedback controller rendering state transitions */}
        <button 
          onClick={handleCopySummary}
          className={`text-[11px] px-3 py-1.5 rounded-lg transition font-medium border flex items-center gap-1.5 duration-200
            ${copied 
              ? "bg-green-950/40 border-green-900/60 text-green-400" 
              : "border-gray-700 text-gray-400 hover:bg-gray-800"}`}
        >
          {copied ? (
            <>
              <span>✓</span>
              <span>Copied!</span>
            </>
          ) : (
            <span>Copy Config Summary</span>
          )}
        </button>
      </div>

      <style>{`.sel { width:100%; background:#1f2937; color:#e5e7eb; border:1px solid #374151; border-radius:8px; padding:4px 8px; outline:none; font-size:11px; }`}</style>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-gray-500 block mb-1">{label}</label>
      {children}
    </div>
  );
}