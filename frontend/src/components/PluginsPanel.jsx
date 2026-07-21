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
  const [plugins, setPlugins] = useState([]);
  const [selected, setSelected] = useState(null);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);

  // Persistence: View collapsed state
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(`plugins-panel-collapsed:${sessionId}`);
      return saved === "true";
    } catch (e) {
      return false;
    }
  });

  // Persistence: Selected plugin ID state
  const [selectedPluginId, setSelectedPluginId] = useState(() => {
    try {
      return localStorage.getItem(`plugins-panel-selected:${sessionId}`) || null;
    } catch (e) {
      return null;
    }
  });

  // Sync collapsed state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(`plugins-panel-collapsed:${sessionId}`, String(isCollapsed));
    } catch (e) {
      console.warn("localStorage write blocked:", e);
    }
  }, [isCollapsed, sessionId]);

  // Sync selected plugin ID to localStorage
  useEffect(() => {
    try {
      if (selectedPluginId) {
        localStorage.setItem(`plugins-panel-selected:${sessionId}`, selectedPluginId);
      } else {
        localStorage.removeItem(`plugins-panel-selected:${sessionId}`);
      }
    } catch (e) {
      console.warn("localStorage write blocked:", e);
    }
  }, [selectedPluginId, sessionId]);

  const fetchLogs = async () => {
    try {
      const data = await getPluginLogs(50);
      setLogs(data.logs || []);
    } catch (err) {
      console.error("Failed to fetch plugin logs", err);
    }
  };

  // Fetch plugins & restore selected plugin object if ID was saved
  useEffect(() => {
    setLoading(true);
    setError("");
    getPlugins()
      .then((d) => {
        const fetchedPlugins = d.plugins || [];
        setPlugins(fetchedPlugins);

        if (selectedPluginId) {
          const match = fetchedPlugins.find((p) => p.id === selectedPluginId);
          if (match) setSelected(match);
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to fetch plugins from server.");
      })
      .finally(() => setLoading(false));

    fetchLogs();
  }, [selectedPluginId]);

  function handleSelectPlugin(plugin) {
    setSelected(plugin);
    setSelectedPluginId(plugin.id);
    setOutput("");
    setError("");
  }

  async function run() {
    if (!selected || !input.trim() || running) return;
    setRunning(true);
    setOutput("");
    setError("");
    try {
      const r = await runPlugin({ plugin: selected.id, input, session_id: sessionId });
      if (r.success) {
        setOutput(r.output);
        await fetchLogs();
      } else {
        setError(r.error || "Plugin failed");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      data-testid="plugins-panel"
      className="fixed inset-0 z-50 flex flex-col bg-gray-900 px-5 py-4 overflow-y-auto md:relative md:inset-auto md:z-auto md:border-b md:border-gray-800 md:shrink-0 md:bg-gray-900"
    >
      <div className="flex items-center justify-between mb-4 md:mb-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-gray-400 hover:text-white text-xs p-1 focus:outline-none focus:ring-1 focus:ring-purple-500 rounded transition"
            aria-label={isCollapsed ? "Expand plugins section" : "Collapse plugins section"}
          >
            {isCollapsed ? "▶" : "▼"}
          </button>
          <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
            <PlugIcon className="w-4 h-4" />
            Plugins
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          data-testid="close-panel-btn"
          className="text-gray-500 hover:text-gray-300 text-2xl md:text-lg leading-none p-1"
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      {/* Top-Level Prominent Global Inline Error Banner */}
      {error && (
        <div
          data-testid="plugin-error-message"
          className="mb-3 text-xs bg-red-950/40 border border-red-900/50 text-red-400 p-2.5 rounded-xl flex items-start gap-2 shadow-sm transition-all duration-200"
        >
          <ErrorIcon className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
          <div className="flex-1">
            <span className="font-semibold block mb-0.5">Plugin Error</span>
            <p className="text-red-300/90 leading-relaxed">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setError("")}
            className="text-red-500 hover:text-red-300 transition font-bold text-sm leading-none px-1"
            title="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {!isCollapsed && (
        <>
          {/* Plugin selector row */}
          <div data-testid="plugin-selector-list" className="flex flex-wrap gap-2 mb-4 md:mb-3 shrink-0">
            {plugins.map((p) => (
              <button
                key={p.id}
                type="button"
                data-testid={`plugin-btn-${p.id}`}
                onClick={() => handleSelectPlugin(p)}
                className={`text-xs px-3.5 py-2 md:py-1.5 rounded-lg border transition font-medium touch-manipulation
                  ${selected?.id === p.id ? "border-purple-500 bg-purple-900/30 text-purple-300 shadow-sm shadow-purple-500/10" : "border-gray-700 text-gray-400 hover:bg-gray-800"}`}
              >
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

          {/* Plugin Input/Output Area OR Empty-State Guidance */}
          {selected ? (
            <div data-testid="plugin-workspace" className="space-y-3 md:space-y-2 flex-1 md:flex-initial flex flex-col justify-start shrink-0">
              <p className="text-xs text-gray-500">{selected.description}</p>
              <textarea
                data-testid="plugin-input-textarea"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Enter input for ${selected.name}...`}
                rows={4}
                className="w-full text-sm md:text-xs bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 md:py-2 text-gray-200 placeholder-gray-600 outline-none focus:border-purple-500 resize-none font-sans"
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  data-testid="run-plugin-btn"
                  onClick={run}
                  disabled={!input.trim() || running}
                  className="w-full md:w-auto text-sm md:text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white px-5 py-2.5 md:py-1.5 rounded-lg transition font-medium shadow-md"
                >
                  {running ? "Running..." : `Run ${selected.name}`}
                </button>
              </div>
              {output && (
                <pre
                  data-testid="plugin-output-display"
                  className="text-xs bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-green-300 whitespace-pre-wrap max-h-60 md:max-h-40 overflow-y-auto font-mono mt-2"
                >
                  {output}
                </pre>
              )}
            </div>
          ) : (
            <div className="flex-1 md:flex-initial flex flex-col items-center justify-center text-center p-6 my-2 border border-dashed border-gray-800 rounded-xl bg-gray-900/40">
              <PlugIcon className="w-8 h-8 text-gray-600 mb-2 animate-pulse" />
              <p className="text-xs font-medium text-gray-300">No Plugin Selected</p>
              <p className="text-[11px] text-gray-500 max-w-[260px] mt-1 leading-relaxed">
                Select an option from the tools list above to open a plugin workspace workspace.
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
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full ${
                          log.success ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"
                        }`}
                      >
                        {log.success ? "Success" : "Error"}
                      </span>
                    </div>
                    <div className="text-gray-300 truncate text-xs">
                      <span className="text-gray-500">Input:</span> {log.input}
                    </div>
                    <div className="text-gray-600 text-[10px] mt-1 text-right">
                      {new Date(log.created_at + "Z").toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}