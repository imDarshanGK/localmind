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

  // Contextual menu state
  const [activeMenuId, setActiveMenuId] = useState(null);

  // Changelog modal state (#603)
  const [changelogPlugin, setChangelogPlugin] = useState(null);

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

  useEffect(() => {
    getPlugins().then(d => setPlugins(d.plugins || [])).catch(() => {});
  }, []);

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
    if (!selected || !input.trim()) return;
    setRunning(true); setOutput(""); setError("");
    try {
      const r = await runPlugin({ plugin: selected.id, input, session_id: sessionId });
      if (r.success) setOutput(r.output);
      else setError(r.error || "Plugin failed");
    } catch(e) { setError(e.message); }
    finally { setRunning(false); }
  }

  return (
    <div className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0 relative">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5"><PlugIcon className="w-4 h-4" />Plugins</p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
      </div>

      {/* Plugin selector with action menu and changelog preview option (#603) */}
      <div className="flex flex-wrap gap-2 mb-3">
        {plugins.map(p => {
          const Icon = PLUGIN_ICONS[p.icon] || PlugIcon;
          const isMenuOpen = activeMenuId === p.id;

          return (
            <div
              key={p.id}
              onClick={() => { setSelected(p); setOutput(""); setError(""); }}
              className={`relative text-xs px-3 py-1.5 rounded-lg border transition font-medium cursor-pointer flex items-center gap-1.5
                ${selected?.id === p.id ? "border-purple-500 bg-purple-900/30 text-purple-300" : "border-gray-700 text-gray-400 hover:bg-gray-800"}`}
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
                      setSelected(p);
                      setOutput("");
                      setError("");
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