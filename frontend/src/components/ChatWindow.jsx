import { useState, useRef, useEffect } from "react";
import { exportSession } from "../utils/api";
import { AppLogoIcon, CloseIcon, FileIcon, LockIcon, PlusCircleIcon, TemplateIcon } from "./Icons";
import CodeBlockWithCopy from "./CodeBlockWithCopy";
import PromptTemplateDialog from "./PromptTemplateDialog";

export default function ChatWindow({ messages, loading, onSend, sessionId }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  // NEW: state for selected messages and export format
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [exportFormat, setExportFormat] = useState("markdown");

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
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  // Parse code blocks for copy button
  function parseMessageWithCodeBlocks(content) {
    if (!content) return [{ type: "text", content: "" }];
    const parts = [];
    const regex = /```(\w*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", content: content.slice(lastIndex, match.index) });
      }
      parts.push({
        type: "code",
        language: match[1] || "text",
        code: match[2].trim()
      });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      parts.push({ type: "text", content: content.slice(lastIndex) });
    }
    if (parts.length === 0) {
      parts.push({ type: "text", content });
    }
    return parts;
  }

  function send() {
    if ((!input.trim() && !selectedTemplate) || loading) return;
    const message = selectedTemplate
      ? `${selectedTemplate.prompt}\n\n${input.trim()}`.trim()
      : input.trim();
    onSend(message);
    setInput("");
    if (textareaRef.current) { 
      textareaRef.current.style.height = "auto"; 
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { 
      e.preventDefault(); 
      send(); 
    }
  }

  function autoResize(e) {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  }

  // Message selection and export
  const toggleSelectMessage = (msgId) => {
    setSelectedMessages(prev =>
      prev.includes(msgId) ? prev.filter(id => id !== msgId) : [...prev, msgId]
    );
  };

  const handleExportSelected = async () => {
    if (selectedMessages.length === 0) return;
    try {
      const response = await fetch("/api/export/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_ids: selectedMessages, format: exportFormat }),
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `localmind_export.${exportFormat === "markdown" ? "md" : exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to export messages");
    }
  };

  const exportSingleMessage = async (msgId) => {
    try {
      const response = await fetch("/api/export/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_ids: [msgId], format: exportFormat }),
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `localmind_message_${msgId}.${exportFormat === "markdown" ? "md" : exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to export message");
    }
  };

  const SUGGESTIONS = [
    "Summarize the uploaded document",
    "What are the key points?",
    "Explain in simple terms",
    "List the main topics",
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-gray-950">
      {/* Export bar – existing for whole session + new selection bar */}
      {messages.length > 0 && (
        <div className="flex justify-end gap-2 px-5 pt-2">
          {["markdown", "json", "txt"].map(f => (
            <button 
              key={f} 
              onClick={() => exportSession(sessionId, f)}
              className="text-xs text-gray-500 hover:text-purple-400 transition px-2 py-1 rounded hover:bg-gray-800"
            >
              ↓ .{f}
            </button>
          ))}
        </div>
      )}

      {/* Export selection bar */}
      {selectedMessages.length > 0 && (
        <div className="flex justify-between items-center px-5 py-2 bg-gray-900 border-b border-gray-800">
          <span className="text-sm text-gray-300">{selectedMessages.length} message(s) selected</span>
          <div className="flex gap-2 items-center">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              className="text-xs bg-gray-800 text-gray-200 border border-gray-700 rounded px-2 py-1"
            >
              <option value="markdown">Markdown (.md)</option>
              <option value="json">JSON (.json)</option>
              <option value="txt">Text (.txt)</option>
            </select>
            <button
              onClick={handleExportSelected}
              className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded"
            >
              Export Selected
            </button>
            <button
              onClick={() => setSelectedMessages([])}
              className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1"
            >
              Clear
            </button>
          </div>
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
                <button 
                  key={s} 
                  onClick={() => onSend(s)}
                  className="text-xs text-left border border-gray-800 rounded-xl px-3 py-2.5 text-gray-400 hover:border-purple-600 hover:text-purple-300 hover:bg-purple-900/20 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={msg.id || i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {/* Checkbox for selection */}
            <div className="mr-2 self-center">
              <input
                type="checkbox"
                checked={selectedMessages.includes(msg.id)}
                onChange={() => toggleSelectMessage(msg.id)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-1"
              />
            </div>
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
                {msg.role === "user" ? (
                  <>
                    {msg.content}
                    {msg.streaming && <span className="inline-block w-1.5 h-4 bg-purple-400 ml-1 animate-pulse rounded" />}
                  </>
                ) : (
                  <>
                    {parseMessageWithCodeBlocks(msg.content).map((part, idx) => (
                      part.type === "code" ? (
                        <CodeBlockWithCopy key={idx} code={part.code} language={part.language} />
                      ) : (
                        <div key={idx} className="whitespace-pre-wrap">{part.content}</div>
                      )
                    ))}
                    {msg.streaming && <span className="inline-block w-1.5 h-4 bg-purple-400 ml-1 animate-pulse rounded" />}
                  </>
                )}
              </div>

              {msg.sources?.length > 0 && (
                <div className="mt-1.5 ml-1 flex flex-wrap gap-1">
                  {msg.sources.map((s, idx) => (
                    <span key={idx} className="text-xs bg-gray-800 text-blue-400 px-2 py-0.5 rounded-full border border-gray-700">
                      <span className="inline-flex items-center gap-1">
                        <FileIcon className="w-3 h-3" />
                        <span>{s}</span>
                      </span>
                    </span>
                  ))}
                </div>
              )}
              {msg.role === "user" && (
                <div className="text-right mt-1 mr-1 flex justify-end items-center gap-2">
                  <span className="text-xs text-gray-600">You</span>
                  {/* Per-message export button */}
                  <button
                    onClick={() => exportSingleMessage(msg.id)}
                    className="text-xs text-gray-500 hover:text-purple-400 transition"
                    title="Export this message"
                  >
                    ↓
                  </button>
                </div>
              )}
              {msg.role === "assistant" && (
                <div className="flex justify-end mt-1 mr-1">
                  <button
                    onClick={() => exportSingleMessage(msg.id)}
                    className="text-xs text-gray-500 hover:text-purple-400 transition"
                    title="Export this message"
                  >
                    ↓
                  </button>
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
                {[0, 1, 2].map(i => (
                  <div 
                    key={i} 
                    className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} 
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Form Footer */}
      <div className="px-4 pb-4 pt-2 shrink-0">
        <div className="flex items-end gap-2 bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3 focus-within:border-purple-500 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(e); }}
            onKeyDown={handleKey}
            placeholder="Ask anything... (Enter to send, Shift+Enter for new line)"
            rows={1}
            className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 resize-none outline-none"
            style={{ minHeight: "24px", maxHeight: "160px" }}
          />
          <button 
            onClick={send} 
            disabled={!input.trim() || loading}
            className="shrink-0 text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl transition font-medium"
          >
            Send →
          </button>
        </div>
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