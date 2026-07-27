import { useState, useEffect } from "react";
import { TemplateIcon, PencilIcon, TrashIcon, PlusCircleIcon, CloseIcon } from "./Icons";
import { getPromptTemplates, createPromptTemplate, updatePromptTemplate, deletePromptTemplate } from "../utils/api";

export default function PromptRegistryPage({ onBack }) {
  const [templates, setTemplates] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    setLoading(true);
    try {
      const data = await getPromptTemplates();
      setTemplates(data || []);
    } catch (e) {
      console.error("Failed to fetch templates:", e);
    } finally {
      setLoading(false);
    }
  }

  function handleAdd() {
    setEditingTemplate(null);
    setDialogOpen(true);
  }

  function handleEdit(template) {
    setEditingTemplate(template);
    setDialogOpen(true);
  }

  async function handleDelete(id) {
    try {
      await deletePromptTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      console.error("Failed to delete template:", e);
    }
  }

  async function handleSave({ prompt_title, prompt }) {
    try {
      if (editingTemplate) {
        const updated = await updatePromptTemplate(editingTemplate.id, { prompt_title, prompt });
        setTemplates(prev =>
          prev.map(t => t.id === editingTemplate.id ? updated : t)
        );
      } else {
        const created = await createPromptTemplate({ prompt_title, prompt });
        setTemplates(prev => [created, ...prev]);
      }
    } catch (e) {
      console.error("Failed to save template:", e);
    }
    setDialogOpen(false);
    setEditingTemplate(null);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-sm text-gray-400 hover:text-white transition px-2 py-1 rounded-lg hover:bg-gray-800"
          >
            ← Back
          </button>
          <div className="flex items-center gap-2">
            <TemplateIcon className="w-5 h-5 text-purple-400" />
            <h1 className="text-lg font-semibold text-white">Prompt Registry</h1>
          </div>
        </div>
        <button
          onClick={handleAdd}
          className="text-sm bg-purple-700 hover:bg-purple-600 active:bg-purple-800 text-white px-4 py-2 rounded-xl font-medium transition inline-flex items-center gap-1.5"
        >
          <PlusCircleIcon className="w-4 h-4" />
          Add New Template
        </button>
      </div>

      {/* Template List */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-500">Loading templates...</p>
          </div>
        )}

        {!loading && templates.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <TemplateIcon className="w-12 h-12 text-gray-700" />
            <p className="text-sm text-gray-500">No prompt templates yet.</p>
            <button
              onClick={handleAdd}
              className="text-sm text-purple-400 hover:text-purple-300 transition"
            >
              Create your first template →
            </button>
          </div>
        )}

        {templates.map(t => (
          <div
            key={t.id}
            className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 hover:border-gray-700 transition group"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-white truncate">{t.prompt_title}</h3>
                  <span className="text-xs text-gray-600 shrink-0">{t.created_at}</span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">{t.prompt}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={() => handleEdit(t)}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-purple-400 hover:bg-gray-800 transition"
                  title="Edit template"
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition"
                  title="Delete template"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Dialog */}
      {dialogOpen && (
        <TemplateFormDialog
          initial={editingTemplate}
          onSave={handleSave}
          onCancel={() => { setDialogOpen(false); setEditingTemplate(null); }}
        />
      )}
    </div>
  );
}


function TemplateFormDialog({ initial, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.prompt_title || "");
  const [prompt, setPrompt] = useState(initial?.prompt || "");

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !prompt.trim()) return;
    onSave({ prompt_title: title.trim(), prompt: prompt.trim() });
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
        {/* Dialog Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">
            {initial ? "Edit Template" : "New Prompt Template"}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-300 transition"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Template Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Code Reviewer, Summarizer..."
              className="w-full text-sm bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-gray-200 placeholder-gray-600 outline-none focus:border-purple-500 transition"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Prompt</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Enter your prompt template text..."
              rows={5}
              className="w-full text-sm bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-gray-200 placeholder-gray-600 outline-none focus:border-purple-500 transition resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="text-sm px-4 py-2 rounded-xl border border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !prompt.trim()}
              className="text-sm bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl transition font-medium"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
