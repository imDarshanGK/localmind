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
  const [pluginFilter, setPluginFilter] = useState("");
const [startDate, setStartDate] = useState("");
const [endDate, setEndDate] = useState("");
const [expandedLog, setExpandedLog] = useState(null);


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
  const filteredLogs = logs.filter((log) => {
  const matchesPlugin =
    pluginFilter === "" ||
    log.plugin.toLowerCase().includes(pluginFilter.toLowerCase());

  const logDate = new Date(log.created_at);

  const matchesStart =
    !startDate || logDate >= new Date(startDate);

  const matchesEnd =
    !endDate ||
    logDate <= new Date(endDate + "T23:59:59");

  return matchesPlugin && matchesStart && matchesEnd;
});

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
          <div className="flex items-center justify-between mb-3">
    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Plugin History
    </h3>
            <div className="flex gap-2 mb-3 flex-wrap">
    <input
        type="text"
        placeholder="Filter by plugin"
        value={pluginFilter}
        onChange={(e) => setPluginFilter(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
    />

    <input
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
    />

    <input
        type="date"
        value={endDate}
        onChange={(e) => setEndDate(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
    />
</div>
</div>
          {filteredLogs.length === 0 ? (
              <p className="text-xs text-gray-500">No plugins have been run yet.</p>
          ) : (
              <ul className="space-y-2 overflow-y-auto pr-2 text-sm flex-1 custom-scrollbar">
                  {filteredLogs.map((log) => (
                     <li
    key={log.id}
    className="p-3 bg-gray-800/50 rounded-md border border-gray-700/50"
>
    <div className="flex justify-between items-center mb-2">

        <span className="font-bold text-purple-400 capitalize text-xs">
            {log.plugin}
        </span>

        <span
            className={`text-[10px] px-2 py-0.5 rounded-full ${
                log.success
                    ? "bg-green-900/50 text-green-400"
                    : "bg-red-900/50 text-red-400"
            }`}
        >
            {log.success ? "Success" : "Failure"}
        </span>

    </div>

    <div className="text-xs text-gray-300">
        <span className="text-gray-500">Input:</span>{" "}
        {expandedLog === log.id
            ? log.input
            : (log.input || "").slice(0, 80)}
        {expandedLog !== log.id &&
            log.input &&
            log.input.length > 80 &&
            "..."}
    </div>

    <div className="text-xs text-gray-300 mt-2">
        <span className="text-gray-500">Output:</span>{" "}
        {expandedLog === log.id
            ? log.output
            : (log.output || "").slice(0, 80)}
        {expandedLog !== log.id &&
            log.output &&
            log.output.length > 80 &&
            "..."}
    </div>

    <div className="flex justify-between items-center mt-3">

        <span className="text-[10px] text-gray-500">
            {new Date(log.created_at + "Z").toLocaleString()}
        </span>

        <button
            className="text-purple-400 text-xs hover:underline"
            onClick={() =>
                setExpandedLog(
                    expandedLog === log.id ? null : log.id
                )
            }
        >
            {expandedLog === log.id ? "Show Less" : "Show More"}
        </button>

    </div>
</li>
                  ))}
              </ul>
          )}
      </div>
    </div>
  );
}
