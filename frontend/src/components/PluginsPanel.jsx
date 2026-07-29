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

  // State for contextual menu and action toast feedback (#605)
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [notification, setNotification] = useState("");

  useEffect(() => {
    getPlugins().then(d => setPlugins(d.plugins || [])).catch(() => {});
  }, []);

  // Close contextual action menu on global click or Escape key
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
    if (!selected || !input.trim()) return;
    setRunning(true); setOutput(""); setError("");
    try {
      const r = await runPlugin({ plugin: selected.id, input, session_id: sessionId });
      if (r.success) setOutput(r.output);
      else setError(r.error || "Plugin failed");
    } catch (e) { setError(e.message); }
    finally { setRunning(false); }
  }

  return (
    <div className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0 relative" data-testid="plugins-panel">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5"><PlugIcon className="w-4 h-4" />Plugins</p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
      </div>

      {/* Action Notification Banner (#605) */}
      {notification && (
        <div data-testid="action-notification" className="mb-3 text-xs bg-purple-950/60 border border-purple-800 text-purple-300 p-2 rounded-lg flex items-center justify-between shadow-sm">
          <span>{notification}</span>
          <button onClick={() => setNotification("")} className="text-purple-400 hover:text-white font-bold ml-2">×</button>
        </div>
      )}

      {/* Plugin selector with contextual dropdown menus */}
      <div className="flex flex-wrap gap-2 mb-3">
        {plugins.map(p => {
          const Icon = PLUGIN_ICONS[p.icon] || PlugIcon;
          const isMenuOpen = activeMenuId === p.id;

          return (
            <div
              key={p.id}
              onClick={() => { setSelected(p); setOutput(""); setError(""); }}
              data-testid={`plugin-item-${p.id}`}
              className={`relative text-xs px-3 py-1.5 rounded-lg border transition font-medium flex items-center gap-1.5 cursor-pointer select-none
                ${selected?.id === p.id ? "border-purple-500 bg-purple-900/30 text-purple-300" : "border-gray-700 text-gray-400 hover:bg-gray-800"}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{p.name}</span>

              {/* Context Menu Trigger Button */}
              <button
                type="button"
                onClick={(e) => toggleContextMenu(e, p.id)}
                aria-label={`Options for ${p.name}`}
                className="ml-1 text-gray-500 hover:text-gray-200 transition px-1 rounded hover:bg-gray-700/50 font-bold"
              >
                ⋮
              </button>

              {/* Context Dropdown Menu (#605) */}
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
        })}
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
          {error && <p className="text-xs text-red-400 inline-flex items-center gap-1"><ErrorIcon className="w-3.5 h-3.5" />{error}</p>}
        </div>
      )}
    </div>
  );
}