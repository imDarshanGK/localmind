import { useState, useEffect } from "react";
import { CloseIcon, ChevronDownIcon } from "./Icons";
import { getPromptTemplates } from "../utils/api";

export default function PromptTemplateDialog({ onSelect, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPromptTemplates()
      .then(data => setTemplates(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleExpand(id) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  function handleSelect(template) {
    onSelect(template);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition"
            title="Close"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-semibold text-white">Prompt Templates</h2>
          <div className="w-4" /> {/* spacer for centering */}
        </div>

        {/* Template List */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
          {loading && (
            <p className="text-xs text-gray-500 text-center py-6">Loading...</p>
          )}

          {!loading && templates.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-6">No templates available. Create one from the Prompts page.</p>
          )}

          {templates.map(t => (
            <div key={t.id} className="bg-gray-800/50 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition">
              {/* Row */}
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  onClick={() => handleSelect(t)}
                  className="flex-1 text-left text-sm font-medium text-gray-200 hover:text-purple-300 transition truncate"
                  title="Click to use this template"
                >
                  {t.prompt_title}
                </button>
                <span className="text-xs text-gray-600 shrink-0">{t.created_at}</span>
                <button
                  onClick={() => toggleExpand(t.id)}
                  className={`p-1 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition ${expandedId === t.id ? "rotate-180" : ""}`}
                  title="Expand"
                >
                  <ChevronDownIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Expanded prompt text */}
              {expandedId === t.id && (
                <div className="px-4 pb-3 pt-0">
                  <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap border-t border-gray-700 pt-2">
                    {t.prompt}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
