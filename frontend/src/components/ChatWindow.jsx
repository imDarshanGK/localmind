import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { useState, useRef, useEffect } from "react";
import { exportSession } from "../utils/api";
import { AppLogoIcon, ChartIcon, CloseIcon, CopyIcon, FileIcon, LockIcon, PlusCircleIcon, TemplateIcon } from "./Icons";
import PromptTemplateDialog from "./PromptTemplateDialog";

export default function ChatWindow({ messages = [], loading = false, onSend, onDeleteMessage, onStop, sessionId, minimalMode }) {
  // Persistent draft input state initialized from localStorage
  const [input, setInput] = useState(() => {
    if (!sessionId) return "";
    return localStorage.getItem(`localmind_draft_${sessionId}`) || "";
  });

  // Persistent search filter term initialized from localStorage
  const [searchTerm, setSearchTerm] = useState(() => {
    if (!sessionId) return "";
    return localStorage.getItem(`localmind_search_${sessionId}`) || "";
  });

  const [copiedId, setCopiedId] = useState(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [localReactions, setLocalReactions] = useState({});
  const [hoveredStatsId, setHoveredStatsId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const plusMenuRef = useRef(null);

  const REACTION_EMOJIS = ["👍", "❤️", "🔥", "👏", "💡"];

  // Re-sync input and search state whenever sessionId changes
  useEffect(() => {
    if (!sessionId) return;
    setInput(localStorage.getItem(`localmind_draft_${sessionId}`) || "");
    SearchTerm(localStorage.getItem(`localmind_search_${sessionId}`) || "");
  }, [sessionId]);

  // Sync draft message input to localStorage on edit
  useEffect(() => {
    if (!sessionId) return;
    if (input) {
      localStorage.setItem(`localmind_draft_${sessionId}`, input);
    } else {
      localStorage.removeItem(`localmind_draft_${sessionId}`);
    }
  }, [input, sessionId]);

  // Sync search filter query to localStorage
  useEffect(() => {
    if (!sessionId) return;
    if (searchTerm) {
      localStorage.setItem(`localmind_search_${sessionId}`, searchTerm);
    } else {
      localStorage.removeItem(`localmind_search_${sessionId}`);
    }
  }, [searchTerm, sessionId]);

  useEffect(() => {
    const hasSelection = window.getSelection()?.toString();
    if (!hasSelection) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => { setLocalReactions({}); }, [sessionId]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target)) {
        setShowPlusMenu(false);
      }
    }
    if (showPlusMenu) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPlusMenu]);

  async function handleReactionToggle(messageId, emoji) {
    if (!messageId || typeof messageId === "string") {
      console.warn("Cannot react: Message ID is not persistently synchronized yet.");
      return;
    }
    try {
      const res = await toggleMessageReaction(messageId, emoji);
      if (res?.success) {
        setLocalReactions(prev => ({
          ...prev,
          [messageId]: res.reactions
        }));
      }
    } catch (err) {
      console.error("Failed to toggle reaction:", err);
    }
  }

  const renderReactionsBar = (msg) => {
    const activeReactions = localReactions[msg.id] ?? msg.reactions ?? [];
    
    return (
      <div className="flex items-center gap-1.5 mt-1 flex-wrap" role="group" aria-label="Message reactions">
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
                title={`Remove reaction ${emoji} (${count})`}
                aria-label={`Remove reaction ${emoji}, count ${count}`}
              >
                <span>{emoji}</span>
                <span className="text-[10px] font-bold opacity-80">{count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 bg-gray-900 border border-gray-800 rounded-full px-1 py-0.5 shadow-md gap-0.5">
          {REACTION_EMOJIS.map(emoji => {
            const isSelected = activeReactions.includes(emoji);
            return (
              <button
                key={emoji}
                onClick={() => handleReactionToggle(msg.id, emoji)}
                className={`p-1 text-xs hover:scale-125 transition-transform rounded-full ${isSelected ? 'bg-purple-500/20' : 'hover:bg-gray-800'}`}
                title={`React with ${emoji}`}
                aria-label={`React with ${emoji}`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDeleteControl = (msgId) =>
    confirmDeleteId === msgId ? (
      <span className="flex items-center gap-1 text-xs" role="group" aria-label="Confirm deletion">
        <span className="text-gray-500">Delete?</span>
        <button
          onClick={() => { onDeleteMessage?.(msgId); setConfirmDeleteId(null); }}
          className="px-2 py-0.5 rounded bg-red-600/80 hover:bg-red-600 text-white transition min-h-[28px]"
          title="Permanently delete this message"
          aria-label="Confirm delete message"
        >Yes</button>
        <button
          onClick={() => setConfirmDeleteId(null)}
          className="px-2 py-0.5 rounded hover:bg-gray-700 text-gray-400 transition min-h-[28px]"
          title="Cancel deletion"
          aria-label="Cancel message deletion"
        >No</button>
      </span>
    ) : (
      <button
        onClick={() => setConfirmDeleteId(msgId)}
        className="p-1.5 sm:p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-red-400 transition"
        title="Delete message"
        aria-label="Delete message"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
      </button>
    );

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

    onSend(message);

    setInput("");
    setSelectedTemplate(null);
    
    // Clear draft from localStorage upon successful send
    if (sessionId) {
      localStorage.removeItem(`localmind_draft_${sessionId}`);
    }

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { 
      e.preventDefault(); 
      send(); 
    } else if (e.key === "Escape") {
      if (input) {
        setInput("");
      } else {
        textareaRef.current?.blur();
      }
    }
  }

  const handleCopy = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const handleRegenerate = (currentIndex) => {
    for (let idx = currentIndex - 1; idx >= 0; idx--) {
      if (messages[idx].role === "user") {
        onSend(messages[idx].content);
        break;
      }
    }
  };

  const handleExportSingleMessage = (text, index) => {
    const element = document.createElement("a");
    const file = new Blob([text], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = `localmind_message_${index + 1}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  function handleSuggestionClick(text) {
    setInput(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
      setTimeout(() => {
        if (!textareaRef.current) return;
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
      }, 0);
    }
  }

  function handleSuggestionKeyDown(e, index) {
    const pills = document.querySelectorAll('[data-testid="suggestion-pill"]');
    if (!pills.length) return;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = (index + 1) % pills.length;
      pills[nextIndex]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = (index - 1 + pills.length) % pills.length;
      pills[prevIndex]?.focus();
    }
  }

  const SUGGESTIONS = [
    "Summarize the uploaded document",
    "What are the key points?",
    "Explain in simple terms",
    "List the main topics",
  ];

  const filteredMessages = messages.filter((msg) =>
    msg.content?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="flex flex-col flex-1 overflow-hidden bg-gray-950 text-gray-100" aria-label="Chat Workspace">
      {/* Export bar */}
      {messages.length > 0 && (
        <header className="flex justify-end gap-1.5 sm:gap-2 px-3 sm:px-5 pt-2 flex-wrap" aria-label="Export options">
          {["markdown", "json", "txt"].map((f) => (
            <button
              key={f}
              onClick={() => exportSession(sessionId, f)}
              className="text-xs text-gray-500 hover:text-purple-400 transition px-2 py-1 rounded hover:bg-gray-800 min-h-[32px] sm:min-h-0"
              title={`Export full conversation as .${f}`}
              aria-label={`Export session as ${f}`}
            >
              ↓ .{f}
            </button>
          ))}
        </header>
      )}

      {/* Search Bar Landmark */}
      {messages.length > 0 && (
        <section className="px-3 sm:px-4 pt-2" role="search" aria-label="Message search">
          <input
            type="text"
            placeholder="Search messages..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
            title="Type to filter conversation messages"
            aria-label="Search conversation messages"
          />

          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="text-xs text-purple-400 mt-1"
              title="Clear search query"
              aria-label="Clear search filter"
            >
              Clear search
            </button>
          )}
        </section>
      )}

      {/* Messages Viewport Landmark */}
      <section 
        className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-4 sm:space-y-5" 
        data-testid="messages-viewport"
        role="log"
        aria-live="polite"
        aria-label="Chat messages history"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-2">
            <AppLogoIcon className="w-12 h-12 sm:w-14 sm:h-14 text-purple-400 opacity-70" aria-hidden="true" />
            <div>
              <p className="text-lg sm:text-xl font-semibold text-gray-200 mb-1">LocalMind is ready</p>
              <p className="text-xs sm:text-sm text-gray-400">100% private · runs offline · no cloud</p>
            </div>

            {/* Feature Guidance Highlights */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-gray-400 max-w-md my-1">
              <span className="bg-gray-900 border border-gray-800 rounded-full px-3 py-1">
                💡 Select a suggestion below
              </span>
              <span className="bg-gray-900 border border-gray-800 rounded-full px-3 py-1">
                📄 Upload documents to query
              </span>
              <span className="bg-gray-900 border border-gray-800 rounded-full px-3 py-1">
                🔒 Encrypted & Local
              </span>
            </div>

            {!minimalMode && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 sm:mt-4 max-w-lg w-full" role="group" aria-label="Prompt suggestions">
                {SUGGESTIONS.map((s, index) => (
                  <button
                    key={s}
                    data-testid="suggestion-pill"
                    onClick={() => handleSuggestionClick(s)}
                    onKeyDown={(e) => handleSuggestionKeyDown(e, index)}
                    className="text-xs text-left border border-gray-800 rounded-xl px-3 py-2.5 text-gray-400 hover:border-purple-600 hover:text-purple-300 hover:bg-purple-900/20 focus:outline-none focus:ring-2 focus:ring-purple-500 transition min-h-[40px] sm:min-h-0"
                    title={`Insert prompt: "${s}"`}
                    aria-label={`Suggestion: ${s}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages list */}
        {filteredMessages.map((msg, i) => {
          const messageId = msg.id || i;
          return (
            <article 
              key={messageId} 
              className={`flex group ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              aria-label={`${msg.role === "user" ? "User" : "Assistant"} message`}
            >
              <div className="max-w-[88%] sm:max-w-2xl">
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-2 mb-1.5 ml-1 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <AppLogoIcon className="w-4 h-4 text-purple-400" aria-hidden="true" />
                      <span className="text-xs font-semibold text-purple-400">LocalMind</span>
                    </div>
                    {(msg.token_count > 0 || (!msg.streaming && msg.content)) && (
                      <span 
                        className="text-[10px] bg-purple-950/60 text-purple-300 border border-purple-800/40 font-mono px-1.5 py-0.5 rounded-md shadow-sm"
                        title="Approximate token count for this response"
                      >
                        {(msg.token_count > 0 ? msg.token_count : (msg.content ? Math.round(msg.content.trim().split(/\s+/).length * 1.3) : 0))} tokens
                      </span>
                    )}
                    {msg.streaming && <span className="text-xs text-gray-400 animate-pulse">typing...</span>}
                  </div>
                )}
                <div className={`px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words
                  ${msg.role === "user"
                    ? "bg-purple-700 text-white rounded-br-sm"
                    : "bg-gray-800 text-gray-100 rounded-bl-sm border border-gray-700"}`}>
                  <ReactMarkdown
                    rehypePlugins={[rehypeSanitize]}
                    components={{
                      code({ inline, className, children }) {
                        let language = "text";
                        const match = /language-(\w+)/.exec(className || "");
                        if (match) {
                          language = match[1];
                        } else {
                          const codeText = String(children);
                          if (codeText.includes("def ") || codeText.includes("print(")) {
                            language = "python";
                          } else if (codeText.includes("function") || codeText.includes("console.log")) {
                            language = "javascript";
                          } else if (codeText.includes("#include") || codeText.includes("cout")) {
                            language = "cpp";
                          }
                        }

                        if (inline) {
                          return <code>{children}</code>;
                        }

                        return (
                          <div className="relative bg-gray-900 rounded-lg mt-2">
                            <div className="absolute top-2 right-2 text-xs bg-gray-700 px-2 py-1 rounded text-white">
                              {language.toUpperCase()}
                            </div>
                            <pre className="p-3 sm:p-4 overflow-x-auto text-xs sm:text-sm">
                              <code>{children}</code>
                            </pre>
                          </div>
                        );
                      }
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                  {msg.streaming && <span className="inline-block w-1.5 h-4 bg-purple-400 ml-1 animate-pulse rounded" aria-hidden="true" />}
                </div>

                {msg.sources?.length > 0 && (() => {
                  const normalizeSrc = (s) => typeof s === "string" ? { source: s, chunk: null, preview: null } : s;
                  return (
                    <div className="mt-1.5 ml-1 flex flex-wrap gap-1.5" aria-label="Referenced sources">
                      {msg.sources.map((raw, idx) => {
                        const s = normalizeSrc(raw);
                        const hasPreview = s.preview && s.preview.trim().length > 0;
                        return (
                          <span key={idx} className="relative group inline-flex">
                            <span 
                              className="text-xs bg-gray-800 text-blue-400 px-2 py-0.5 rounded-full border border-gray-700 cursor-default inline-flex items-center gap-1 group-hover:border-blue-500 group-hover:bg-gray-750 transition-colors"
                              title={`Referenced document source: ${s.source}`}
                            >
                              <FileIcon className="w-3 h-3 shrink-0" aria-hidden="true" />
                              <span className="max-w-[120px] sm:max-w-none truncate">{s.source}</span>
                              {s.chunk !== null && <span className="text-gray-500 text-[10px]">#{s.chunk + 1}</span>}
                            </span>
                            {hasPreview && (
                              <div className="absolute bottom-full left-0 mb-2 z-50 w-64 sm:w-72 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-150 pointer-events-none">
                                <div className="absolute left-3 -bottom-1.5 w-3 h-3 rotate-45 bg-gray-700 border-r border-b border-gray-600" />
                                <div className="relative bg-gray-700 border border-gray-600 rounded-xl shadow-xl px-3 py-2.5">
                                  <div className="flex items-center gap-1.5 mb-1.5 border-b border-gray-600 pb-1.5">
                                    <FileIcon className="w-3 h-3 text-blue-400 shrink-0" aria-hidden="true" />
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

                {/* Embedded Action Toolbar */}
                {!msg.streaming && (
                  <div className={`flex items-center gap-3 mt-1.5 px-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200
                    ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <button 
                      onClick={() => handleCopy(messageId, msg.content)}
                      className="text-[11px] text-gray-500 hover:text-purple-400 transition-colors p-1"
                      title="Copy message text to clipboard"
                      aria-label="Copy message text"
                    >
                      {copiedId === messageId ? "✓ Copied" : "Copy"}
                    </button>
                    
                    {msg.role === "assistant" && (
                      <button 
                        onClick={() => handleRegenerate(i)}
                        disabled={loading}
                        className="text-[11px] text-gray-500 hover:text-purple-400 transition-colors disabled:opacity-30 p-1"
                        title="Regenerate this response"
                        aria-label="Regenerate assistant response"
                      >
                        Regenerate
                      </button>
                    )}
                    
                    <button 
                      onClick={() => handleExportSingleMessage(msg.content, i)}
                      className="text-[11px] text-gray-500 hover:text-purple-400 transition-colors p-1"
                      title="Save message content as a text file"
                      aria-label="Export message"
                    >
                      Export
                    </button>
                  </div>
                )}

                {msg.role === "user" && (
                  <div className="flex justify-end items-center gap-1 mt-1 mr-1">
                    {renderDeleteControl(msg.id)}
                    <span className="text-xs text-gray-400">You</span>
                  </div>
                )}

                {msg.role === "assistant" && !msg.streaming && (
                  <div className="flex justify-end mt-1.5 mr-1 items-center gap-1 flex-wrap">
                    {renderReactionsBar(msg)}
                    <button
                      onClick={() => handleCopy(messageId, msg.content)}
                      className="p-1.5 sm:p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition"
                      title="Copy response to clipboard"
                      aria-label="Copy assistant response"
                    >
                      {copiedId === messageId ? (
                        <svg className="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                      ) : (
                        <CopyIcon className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                    {renderDeleteControl(msg.id)}
                    <div className="relative" onMouseEnter={() => setHoveredStatsId(msg.id)} onMouseLeave={() => setHoveredStatsId(null)}>
                      <button 
                        className="p-1.5 sm:p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition" 
                        title="View inference performance metrics" 
                        aria-label="Performance stats"
                      >
                        <ChartIcon className="w-4 h-4" aria-hidden="true" />
                      </button>
                      {hoveredStatsId === msg.id && msg.benchmarks && Object.keys(msg.benchmarks).length > 0 && (
                        <div className="absolute right-0 bottom-0 translate-x-full pl-2 z-50">
                          <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl min-w-[200px] sm:min-w-[220px]">
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
                                <div className="flex justify-between items-center">
                                  <span>RAM usage</span>
                                  <span className="text-gray-300">{msg.benchmarks.memory_used_gb} / {msg.benchmarks.memory_total_gb} GB</span>
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
            </article>
          );
        })}

        {filteredMessages.length === 0 && messages.length > 0 && (
          <p className="text-center text-gray-500 text-sm mt-4">No messages found</p>
        )}

        {/* Loading Skeleton Placeholder */}
        {Boolean(loading) && !messages.some(m => m.streaming) && (
          <div className="flex justify-start" data-testid="message-skeleton" aria-label="Loading message response">
            <div className="w-full max-w-md bg-gray-800/80 border border-gray-700/80 px-4 py-3 rounded-2xl rounded-bl-sm animate-pulse space-y-2.5">
              <div className="flex items-center gap-1.5 mb-2">
                <AppLogoIcon className="w-4 h-4 text-purple-400/60" aria-hidden="true" />
                <span className="text-xs font-semibold text-purple-400/60">LocalMind</span>
              </div>
              <div className="h-3.5 bg-gray-700 rounded-full w-3/4" />
              <div className="h-3.5 bg-gray-700 rounded-full w-1/2" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </section>

      {/* Input Panel Landmark */}
      <footer className="px-2 sm:px-4 pb-3 sm:pb-4 pt-2 shrink-0">
        <form 
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex items-end gap-2 bg-gray-900 border border-gray-700 rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 focus-within:border-purple-500 transition-colors"
          aria-label="Message composer"
        >
          <div className="relative" ref={plusMenuRef}>
            <button
              type="button"
              onClick={() => setShowPlusMenu(!showPlusMenu)}
              className="text-gray-400 hover:text-purple-400 p-1 rounded-lg transition"
              title="Open action menu (templates, extensions)"
              aria-label="Add action menu"
              aria-expanded={showPlusMenu}
            >
              <PlusCircleIcon className="w-5 h-5" aria-hidden="true" />
            </button>

            {showPlusMenu && (
              <div className="absolute bottom-10 left-0 bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-1 z-20 min-w-[160px]" role="menu">
                <button
                  type="button"
                  onClick={() => setShowTemplateDialog(true)}
                  className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 rounded-lg flex items-center gap-2 transition"
                  title="Browse prompt templates"
                  role="menuitem"
                >
                  <TemplateIcon className="w-4 h-4 text-purple-400" aria-hidden="true" />
                  Prompt Templates
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col gap-1.5">
            {selectedTemplate && (
              <div className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2.5 py-1 w-fit">
                <TemplateIcon className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />
                <span className="text-xs text-gray-300 truncate max-w-[150px] sm:max-w-xs">{selectedTemplate.prompt_title}</span>
                <button 
                  type="button" 
                  onClick={() => setSelectedTemplate(null)} 
                  className="text-gray-500 hover:text-gray-300 transition"
                  title="Remove template"
                  aria-label="Remove selected prompt template"
                >
                  <CloseIcon className="w-3 h-3" aria-hidden="true" />
                </button>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={loading ? "LocalMind is computing..." : "Ask anything... (Enter to send)"}
              rows={1}
              disabled={loading}
              className="bg-transparent text-sm text-gray-100 placeholder-gray-500 resize-none outline-none w-full disabled:text-gray-500"
              style={{ minHeight: "24px", maxHeight: "160px" }}
              title="Chat input area (Enter to send, Shift+Enter for new line)"
              aria-label="Type your message"
            />
          </div>

          {loading ? (
            <button 
              type="button" 
              onClick={onStop} 
              className="shrink-0 text-xs sm:text-sm bg-red-600 hover:bg-red-500 text-white px-3 sm:px-4 py-2 rounded-xl transition font-medium flex items-center gap-1.5 min-h-[36px] sm:min-h-0"
              title="Stop response generation"
              aria-label="Stop generation"
            >
              <span className="w-2 h-2 bg-white rounded-sm" aria-hidden="true" />
              Stop
            </button>
          ) : (
            <button 
              type="submit" 
              disabled={!input.trim() && !selectedTemplate} 
              className="shrink-0 text-xs sm:text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 sm:px-4 py-2 rounded-xl transition font-medium min-h-[36px] sm:min-h-0"
              title="Send message (Enter)"
              aria-label="Send message"
            >
              Send →
            </button>
          )}
        </form>
        
        <p className="text-center text-[10px] sm:text-xs text-gray-700 mt-1.5 sm:mt-2">
          <span 
            className="inline-flex items-center gap-1"
            title="Privacy notice: All data is processed locally on your device"
          >
            <LockIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
            <span>Everything is processed locally. No data leaves your machine.</span>
          </span>
        </p>
      </footer>

      {showTemplateDialog && (
        <PromptTemplateDialog
          onClose={() => setShowTemplateDialog(false)}
          onSelect={handleSelectTemplate}
        />
      )}
    </main>
  );
}