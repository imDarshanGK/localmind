import { useState, useRef, useEffect } from "react";
import { exportSession } from "../utils/api";
import { AppLogoIcon, CloseIcon, FileIcon, LockIcon, PlusCircleIcon, TemplateIcon } from "./Icons";
import PromptTemplateDialog from "./PromptTemplateDialog";

export default function ChatWindow({ messages, loading, onSend, sessionId }) {
  const [input, setInput] = useState("");
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const plusMenuRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Close plus menu on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target)) {
        setShowPlusMenu(false);
      }
    }
    if (showPlusMenu) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPlusMenu]);

  function handleSelectTemplate(template) {
    setSelectedTemplate(template);
    setShowTemplateDialog(false);
    setShowPlusMenu(false);
    // Focus the textarea so user can start typing right away
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function send() {
    if ((!input.trim() && !selectedTemplate) || loading) return;
    // Prepend the template prompt to the user's input
    const message = selectedTemplate
      ? `${selectedTemplate.prompt}\n\n${input.trim()}`.trim()
      : input.trim();
    onSend(message);
    setInput("");
    setSelectedTemplate(null);
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function autoResize(e) {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  }

  const SUGGESTIONS = [
    "Summarize the uploaded document",
    "What are the key points?",
    "Explain in simple terms",
    "List the main topics",
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-gray-950">
      {/* Export bar */}
      {messages.length > 0 && (
        <div className="flex justify-end gap-2 px-5 pt-2">
          {["markdown","json","txt"].map(f => (
            <button key={f} onClick={() => exportSession(sessionId, f)}
              className="text-xs text-gray-500 hover:text-purple-400 transition px-2 py-1 rounded hover:bg-gray-800">
              ↓ .{f}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <AppLogoIcon className="w-14 h-14 text-purple-400 opacity-70" />
            <div>
              <p className="text-xl font-semibold text-gray-200 mb-1">LocalMind is ready</p>
              <p className="text-sm text-gray-500">100% private · runs offline · no cloud</p>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4 max-w-lg w-full">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => onSend(s)}
                  className="text-xs text-left border border-gray-800 rounded-xl px-3 py-2.5 text-gray-400 hover:border-purple-600 hover:text-purple-300 hover:bg-purple-900/20 transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={msg.id || i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-2xl ${msg.role === "user" ? "max-w-xl" : "max-w-2xl"}`}>
              {msg.role === "assistant" && (
                <div className="flex items-center gap-1.5 mb-1.5 ml-1">
                  <AppLogoIcon className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-purple-400">LocalMind</span>
                  {msg.streaming && <span className="text-xs text-gray-500 animate-pulse">typing...</span>}
                </div>
              )}
              <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words
                ${msg.role === "user"
                  ? "bg-purple-700 text-white rounded-br-sm"
                  : "bg-gray-800 text-gray-100 rounded-bl-sm border border-gray-700"}`}>
                {msg.content}
                {msg.streaming && <span className="inline-block w-1.5 h-4 bg-purple-400 ml-1 animate-pulse rounded" />}
              </div>
              {msg.sources?.length > 0 && (
                <div className="mt-1.5 ml-1 flex flex-wrap gap-1">
                  {msg.sources.map((s,i) => (
                    <span key={i} className="text-xs bg-gray-800 text-blue-400 px-2 py-0.5 rounded-full border border-gray-700">
                      <span className="inline-flex items-center gap-1">
                        <FileIcon className="w-3 h-3" />
                        <span>{s}</span>
                      </span>
                    </span>
                  ))}
                </div>
              )}
              {msg.role === "user" && (
                <div className="text-right mt-1 mr-1">
                  <span className="text-xs text-gray-600">You</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && !messages.find(m => m.streaming) && (
          <div className="flex justify-start">
            <div className="bg-gray-800 border border-gray-700 px-4 py-3 rounded-2xl rounded-bl-sm">
              <div className="flex items-center gap-1.5 mb-1.5">
                <AppLogoIcon className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-semibold text-purple-400">LocalMind</span>
              </div>
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i*0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 shrink-0">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3 focus-within:border-purple-500 transition-colors">
          {/* Template chip */}
          {selectedTemplate && (
            <div className="flex items-center gap-1.5 mb-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-gray-700/70 text-gray-300 px-2.5 py-1 rounded-lg border border-gray-600">
                <TemplateIcon className="w-3.5 h-3.5 text-purple-400" />
                {selectedTemplate.prompt_title}
                <button
                  onClick={() => setSelectedTemplate(null)}
                  className="text-gray-500 hover:text-gray-200 transition ml-0.5"
                  title="Remove template"
                >
                  <CloseIcon className="w-3 h-3" />
                </button>
              </span>
            </div>
          )}
          <div className="flex items-end gap-2">
            {/* Plus button */}
            <div className="relative shrink-0" ref={plusMenuRef}>
              <button
                onClick={() => setShowPlusMenu(prev => !prev)}
                className="text-gray-500 hover:text-purple-400 transition p-1 rounded-lg hover:bg-gray-800"
                title="More options"
              >
                <PlusCircleIcon className="w-5 h-5" />
              </button>
              {showPlusMenu && (
                <div className="absolute bottom-full left-0 mb-2 bg-gray-800 border border-gray-700 rounded-xl shadow-xl py-1 min-w-[200px] z-40">
                  <button
                    onClick={() => { setShowTemplateDialog(true); setShowPlusMenu(false); }}
                    className="w-full text-left text-xs px-4 py-2.5 text-gray-300 hover:bg-gray-700 hover:text-purple-300 transition inline-flex items-center gap-2"
                  >
                    <TemplateIcon className="w-4 h-4" />
                    Use Prompt Template
                  </button>
                </div>
              )}
            </div>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); autoResize(e); }}
              onKeyDown={handleKey}
              placeholder={selectedTemplate ? "Add additional context... (Enter to send)" : "Ask anything... (Enter to send, Shift+Enter for new line)"}
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 resize-none outline-none"
              style={{ minHeight: "24px", maxHeight: "160px" }}
            />
            <button onClick={send} disabled={(!input.trim() && !selectedTemplate) || loading}
              className="shrink-0 text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl transition font-medium">
              Send →
            </button>
          </div>
        </div>

        {/* Template picker dialog */}
        {showTemplateDialog && (
          <PromptTemplateDialog
            onSelect={handleSelectTemplate}
            onClose={() => setShowTemplateDialog(false)}
          />
        )}
        <p className="text-center text-xs text-gray-700 mt-2">
          <span className="inline-flex items-center gap-1">
            <LockIcon className="w-3.5 h-3.5" />
            <span>Everything is processed locally. No data leaves your machine.</span>
          </span>
        </p>
      </div>
    </div>
  );
}
