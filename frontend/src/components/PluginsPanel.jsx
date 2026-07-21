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
  const [plugins, setPlugins] = useState([]);
  const [selected, setSelected] = useState(null);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

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

  // Fetch plugins & restore selected plugin object if ID was saved
  useEffect(() => {
    getPlugins()
      .then((d) => {
        const fetchedPlugins = d.plugins || [];
        setPlugins(fetchedPlugins);

        if (selectedPluginId) {
          const match = fetchedPlugins.find((p) => p.id === selectedPluginId);
          if (match) setSelected(match);
        }
      })
      .catch(() => {});
  }, [selectedPluginId]);

  function handleSelectPlugin(plugin) {
    setSelected(plugin);
    setSelectedPluginId(plugin.id);
    setOutput("");
    setError("");
  }

  async function run() {
    if (!selected || !input.trim()) return;
    setRunning(true);
    setOutput("");
    setError("");
    try {
      const r = await runPlugin({ plugin: selected.id, input, session_id: sessionId });
      if (r.success) setOutput(r.output);
      else setError(r.error || "Plugin failed");
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0" data-testid="plugins-panel">
      <div className="flex items-center justify-between mb-3">
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
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-lg leading-none"
          aria-label="Close plugins panel"
        >
          ×
        </button>
      </div>

      {!isCollapsed && (
        <>
          {/* Plugin selector */}
          <div className="flex flex-wrap gap-2 mb-3">
            {plugins.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectPlugin(p)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium
                  ${selected?.id === p.id ? "border-purple-500 bg-purple-900/30 text-purple-300" : "border-gray-700 text-gray-400 hover:bg-gray-800"}`}
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

          {selected && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">{selected.description}</p>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Enter input for ${selected.name}...`}
                rows={3}
                className="w-full text-xs bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-gray-200 placeholder-gray-600 outline-none focus:border-purple-500 resize-none"
              />
              <button
                onClick={run}
                disabled={!input.trim() || running}
                className="text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg transition font-medium"
              >
                {running ? "Running..." : `Run ${selected.name}`}
              </button>
              {output && (
                <pre className="text-xs bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-green-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {output}
                </pre>
              )}
              {error && (
                <p className="text-xs text-red-400 inline-flex items-center gap-1">
                  <ErrorIcon className="w-3.5 h-3.5" />
                  {error}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}