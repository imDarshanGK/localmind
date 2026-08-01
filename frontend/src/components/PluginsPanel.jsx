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

// Helper badge renderer for compatibility tags (#597)
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
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState(null);

  // Persistent input state initialized from localStorage (#596)
  const [input, setInput] = useState(() => {
    if (!sessionId) return "";
    return localStorage.getItem(`localmind_plugin_draft_${sessionId}`) || "";
  });

  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState([]);

  // Persistent Pinned / Favorite Plugin IDs (#601)
  const [pinnedIds, setPinnedIds] = useState(() => {
    try {
      const saved = localStorage.getItem(`plugins-panel-pinned:${sessionId}`);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // State for contextual menu and action toast feedback (#602, #605)
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [notification, setNotification] = useState("");

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

  // Sync pinned plugin state to localStorage (#601)
  useEffect(() => {
    try {
      localStorage.setItem(`plugins-panel-pinned:${sessionId}`, JSON.stringify(pinnedIds));
    } catch (e) {
      console.warn("localStorage write blocked:", e);
    }
  }, [pinnedIds, sessionId]);

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
  }, [selectedPluginId, sessionId]);

  function handleSelectPlugin(plugin) {
    setSelected(plugin);
    setSelectedPluginId(plugin.id);
    setOutput("");
    setError("");
    setCopied(false);
  }

  function togglePin(e, pluginId) {
    e.stopPropagation();
    setPinnedIds((prev) =>
      prev.includes(pluginId) ? prev.filter((id) => id !== pluginId) : [...prev, pluginId]
    );
  }

  // Re-sync input draft whenever sessionId changes (#596)
  useEffect(() => {
    if (!sessionId) return;
    setInput(localStorage.getItem(`localmind_plugin_draft_${sessionId}`) || "");
  }, [sessionId]);

  // Persist plugin draft input to localStorage on edit (#596)
  useEffect(() => {
    if (!sessionId) return;
    if (input) {
      localStorage.setItem(`localmind_plugin_draft_${sessionId}`, input);
    } else {
      localStorage.removeItem(`localmind_plugin_draft_${sessionId}`);
    }
  }, [input, sessionId]);

  // Close contextual action menu on global click or Escape key (#602, #605)
  useEffect(() => {
    const handleGlobalClick = () => setActiveMenuId(null);
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setActiveMenuId(null);
    };
    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(""), 3000);
  };

  // Export Action (#605)
  const handleExportPlugin = (e, plugin) => {
    e.stopPropagation();
    setActiveMenuId(null);
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(plugin, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `${plugin.id}-config.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showNotification(`Exported ${plugin.name} configuration.`);
    } catch (err) {
      console.error("Export failed", err);
      setError("Failed to export plugin config.");
    }
  };

  // Share Action (#605)
  const handleSharePlugin = async (e, plugin) => {
    e.stopPropagation();
    setActiveMenuId(null);
    const shareUrl = `${window.location.origin}${window.location.pathname}?plugin=${plugin.id}`;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        showNotification(`Copied share link for ${plugin.name}!`);
      } else {
        showNotification(`Share link: ${shareUrl}`);
      }
    } catch (err) {
      console.error("Share failed", err);
      showNotification(`Share link: ${shareUrl}`);
    }
  };

  const toggleContextMenu = (e, pluginId) => {
    e.stopPropagation();
    setActiveMenuId((prev) => (prev === pluginId ? null : pluginId));
  };

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
        // Clear saved draft from localStorage after successful execution (#596)
        if (sessionId) {
          localStorage.removeItem(`localmind_plugin_draft_${sessionId}`);
        }
      } else {
        setError(r.error || "Plugin failed");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  // Sort plugins with pinned/favorites at the top (#601)
  const sortedPlugins = [...plugins].sort((a, b) => {
    const isAPinned = pinnedIds.includes(a.id);
    const isBPinned = pinnedIds.includes(b.id);
    if (isAPinned && !isBPinned) return -1;
    if (!isAPinned && isBPinned) return 1;
    return 0;
  });

  // Filter plugins in real-time by search query (#600)
  const filteredPlugins = sortedPlugins.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = p.name?.toLowerCase().includes(q);
    const descMatch = p.description?.toLowerCase().includes(q);
    return nameMatch || descMatch;
  });

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

      {/* Action Notification Banner (#605) */}
      {notification && (
        <div data-testid="action-notification" className="mb-3 text-xs bg-purple-950/60 border border-purple-800 text-purple-300 p-2 rounded-lg flex items-center justify-between shadow-sm">
          <span>{notification}</span>
          <button onClick={() => setNotification("")} className="text-purple-400 hover:text-white font-bold ml-2">×</button>
        </div>
      )}

      {/* Global Inline Error Banner (#588) */}
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
          {/* Search Refinement Input (#600) */}
          <div className="mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search plugins..."
              aria-label="Filter plugins"
              className="w-full text-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-200 placeholder-gray-600 outline-none focus:border-purple-500 font-sans"
            />
          </div>

          {/* Plugin selector with favorite & pin toggles (#601), compatibility badges (#597), & contextual menus (#602, #605) */}
          <div data-testid="plugin-selector-list" className="flex flex-wrap gap-2 mb-4 md:mb-3 shrink-0 min-h-[32px]">
            {filteredPlugins.length > 0 ? (
              filteredPlugins.map((p) => {
                const isPinned = pinnedIds.includes(p.id);
                const Icon = PLUGIN_ICONS[p.icon] || PlugIcon;
                const isMenuOpen = activeMenuId === p.id;

                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectPlugin(p)}
                    data-testid={`plugin-btn-${p.id}`}
                    className={`relative text-xs px-3.5 py-2 md:py-1.5 rounded-lg border transition font-medium flex items-center gap-1.5 cursor-pointer touch-manipulation select-none
                      ${selected?.id === p.id ? "border-purple-500 bg-purple-900/30 text-purple-300 shadow-sm shadow-purple-500/10" : "border-gray-700 text-gray-400 hover:bg-gray-800"}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{p.name}</span>

                    {p.compatibility && <CompatibilityBadge compatibility={p.compatibility} />}

                    {/* Pin/Favorite Toggle Button (#601) */}
                    <button
                      type="button"
                      onClick={(e) => togglePin(e, p.id)}
                      aria-label={isPinned ? `Unpin ${p.name}` : `Pin ${p.name}`}
                      className={`ml-1 hover:text-amber-300 transition ${isPinned ? "text-amber-400" : "text-gray-600"}`}
                    >
                      {isPinned ? "★" : "☆"}
                    </button>

                    {/* Context Menu Trigger Button (#602) */}
                    <button
                      type="button"
                      onClick={(e) => toggleContextMenu(e, p.id)}
                      aria-label={`Options for ${p.name}`}
                      className="ml-0.5 text-gray-500 hover:text-gray-200 transition px-1 rounded hover:bg-gray-700/50 font-bold"
                    >
                      ⋮
                    </button>

                    {/* Context Dropdown Menu (#602, #605) */}
                    {isMenuOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-0 top-full mt-1 w-36 bg-gray-950 border border-gray-800 rounded-lg shadow-xl z-50 py-1 text-xs text-gray-300 font-normal"
                      >
                        <button
                          type="button"
                          onClick={(e) => handleSharePlugin(e, p)}
                          className="w-full text-left px-3 py-1.5 hover:bg-gray-800 hover:text-white"
                        >
                          Share Plugin
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleExportPlugin(e, p)}
                          className="w-full text-left px-3 py-1.5 hover:bg-gray-800 hover:text-white"
                        >
                          Export Config
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-gray-500 italic py-1">No matching plugins found.</p>
            )}
          </div>

          {/* Plugin Input/Output Area OR Empty-State Guidance */}
          {selected ? (
            <div data-testid="plugin-workspace" className="space-y-3 md:space-y-2 flex-1 md:flex-initial flex flex-col justify-start shrink-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500">{selected.description}</p>
                {selected.compatibility && (
                  <div className="shrink-0 flex items-center gap-1 text-[11px] text-gray-400">
                    <span className="text-gray-500">Compatibility:</span>
                    <CompatibilityBadge compatibility={selected.compatibility} />
                  </div>
                )}
              </div>
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
    </div>
  );
}