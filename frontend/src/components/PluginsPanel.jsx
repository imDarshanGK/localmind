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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState([]);

  // Contextual menu state
  const [activeMenuId, setActiveMenuId] = useState(null);

  // Changelog modal state (#603)
  const [changelogPlugin, setChangelogPlugin] = useState(null);

  // Persistence: View collapsed state (#592)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(`plugins-panel-collapsed:${sessionId}`);
      return saved === "true";
    } catch (e) {
      return false;
    }
  });

  // Persistence: Selected plugin ID state (#592)
  const [selectedPluginId, setSelectedPluginId] = useState(() => {
    try {
      return localStorage.getItem(`plugins-panel-selected:${sessionId}`) || null;
    } catch (e) {
      return null;
    }
  });

  // Close menus and modals on outside click or Escape key
  useEffect(() => {
    const handleGlobalClick = () => setActiveMenuId(null);
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setActiveMenuId(null);
        setChangelogPlugin(null);
      }
    };
    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Sync collapsed state to localStorage (#592)
  useEffect(() => {
    try {
      localStorage.setItem(`plugins-panel-collapsed:${sessionId}`, String(isCollapsed));
    } catch (e) {
      console.warn("localStorage write blocked:", e);
    }
  }, [isCollapsed, sessionId]);

  // Sync selected plugin ID to localStorage (#592)
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

  // Fetch plugins & restore selected plugin object if ID was saved (#592)
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
    setCopied(false);
  }

  function toggleContextMenu(e, pluginId) {
    e.stopPropagation();
    setActiveMenuId((prev) => (prev === pluginId ? null : pluginId));
  }

  function handleOpenChangelog(e, plugin) {
    e.stopPropagation();
    setChangelogPlugin(plugin);
    setActiveMenuId(null);
  }

  async function run() {
    if (!selected || !input.trim() || running) return;
    setRunning(true);
    setOutput("");
    setError("");
    setCopied(false);
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

  const handleCopy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <div className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0 relative" data-testid="plugins-panel">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          {/* Collapse/Expand toggle button */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-gray-400 hover:text-white text-xs p-1 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 transition"
            aria-label={isCollapsed ? "Expand plugins section" : "Collapse plugins section"}
          >
            {isCollapsed ? "▶" : "▼"}
          </button>

          <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
            <PlugIcon className="w-4 h-4" />
            Plugins Workspace
          </p>

          {/* Interactive help tooltip utility box (#593) */}
          <div className="group relative inline-block">
            <button
              type="button"
              className="text-gray-500 hover:text-purple-400 text-xs font-mono border border-gray-700 hover:border-purple-500/40 rounded-full w-4 h-4 inline-flex items-center justify-center bg-gray-950 cursor-help transition-colors focus:outline-none focus:ring-1 focus:ring-purple-500"
              aria-label="Plugins panel information description"
            >
              i
            </button>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block group-focus-within:block w-52 bg-gray-950 border border-gray-800 text-gray-400 text-[10px] p-2 rounded shadow-xl z-50 pointer-events-none leading-relaxed">
              <span className="font-semibold text-white block mb-0.5">Plugins Workspace Help:</span>
              Select an active plugin tool to run utility scripts or perform automated text/data transformations on your workspace inputs.
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-950"></div>
            </div>
          </div>
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

      {/* Global Inline Error Banner */}
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

      {/* Collapsible Panel Section */}
      {!isCollapsed && (
        <>
          {/* Plugin selector row with action menu and changelog preview option (#603) */}
          <div data-testid="plugin-selector-list" className="flex flex-wrap gap-2 mb-4 md:mb-3 shrink-0">
            {plugins.map((p) => {
              const Icon = PLUGIN_ICONS[p.icon] || PlugIcon;
              const isMenuOpen = activeMenuId === p.id;

              return (
                <div
                  key={p.id}
                  data-testid={`plugin-btn-${p.id}`}
                  onClick={() => handleSelectPlugin(p)}
                  className={`relative text-xs px-3 py-1.5 rounded-lg border transition font-medium cursor-pointer flex items-center gap-1.5 touch-manipulation
                    ${selected?.id === p.id ? "border-purple-500 bg-purple-900/30 text-purple-300 shadow-sm shadow-purple-500/10" : "border-gray-700 text-gray-400 hover:bg-gray-800"}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{p.name}</span>

                  {/* Action Menu Trigger */}
                  <button
                    type="button"
                    onClick={(e) => toggleContextMenu(e, p.id)}
                    aria-label={`Options for ${p.name}`}
                    className="ml-1 text-gray-500 hover:text-gray-200 transition px-1 rounded hover:bg-gray-700/50 font-bold"
                  >
                    ⋮
                  </button>

                  {/* Context Dropdown Menu (#603) */}
                  {isMenuOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-full mt-1 w-36 bg-gray-950 border border-gray-800 rounded-lg shadow-xl z-50 py-1 text-xs text-gray-300 font-normal"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectPlugin(p);
                          setActiveMenuId(null);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-gray-800 hover:text-white"
                      >
                        Select & Run
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleOpenChangelog(e, p)}
                        className="w-full text-left px-3 py-1.5 hover:bg-gray-800 hover:text-white"
                      >
                        View Changelog
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
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

              {/* Output block with copy feedback button */}
              {output && (
                <div className="relative mt-2">
                  <div className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-t-xl px-3 py-1.5 text-xs text-gray-400">
                    <span className="font-mono text-[11px]">Output</span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition font-sans flex items-center gap-1"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <pre className="text-xs bg-gray-800 border border-t-0 border-gray-700 rounded-b-xl px-3 py-2 text-green-300 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono" data-testid="plugin-output-display">
                    {output}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            /* Empty State Guidance Card */
            <div className="flex-1 md:flex-initial flex flex-col items-center justify-center text-center p-6 my-2 border border-dashed border-gray-800 rounded-xl bg-gray-900/40">
              <PlugIcon className="w-8 h-8 text-gray-600 mb-2 animate-pulse" />
              <p className="text-xs font-medium text-gray-300">No Plugin Selected</p>
              <p className="text-[11px] text-gray-500 max-w-[260px] mt-1 leading-relaxed">
                Select an option from the tools list above to open a plugin workspace.
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

      {/* Changelog Modal (#603) */}
      {changelogPlugin && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50"
          onClick={() => setChangelogPlugin(null)}
          data-testid="changelog-modal"
        >
          <div
            className="bg-gray-900 border border-gray-800 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>{changelogPlugin.name}</span>
                <span className="text-xs font-mono text-purple-400 bg-purple-950/60 border border-purple-800/50 px-2 py-0.5 rounded-full">
                  Changelog
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setChangelogPlugin(null)}
                className="text-gray-500 hover:text-white transition font-bold text-lg leading-none p-1"
                aria-label="Close changelog modal"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {changelogPlugin.changelog && changelogPlugin.changelog.length > 0 ? (
                changelogPlugin.changelog.map((item, idx) => (
                  <div key={idx} className="bg-gray-800/40 border border-gray-800 p-3 rounded-lg space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-purple-300 font-semibold">{item.version}</span>
                      <span className="text-gray-500 text-[11px]">{item.date}</span>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed">{item.changes}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-500 italic text-center py-4">
                  No changelog preview available for {changelogPlugin.name}.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}