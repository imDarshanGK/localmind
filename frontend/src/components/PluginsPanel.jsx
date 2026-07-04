import { useState, useEffect } from "react";
import { getPlugins, runPlugin } from "../utils/api";
import { BracesIcon, CalculatorIcon, CodeIcon, ErrorIcon, GlobeIcon, PlugIcon, SummaryIcon, HashIcon } from "./Icons";

const PLUGIN_ICONS = {
  calculator: CalculatorIcon,
  summarizer: SummaryIcon,
  translator: GlobeIcon,
  coderunner: CodeIcon,
  wordcount: HashIcon,
  jsonformat: BracesIcon,
};

export default function PluginsPanel({ sessionId, onClose }) {
  const [plugins,  setPlugins]  = useState([]);
  const [selected, setSelected] = useState(null);
  const [input,    setInput]    = useState("");
  const [output,   setOutput]   = useState("");
  const [running,  setRunning]  = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => {
    setError("");
    getPlugins()
      .then(d => setPlugins(d.plugins || []))
      .catch((err) => {
        // --- FIXED (#588): Capture initialization and load errors safely ---
        setError(err.message || "Failed to fetch plugins from server.");
      });
  }, []);

  async function run() {
    if (!selected || !input.trim()) return;
    setRunning(true); setOutput(""); setError("");
    try {
      const r = await runPlugin({ plugin: selected.id, input, session_id: sessionId });
      if (r.success) setOutput(r.output);
      else setError(r.error || "Plugin failed to execute.");
    } catch(e) { setError(e.message); }
    finally { setRunning(false); }
  }

  return (
    <div className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
          <PlugIcon className="w-4 h-4" />Plugins
        </p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
      </div>

      {/* --- FIXED (#588): Top-Level Prominent Global Inline Error Banner --- */}
      {error && (
        <div className="mb-3 text-xs bg-red-950/40 border border-red-900/50 text-red-400 p-2.5 rounded-xl flex items-start gap-2 shadow-sm transition-all duration-200">
          <ErrorIcon className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
          <div className="flex-1">
            <span className="font-semibold block mb-0.5">Plugin Error</span>
            <p className="text-red-300/90 leading-relaxed">{error}</p>
          </div>
          <button 
            onClick={() => setError("")} 
            className="text-red-500 hover:text-red-300 transition font-bold text-sm leading-none px-1"
            title="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* Plugin selector */}
      <div className="flex flex-wrap gap-2 mb-3">
        {plugins.map(p => (
          <button key={p.id} onClick={() => { setSelected(p); setOutput(""); setError(""); }}
            className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium
              ${selected?.id === p.id ? "border-purple-500 bg-purple-900/30 text-purple-300" : "border-gray-700 text-gray-400 hover:bg-gray-800"}`}>
            {(() => {
              const Icon = PLUGIN_ICONS[p.icon] || PlugIcon;
              return (
                <span className="inline-flex items-center gap-1">
                  <Icon className="w-3.5 h-3.5" />
                  <span>{p.name}</span>
                </span>
              );
            })()}
          </button>
        ))}
      </div>

      {selected && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">{selected.description}</p>
          <textarea value={input} onChange={e=>setInput(e.target.value)}
            placeholder={`Enter input for ${selected.name}...`} rows={3}
            className="w-full text-xs bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-gray-200 placeholder-gray-600 outline-none focus:border-purple-500 resize-none" />
          <button onClick={run} disabled={!input.trim() || running}
            className="text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg transition font-medium">
            {running ? "Running..." : `Run ${selected.name}`}
          </button>
          {output && (
            <pre className="text-xs bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-green-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
              {output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}