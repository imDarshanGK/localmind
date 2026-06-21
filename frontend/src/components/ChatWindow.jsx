import ReactMarkdown from "react-markdown";
import { useState, useRef, useEffect } from "react";
import { exportSession } from "../utils/api";
import { AppLogoIcon, ChartIcon, CloseIcon, CopyIcon, FileIcon, LockIcon, PlusCircleIcon, TemplateIcon } from "./Icons";
import PromptTemplateDialog from "./PromptTemplateDialog";

export default function ChatWindow({ messages, loading, onSend, onDeleteMessage, onStop, sessionId }) {
  const [input, setInput] = useState("");
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const plusMenuRef = useRef(null);

  // Local optimization tracking map state for instant UI reaction counts
  const [localReactions, setLocalReactions] = useState({});

  // NEW: state for selected messages and export format
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [exportFormat, setExportFormat] = useState("markdown");
  const [copiedMsgId, setCopiedMsgId] = useState(null);
  const [hoveredStatsId, setHoveredStatsId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Standard reaction picker configurations
  const REACTION_EMOJIS = ["👍", "❤️", "🔥", "👏", "💡"];

  // Toggle reaction execution sync handler
  // Toggle reaction execution sync handler
  async function handleReactionToggle(messageId, emoji) {
    // FIX: If messageId is missing, a string, or undefined, stop right here!
    if (!messageId || typeof messageId === "string") {
      console.warn("Cannot react: Message ID is not persistently synchronized yet.");
      return;
    }
    try {
      const res = await toggleMessageReaction(messageId, emoji);
      if (res.success) {
        setLocalReactions(prev => ({
          ...prev,
          [messageId]: res.reactions
        }));
      }
    } catch (err) {
      console.error("Failed to toggle reaction:", err);
    }
  }

  // Render method for displaying row of interactive emoji options or counters
  const renderReactionsBar = (msg) => {
    const activeReactions = localReactions[msg.id] ?? msg.reactions ?? [];
    
    return (
      <div className="flex items-center gap-1.5 mt-1">
        {/* Render existing active badges */}
        {activeReactions.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mr-1">
            {Object.entries(
              activeReactions.reduce((acc, emoji) => {
                acc[emoji] = (acc[emoji] || 0) + 1;
                return acc;
              }, {})
            ).map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => handleReactionToggle(msg.id, emoji)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs bg-purple-950/40 border border-purple-500/30 text-purple-300 hover:bg-purple-900/30 transition"
              >
                <span>{emoji}</span>
                <span className="text-[10px] font-bold opacity-80">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Emoji Selector Picker Bar Row */}
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gray-900 border border-gray-800 rounded-full px-1 py-0.5 shadow-md gap-0.5">
          {REACTION_EMOJIS.map(emoji => {
            const isSelected = activeReactions.includes(emoji);
            return (
              <button
                key={emoji}
                onClick={() => handleReactionToggle(msg.id, emoji)}
                className={`p-0.5 text-xs hover:scale-125 transition-transform rounded-full ${isSelected ? 'bg-purple-500/20' : 'hover:bg-gray-800'}`}
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Inline delete control with a lightweight two-step confirm (no window.confirm).
  const renderDeleteControl = (msgId) =>
    confirmDeleteId === msgId ? (
      <span className="flex items-center gap-1 text-xs">
        <span className="text-gray-500">Delete?</span>
        <button
          onClick={() => { onDeleteMessage?.(msgId); setConfirmDeleteId(null); }}
          className="px-1.5 py-0.5 rounded bg-red-600/80 hover:bg-red-600 text-white transition"
          title="Confirm delete"
        >Yes</button>
        <button
          onClick={() => setConfirmDeleteId(null)}
          className="px-1.5 py-0.5 rounded hover:bg-gray-700 text-gray-400 transition"
          title="Cancel"
        >No</button>
      </span>
    ) : (
      <button
        onClick={() => setConfirmDeleteId(msgId)}
        className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-red-400 transition"
        title="Delete message"
        aria-label="Delete message"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
      </button>
    );

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Reset local adjustments layout cache map when active conversation session changes
  useEffect(() => { setLocalReactions({}); }, [sessionId]);

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

  function copyToClipboard(msgId, content) {
    navigator.clipboard.writeText(content);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  }

  function handleSelectTemplate(template) {
    setSelectedTemplate(template);
    setShowTemplateDialog(false);
    setShowPlusMenu(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function send() {
    if ((!input.trim() && !selectedTemplate) || loading) return;

    const message = selectedTemplate
      ? `${selectedTemplate.prompt}\n\n${input.trim()}`.trim()
      : input.trim();

    onSend(message);   // ✅ ONLY THIS (STRING)

    setInput("");
    setSelectedTemplate(null);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
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
    <div className="flex flex-col flex-1 overflow-hidden bg-gray-950 text-gray-100">
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

      {/* Messages viewport */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <AppLogoIcon className="w-14 h-14 text-purple-400 opacity-70" />
            <div>
              <p className="text-xl font-semibold text-gray-200 mb-1">LocalMind is ready</p>
              <p className="text-sm text-gray-400">100% private · runs offline · no cloud</p>
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
          <div key={msg.id || i} className={`flex group ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-2xl">
              {msg.role === "assistant" && (
                <div className="flex items-center gap-1.5 mb-1.5 ml-1">
                  <AppLogoIcon className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-purple-400">LocalMind</span>
                  {msg.streaming && <span className="text-xs text-gray-400 animate-pulse">typing...</span>}
                </div>
              )}
              <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words
                ${msg.role === "user"
                  ? "bg-purple-700 text-white rounded-br-sm"
                  : "bg-gray-800 text-gray-100 rounded-bl-sm border border-gray-700"}`}>
                <ReactMarkdown
                  components={{
                    code({ inline, className, children }) {
                      let language = "text";

                      //  Detect from markdown (```python)
                      const match = /language-(\w+)/.exec(className || "");
                      if (match) {
                        language = match[1];
                      } 
                      //  Fallback detection (SMART 🔥)
                      else {
                        const codeText = String(children);

                        if (codeText.includes("def ") || codeText.includes("print(")) {
                          language = "python";
                        } else if (
                            codeText.includes("function") ||
                            codeText.includes("console.log")
                        ) {
                            language = "javascript";
                        } else if (
                            codeText.includes("#include") ||
                            codeText.includes("cout")
                        ) {
                            language = "cpp";
                          }
                        }

                        // Inline code (no badge)
                        if (inline) {
                          return <code>{children}</code>;
                        }

                        return (
                          <div className="relative bg-gray-900 rounded-lg mt-2">
          
                            {/* 🔥 LANGUAGE BADGE */}
                            <div className="absolute top-2 right-2 text-xs bg-gray-700 px-2 py-1 rounded text-white">
                              {language.toUpperCase()}
                            </div>

                            <pre className="p-4 overflow-x-auto">
                              <code>{children}</code>
                            </pre>
                          </div>
                        );
                      }
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                {msg.streaming && <span className="inline-block w-1.5 h-4 bg-purple-400 ml-1 animate-pulse rounded" />}
              </div>
              {msg.sources?.length > 0 && (() => {
                // Normalize: legacy string sources ("file.pdf") → structured object.
                // New sources already arrive as {source, chunk, preview}.
                // This single path handles both without any database migration.
                const normalizeSrc = (s) =>
                  typeof s === "string"
                    ? { source: s, chunk: null, preview: null }
                    : s;

                return (
                  <div className="mt-1.5 ml-1 flex flex-wrap gap-1.5">
                    {msg.sources.map((raw, i) => {
                      const s = normalizeSrc(raw);
                      const hasPreview = s.preview && s.preview.trim().length > 0;
                      return (
                        <span key={i} className="relative group inline-flex">
                          {/* Badge */}
                          <span className="text-xs bg-gray-800 text-blue-400 px-2 py-0.5 rounded-full border border-gray-700 cursor-default inline-flex items-center gap-1 group-hover:border-blue-500 group-hover:bg-gray-750 transition-colors">
                            <FileIcon className="w-3 h-3 shrink-0" />
                            <span>{s.source}</span>
                            {s.chunk !== null && (
                              <span className="text-gray-500 text-[10px]">#{s.chunk + 1}</span>
                            )}
                          </span>

                          {/* Hover tooltip — only rendered when a preview exists (new sessions) */}
                          {hasPreview && (
                            <div className="
                              absolute bottom-full left-0 mb-2 z-50 w-72
                              invisible opacity-0 group-hover:visible group-hover:opacity-100
                              transition-all duration-150 pointer-events-none
                            ">
                              {/* Arrow */}
                              <div className="absolute left-3 -bottom-1.5 w-3 h-3 rotate-45 bg-gray-700 border-r border-b border-gray-600" />
                              {/* Card */}
                              <div className="relative bg-gray-700 border border-gray-600 rounded-xl shadow-xl px-3 py-2.5">
                                <div className="flex items-center gap-1.5 mb-1.5 border-b border-gray-600 pb-1.5">
                                  <FileIcon className="w-3 h-3 text-blue-400 shrink-0" />
                                  <span className="text-xs font-semibold text-blue-400 truncate">{s.source}</span>
                                  <span className="ml-auto text-[10px] text-gray-400 shrink-0">chunk {s.chunk + 1}</span>
                                </div>
                                <p className="text-xs text-gray-300 leading-relaxed line-clamp-5 whitespace-pre-wrap break-words">
                                  {s.preview}
                                </p>
                              </div>
                            </div>
                          )}
                        </span>
                      );
                    })}
                  </div>
                );
              })()}
              {msg.role === "user" && (
                <div className="flex justify-end items-center gap-1 mt-1 mr-1">
                  {renderDeleteControl(msg.id)}
                  <span className="text-xs text-gray-400">You</span>
                </div>
              )}
              {msg.role === "assistant" && !msg.streaming && (
                <div className="flex justify-end mt-1.5 mr-1 items-center gap-1">
                  {/* Copy button */}
                  <button
                    onClick={() => copyToClipboard(msg.id, msg.content)}
                    className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition"
                    title="Copy response"
                  >
                    {copiedMsgId === msg.id ? (
                      <svg className="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    ) : (
                      <CopyIcon className="w-4 h-4" />
                    )}
                  </button>

                  {/* Delete button */}
                  {renderDeleteControl(msg.id)}

                  {/* Stats hover button */}
                  <div
                    className="relative"
                    onMouseEnter={() => setHoveredStatsId(msg.id)}
                    onMouseLeave={() => setHoveredStatsId(null)}
                  >
                    <button
                      className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition"
                      title="Performance stats"
                    >
                      <ChartIcon className="w-4 h-4" />
                    </button>

                    {hoveredStatsId === msg.id && msg.benchmarks && Object.keys(msg.benchmarks).length > 0 && (
                      <div className="absolute right-0 bottom-0 translate-x-full pl-2 z-50">
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl min-w-[220px]">
                        <p className="text-xs font-semibold text-gray-300 mb-2">Performance</p>
                        <div className="space-y-1.5 text-xs text-gray-400">
                          <div className="flex justify-between">
                            <span>Time to first token</span>
                            <span className="text-gray-300">{(msg.benchmarks.ttft_ms / 1000).toFixed(2)}s</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Total duration</span>
                            <span className="text-gray-300">{(msg.benchmarks.total_duration_ms / 1000).toFixed(2)}s</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Tokens generated</span>
                            <span className="text-gray-300">{msg.benchmarks.token_count}</span>
                          </div>
                          {msg.benchmarks.memory_used_gb && (
                            <div>
                              <div className="flex justify-between items-center">
                                <span>RAM usage</span>
                                <span className="inline-flex items-center gap-1 text-gray-300">
                                  {msg.benchmarks.memory_used_gb} / {msg.benchmarks.memory_total_gb} GB
                                  <span className="group relative">
                                    <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-gray-600 text-gray-500 text-[9px] font-bold cursor-help leading-none">i</span>
                                    <span className="hidden group-hover:block absolute right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-md px-2 py-1.5 text-[10px] text-gray-400 w-[180px] leading-tight z-50 shadow-lg">
                                      Total system memory in use across all processes, not just the LLM.
                                    </span>
                                  </span>
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                        </div>
                      </div>
                    )}
                  </div>
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

      {/* Input Form Footer */}
      <div className="px-4 pb-4 pt-2 shrink-0">
        <div className="flex items-end gap-2 bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3 focus-within:border-purple-500 transition-colors">
          {/* Plus button for prompt templates */}
          <div className="relative shrink-0" ref={plusMenuRef}>
            <button
              onClick={() => setShowPlusMenu(p => !p)}
              className="p-1 text-gray-500 hover:text-purple-400 transition"
              title="Insert prompt template"
            >
              <PlusCircleIcon className="w-5 h-5" />
            </button>
            {showPlusMenu && (
              <div className="absolute bottom-full mb-2 left-0 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px] z-50">
                <button
                  onClick={() => { setShowTemplateDialog(true); }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-purple-300 transition flex items-center gap-2"
                >
                  <TemplateIcon className="w-4 h-4" />
                  Use Prompt Template
                </button>
              </div>
            )}
          </div>

          {/* Selected template chip */}
          <div className="flex-1 flex flex-col gap-1">
            {selectedTemplate && (
              <div className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2.5 py-1 w-fit">
                <TemplateIcon className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs text-gray-300">{selectedTemplate.prompt_title}</span>
                <button
                  onClick={() => setSelectedTemplate(null)}
                  className="text-gray-500 hover:text-gray-300 transition"
                >
                  <CloseIcon className="w-3 h-3" />
                </button>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); autoResize(e); }}
              onKeyDown={handleKey}
              placeholder={loading ? "LocalMind is computing..." : "Ask anything..."}
              rows={1}
              disabled={loading}
              className="bg-transparent text-sm text-gray-100 placeholder-gray-500 resize-none outline-none w-full disabled:text-gray-500"
              style={{ minHeight: "24px", maxHeight: "160px" }}
            />
          </div>

          {/* DYNAMIC STOP GENERATION RENDERING BUTTON */}
          {loading ? (
            <button 
              type="button"
              onClick={onStop} 
              className="shrink-0 text-sm bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-xl transition font-medium flex items-center gap-1.5"
            >
              <span className="w-2 h-2 bg-white rounded-sm" />
              Stop
            </button>
          ) : (
            <button 
              type="button"
              onClick={send} 
              disabled={!input.trim()}
              className="shrink-0 text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl transition font-medium"
            >
              Send →
            </button>
          )}
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