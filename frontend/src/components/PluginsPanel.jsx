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


  const fetchLogs = async () => {
    try {
        const data = await getPluginLogs(50);
        setLogs(data.logs || []);
    } catch (err) {
        console.error("Failed to fetch plugin logs", err);
    }
  };

  useEffect(() => {
    getPlugins().then(d => setPlugins(d.plugins || [])).catch(()=>{});
    fetchLogs();
  }, []);

  async function run() {
    if (!selected || !input.trim()) return;
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

  return (
    <div data-testid="plugins-panel" className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0 flex flex-col max-h-[50vh]">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5"><PlugIcon className="w-4 h-4" />Plugins</p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
      </div>

      {/* Plugin selector */}
      <div className="flex flex-wrap gap-2 mb-3 shrink-0">
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

      {/* Plugin Input/Output Area */}
      {selected && (
        <div className="space-y-2 shrink-0 mb-4">
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
          {error && <p className="text-xs text-red-400 inline-flex items-center gap-1"><ErrorIcon className="w-3.5 h-3.5" />{error}</p>}
        </div>
      )}

      <div className="mt-2 border-t border-gray-800 pt-4 flex-1 overflow-hidden flex flex-col">
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