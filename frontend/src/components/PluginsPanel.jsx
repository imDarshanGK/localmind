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

  // Drag-and-Drop state (#604)
  const [draggedIndex, setDraggedIndex] = useState(null);

  // Fetch plugins and sort according to persisted ordering (#604)
  useEffect(() => {
    getPlugins()
      .then((d) => {
        let fetchedPlugins = d.plugins || [];

        try {
          const savedOrder = localStorage.getItem(`plugins-panel-order:${sessionId}`);
          if (savedOrder) {
            const orderArray = JSON.parse(savedOrder);
            fetchedPlugins.sort((a, b) => {
              const indexA = orderArray.indexOf(a.id);
              const indexB = orderArray.indexOf(b.id);
              if (indexA === -1) return 1;
              if (indexB === -1) return -1;
              return indexA - indexB;
            });
          }
        } catch (e) {
          console.warn("Failed to load plugin order from localStorage", e);
        }

        setPlugins(fetchedPlugins);
      })
      .catch(() => {});
  }, [sessionId]);

  // Helper to persist order array to localStorage (#604)
  const savePluginOrder = (orderedList) => {
    try {
      const orderIds = orderedList.map((p) => p.id);
      localStorage.setItem(`plugins-panel-order:${sessionId}`, JSON.stringify(orderIds));
    } catch (e) {
      console.warn("Failed to save plugin order", e);
    }
  };

  // Drag-and-Drop Event Handlers (#604)
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
    }
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const reordered = [...plugins];
    const [draggedItem] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, draggedItem);

    setPlugins(reordered);
    setDraggedIndex(null);
    savePluginOrder(reordered);
  };

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
    <div className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
          <PlugIcon className="w-4 h-4" />
          Plugins
        </p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">
          ×
        </button>
      </div>

      {/* Draggable plugin selector list (#604) */}
      <div className="flex flex-wrap gap-2 mb-3" data-testid="plugin-list-container">
        {plugins.map((p, index) => {
          const Icon = PLUGIN_ICONS[p.icon] || PlugIcon;
          const isBeingDragged = draggedIndex === index;

          return (
            <div
              key={p.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onClick={() => {
                setSelected(p);
                setOutput("");
                setError("");
              }}
              data-testid={`plugin-item-${p.id}`}
              className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium cursor-grab active:cursor-grabbing inline-flex items-center gap-1.5 select-none
                ${isBeingDragged ? "opacity-40 border-dashed border-purple-400" : ""}
                ${selected?.id === p.id ? "border-purple-500 bg-purple-900/30 text-purple-300" : "border-gray-700 text-gray-400 hover:bg-gray-800"}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{p.name}</span>
            </div>
          );
        })}
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
    </div>
  );
}