import { useState, useEffect } from "react";
import { getPlugins, runPlugin, getPluginLogs } from "../utils/api";
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
  const [logs,     setLogs]     = useState([]);
  // --- FIXED (#586): Keep loading state variable from main ---
  const [loading,  setLoading]  = useState(true);

  const fetchLogs = async () => {
    try {
      const data = await getPluginLogs(50);
      setLogs(data.logs || []);
    } catch (err) {
      console.error("Failed to fetch plugin logs", err);
    }
  };

  useEffect(() => {
    // --- FIXED (#586): Use main's loading state lifecycle wrapper ---
    setLoading(true);
    getPlugins()
      .then(d => setPlugins(d.plugins || []))
      .catch(()=>{})
      .finally(() => setLoading(false));
    fetchLogs();
  }, []);

  async function run() {
    if (!selected || !input.trim() || running) return;
    setRunning(true); setOutput(""); setError("");
    try {
      const r = await runPlugin({ plugin: selected.id, input, session_id: sessionId });
      if (r.success) {
        setOutput(r.output);
        await fetchLogs();
      }
      else setError(r.error || "Plugin failed");
    } catch(e) { setError(e.message); }
    finally { setRunning(false); }
  }

  // --- FIXED (#589): Keep keyboard navigation listener hook from main ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        if (selected && input.trim() && !running) {
          e.preventDefault();
          run();
        }
        return;
      }
      if (plugins.length > 0 && document.activeElement?.tagName !== "TEXTAREA") {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          const currentIndex = plugins.findIndex(p => p.id === selected?.id);
          const nextIndex = (currentIndex + 1) % plugins.length;
          setSelected(plugins[nextIndex]);
          setOutput("");
          setError("");
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          const currentIndex = plugins.findIndex(p => p.id === selected?.id);
          const prevIndex = currentIndex <= 0 ? plugins.length - 1 : currentIndex - 1;
          setSelected(plugins[prevIndex]);
          setOutput("");
          setError("");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [plugins, selected, input, running, onClose]);

  return (
    <div data-testid="plugins-panel" className="fixed inset-0 z-50 flex flex-col bg-gray-900 px-5 py-4 overflow-y-auto md:relative md:inset-auto md:z-auto md:border-b md:border-gray-800 md:shrink-0 md:bg-gray-900">
      <div className="flex items-center justify-between mb-4 md:mb-3 shrink-0">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
          <PlugIcon className="w-4 h-4" />
          Plugins <span className="text-[10px] text-gray-500 font-mono hidden md:inline border border-gray-800 px-1 rounded bg-gray-950">Esc to close</span>
        </p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-2xl md:text-lg leading-none p-1" aria-label="Close panel">×</button>
      </div>

      {/* Plugin selector row */}
      <div className="flex flex-wrap gap-2 mb-4 md:mb-3 shrink-0">
        {loading ? (
          // --- FIXED (#586): Keep main's pulsing skeleton pill animations ---
          Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-7 w-20 bg-gray-800 border border-gray-800 rounded-lg animate-pulse" />
          ))
        ) : (
          plugins.map(p => (
            <button key={p.id} onClick={() => { setSelected(p); setOutput(""); setError(""); }}
              className={`text-xs px-3.5 py-2 md:py-1.5 rounded-lg border transition font-medium touch-manipulation
                ${selected?.id === p.id ? "border-purple-500 bg-purple-900/30 text-purple-300 shadow-sm shadow-purple-500/10" : "border-gray-700 text-gray-400 hover:bg-gray-800"}`}>
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
          ))
        )}
      </div>

      {/* Plugin Input/Output Area OR Empty-State Guidance */}
      {selected ? (
        <div className="space-y-3 md:space-y-2 flex-1 md:flex-initial flex flex-col justify-start shrink-0">
          <p className="text-xs text-gray-500">{selected.description}</p>
          <textarea value={input} onChange={e=>setInput(e.target.value)}
            placeholder={`Enter input for ${selected.name}...`} rows={4}
            className="w-full text-sm md:text-xs bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 md:py-2 text-gray-200 placeholder-gray-600 outline-none focus:border-purple-500 resize-none font-sans" />
          <div className="flex items-center justify-between">
            <button onClick={run} disabled={!input.trim() || running}
              className="w-full md:w-auto text-sm md:text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white px-5 py-2.5 md:py-1.5 rounded-lg transition font-medium shadow-md">
              {running ? "Running..." : `Run ${selected.name}`}
            </button>
            <span className="text-[10px] text-gray-600 font-mono hidden md:inline">Ctrl + Enter to run</span>
          </div>
          {output && (
            <pre className="text-xs bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-green-300 whitespace-pre-wrap max-h-60 md:max-h-40 overflow-y-auto font-mono mt-2">
              {output}
            </pre>
          )}
          {error && <p className="text-xs text-red-400 inline-flex items-center gap-1 mt-1"><ErrorIcon className="w-3.5 h-3.5" />{error}</p>}
        </div>
      ) : (
        /* FIXED (#587): Added Empty-State Guidance Layout Placeholder */
        <div className="flex-1 md:flex-initial flex flex-col items-center justify-center text-center p-6 my-2 border border-dashed border-gray-800 rounded-xl bg-gray-900/40">
          <PlugIcon className="w-8 h-8 text-gray-600 mb-2 animate-pulse" />
          <p className="text-xs font-medium text-gray-300">No Plugin Selected</p>
          <p className="text-[11px] text-gray-500 max-w-[260px] mt-1 leading-relaxed">
            Select an option from the tools list above, or use your keyboard <span className="font-mono bg-gray-950 px-1 py-0.5 rounded text-gray-400">←</span> <span className="font-mono bg-gray-950 px-1 py-0.5 rounded text-gray-400">→</span> arrows to choose a workspace.
          </p>
        </div>
      )}

      {/* Execution Logs Block */}
      <div className="mt-4 border-t border-gray-800 pt-4 flex-1 overflow-hidden flex flex-col min-h-[200px]">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 shrink-0">
          Recent Executions
        </h3>
        {logs.length === 0 ? (
          <p className="text-xs text-gray-500">No plugins have been run yet.</p>
        ) : (
          <ul className="space-y-2 overflow-y-auto pr-2 text-sm flex-1 custom-scrollbar">
            {logs.map((log) => (
              <li key={log.id} className="p-3 bg-gray-800/50 rounded-md border border-gray-700/50">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-purple-400 capitalize text-xs">
                    {log.plugin}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${log.success ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                    {log.success ? 'Success' : 'Error'}
                  </span>
                </div>
                <div className="text-gray-300 truncate text-xs">
                  <span className="text-gray-500">Input:</span> {log.input}
                </div>
                <div className="text-gray-600 text-[10px] mt-1 text-right">
                  {new Date(log.created_at + 'Z').toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}