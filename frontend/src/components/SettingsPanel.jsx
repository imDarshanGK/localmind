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

  function set(key, val) { setForm(p => ({...p, [key]: val})); }

  return (
    <div className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5"><SettingsIcon className="w-4 h-4" />Settings</p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
      </div>

      {/* FIXED (#582): Added explicit informative tooltip props to fields */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
        <Field label="Default Model" tooltip="The default LLM model used for reasoning when starting new chat sessions.">
          <select value={form.default_model} onChange={e=>set("default_model",e.target.value)} className="sel">
            {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        
        <Field label="Default Language" tooltip="Sets the language interface and system localization instructions.">
          <select value={form.default_language} onChange={e=>set("default_language",e.target.value)} className="sel">
            {LANGUAGES.map(l=><option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </Field>
        
        <Field label={`Temperature: ${form.temperature}`} tooltip="Controls creativity: higher values are more imaginative, lower values are precise.">
          <input type="range" min="0" max="2" step="0.1" value={form.temperature}
            onChange={e=>set("temperature",parseFloat(e.target.value))}
            className="w-full accent-purple-500" />
        </Field>
        
        <Field label={`RAG Context Chunks: ${form.rag_top_k}`} tooltip="The maximum number of reference context document fragments pulled from uploaded files.">
          <input type="range" min="1" max="10" step="1" value={form.rag_top_k}
            onChange={e=>set("rag_top_k",parseInt(e.target.value))}
            className="w-full accent-purple-500" />
        </Field>
        
        <Field label={`History Turns: ${form.max_history_turns}`} tooltip="The number of past conversation exchanges included with new queries for memory retention.">
          <input type="range" min="2" max="20" step="2" value={form.max_history_turns}
            onChange={e=>set("max_history_turns",parseInt(e.target.value))}
            className="w-full accent-purple-500" />
        </Field>
        
        <Field label="Theme" tooltip="Switches core user interface color profiles across the application layout.">
          <select value={form.theme} onChange={e=>set("theme",e.target.value)} className="sel">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </Field>
      </div>

      <div className="flex gap-2 mt-4">
        <button onClick={()=>onSave(form)}
          className="text-xs bg-purple-700 hover:bg-purple-600 text-white px-4 py-1.5 rounded-lg transition font-medium">
          Save Settings
        </button>
        <button onClick={onClose}
          className="text-xs border border-gray-700 text-gray-400 hover:bg-gray-800 px-4 py-1.5 rounded-lg transition">
          Cancel
        </button>
      </div>

      <style>{`
        .sel { width:100%; background:#1f2937; color:#e5e7eb; border:1px solid #374151; border-radius:8px; padding:4px 8px; outline:none; font-size:11px; }
        /* FIXED (#582): Tooltip trigger layout and hover box styles */
        .tt-trigger { position: relative; display: inline-flex; align-items: center; cursor: help; }
        .tt-box { visibility: hidden; width: 180px; background-color: #030712; color: #d1d5db; text-align: left; border: 1px solid #374151; border-radius: 6px; padding: 6px 8px; position: absolute; z-index: 50; bottom: 125%; left: 0; opacity: 0; transition: opacity 0.15s ease, transform 0.15s ease; transform: translateY(4px); pointer-events: none; font-size: 10px; line-height: 1.4; font-weight: normal; }
        .tt-trigger:hover .tt-box { visibility: visible; opacity: 1; transform: translateY(0); }
      `}</style>
    </div>
  );
}

// FIXED (#582): Integrated tooltips logic directly into Field helper mapping
function Field({ label, tooltip, children }) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <label className="text-gray-500 block">{label}</label>
        {tooltip && (
          <span className="tt-trigger text-[10px] bg-gray-800 text-gray-400 rounded-full w-3.5 h-3.5 inline-flex items-center justify-center font-serif hover:bg-gray-700 transition" aria-label="Help info">
            i
            <span className="tt-box">{tooltip}</span>
          </span>
        )}
      </div>
      {children}
    </div>
  );
}