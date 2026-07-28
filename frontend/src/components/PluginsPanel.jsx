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

// Helper badge renderer for compatibility tags
function CompatibilityBadge({ compatibility }) {
  if (!compatibility) return null;

  // Normalize array vs object/string format
  const badges = Array.isArray(compatibility) 
    ? compatibility 
    : typeof compatibility === "object"
    ? Object.values(compatibility)
    : [compatibility];

  return (
    <div className="inline-flex items-center gap-1 flex-wrap">
      {badges.map((badge, idx) => {
        const isLocal = String(badge).toLowerCase().includes("local") || String(badge).toLowerCase().includes("v1");
        const badgeStyle = isLocal
          ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/60"
          : "bg-blue-950/60 text-blue-400 border-blue-800/60";

        return (
          <span
            key={idx}
            data-testid="compatibility-badge"
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${badgeStyle}`}
          >
            {badge}
          </span>
        );
      })}
    </div>
  );
}

export default function PluginsPanel({ sessionId, onClose }) {
  const [plugins, setPlugins] = useState([]);
  const [selected, setSelected] = useState(null);

  // Persistent input state initialized from localStorage
  const [input, setInput] = useState(() => {
    if (!sessionId) return "";
    return localStorage.getItem(`localmind_plugin_draft_${sessionId}`) || "";
  });

  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getPlugins().then(d => setPlugins(d.plugins || [])).catch(() => {});
  }, []);

  // Re-sync input draft whenever sessionId changes
  useEffect(() => {
    if (!sessionId) return;
    setInput(localStorage.getItem(`localmind_plugin_draft_${sessionId}`) || "");
  }, [sessionId]);

  // Persist plugin draft input to localStorage on edit
  useEffect(() => {
    if (!sessionId) return;
    if (input) {
      localStorage.setItem(`localmind_plugin_draft_${sessionId}`, input);
    } else {
      localStorage.removeItem(`localmind_plugin_draft_${sessionId}`);
    }
  }, [input, sessionId]);

  async function run() {
    if (!selected || !input.trim()) return;
    setRunning(true); setOutput(""); setError("");
    try {
      const r = await runPlugin({ plugin: selected.id, input, session_id: sessionId });
      if (r.success) {
        setOutput(r.output);
        if (sessionId) {
          localStorage.removeItem(`localmind_plugin_draft_${sessionId}`);
        }
      } else {
        setError(r.error || "Plugin failed");
      }
    } catch (e) { setError(e.message); }
    finally { setRunning(false); }
  }

  return (
    <div className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0" data-testid="plugins-panel">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5"><PlugIcon className="w-4 h-4" />Plugins Catalog</p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
      </div>

      {/* Plugin selector with compatibility badges */}
      <div className="flex flex-wrap gap-2 mb-3">
        {plugins.map(p => (
          <button key={p.id} onClick={() => { setSelected(p); setOutput(""); setError(""); }}
            className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium flex items-center gap-2
              ${selected?.id === p.id ? "border-purple-500 bg-purple-900/30 text-purple-300" : "border-gray-700 text-gray-400 hover:bg-gray-800"}`}>
            {(() => {
              const Icon = PLUGIN_ICONS[p.icon] || PlugIcon;
              return (
                <span className="inline-flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  <span>{p.name}</span>
                </span>
              );
            })()}
            {p.compatibility && <CompatibilityBadge compatibility={p.compatibility} />}
          </button>
        ))}
      </div>

      {selected && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-500">{selected.description}</p>
            {selected.compatibility && (
              <div className="shrink-0 flex items-center gap-1 text-[11px] text-gray-400">
                <span className="text-gray-500">Compatibility:</span>
                <CompatibilityBadge compatibility={selected.compatibility} />
              </div>
            )}
          </div>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            placeholder={`Enter input for ${selected.name}...`} rows={3}
            className="w-full text-xs bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-gray-200 placeholder-gray-600 outline-none focus:border-purple-500 resize-none" />
          <button onClick={run} disabled={!input.trim() || running}
            className="text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg transition font-medium">
            {running ? "Running..." : `Run ${selected.name}`}
          </button>
          {output && (
            <pre className="text-xs bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-green-300 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">
              {output}
            </pre>
          )}
          {error && <p className="text-xs text-red-400 inline-flex items-center gap-1"><ErrorIcon className="w-3.5 h-3.5" />{error}</p>}
        </div>
      )}
    </div>
  );
}