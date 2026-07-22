import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { useState, useRef, useEffect } from "react";
import { exportSession } from "../utils/api";
import { AppLogoIcon, ChartIcon, CloseIcon, CopyIcon, FileIcon, LockIcon, PlusCircleIcon, TemplateIcon } from "./Icons";
import PromptTemplateDialog from "./PromptTemplateDialog";

export default function ChatWindow({ messages = [], loading = false, onSend, onDeleteMessage, onStop, sessionId, minimalMode }) {
  const [input, setInput] = useState("");
  const [copiedId, setCopiedId] = useState(null); // Tracking temporary copy confirmation state
  const [searchTerm, setSearchTerm] = useState(""); // Issue #275: Message search filter
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const plusMenuRef = useRef(null);

  // --- Issue #267: Smarter Auto-Scroll Pause Routine ---
  useEffect(() => {
    const hasSelection = window.getSelection()?.toString();
    if (!hasSelection) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const [localReactions, setLocalReactions] = useState({});
  const [hoveredStatsId, setHoveredStatsId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const REACTION_EMOJIS = ["👍", "❤️", "🔥", "👏", "💡"];

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
      <div className="flex items-center gap-1.5 mt-1">
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

  const handleCopy = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
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
    <>
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

        {/* Search Bar */}
        {messages.length > 0 && (
          <div className="px-4 pt-2">
            <input
              type="text"
              placeholder="Search messages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="text-xs text-purple-400 mt-1">
                Clear search
              </button>
            )}
          </div>
        )}

        {/* Messages Viewport */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Empty-State Guidance (#543) */}
          {messages.length === 0 && (
            <div 
              data-testid="empty-state-guidance"
              className="flex flex-col items-center justify-center h-full text-center gap-4 py-8"
            >
              <AppLogoIcon className="w-16 h-16 text-purple-400 opacity-80 animate-pulse" />
              <div>
                <p className="text-xl font-semibold text-gray-200 mb-1">LocalMind is ready</p>
                <p className="text-sm text-gray-400">100% private · runs offline · no cloud</p>
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
                <div className="grid grid-cols-2 gap-2 mt-2 max-w-lg w-full">
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => handleSuggestionClick(s)}
                      className="text-xs text-left border border-gray-800 rounded-xl px-3 py-2.5 text-gray-400 hover:border-purple-600 hover:text-purple-300 hover:bg-purple-900/20 transition">
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
              <div key={messageId} className={`flex group ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-2xl">
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-2 mb-1.5 ml-1">
                      <div className="flex items-center gap-1.5">
                        <AppLogoIcon className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-semibold text-purple-400">LocalMind</span>
                      </div>

                      {(msg.token_count > 0 || (!msg.streaming && msg.content)) && (
                        <span className="text-[10px] bg-purple-950/60 text-purple-300 border border-purple-800/40 font-mono px-1.5 py-0.5 rounded-md shadow-sm">
                          {(msg.token_count > 0 ? msg.token_count : (msg.content ? Math.round(msg.content.trim().split(/\s+/).length * 1.3) : 0))} tokens
                        </span>
                      )}

                      {msg.streaming && <span className="text-xs text-gray-400 animate-pulse">typing...</span>}
                    </div>
                  )}

                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words
                    ${msg.role === "user"
                      ? "bg-purple-700 text-white rounded-br-sm"
                      : "bg-gray-800 text-gray-100 rounded-bl-sm border border-gray-700"}`}>
                    <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                      {msg.content}
                    </ReactMarkdown>
                    {msg.streaming && <span className="inline-block w-1.5 h-4 bg-purple-400 ml-1 animate-pulse rounded" />}
                  </div>

                  {msg.sources?.length > 0 && (
                    <div className="mt-1.5 ml-1 flex flex-wrap gap-1">
                      {msg.sources.map((s, idx) => (
                        <span key={idx} className="text-xs bg-gray-800 text-blue-400 px-2 py-0.5 rounded-full border border-gray-700">
                          <span className="inline-flex items-center gap-1">
                            <FileIcon className="w-3 h-3" />
                            <span>{typeof s === "string" ? s : s.source}</span>
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  {msg.role === "assistant" && (
                    <div className="flex justify-between items-center mt-1 mr-1">
                      {renderReactionsBar(msg)}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopy(messageId, msg.content)}
                          className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition"
                          title="Copy response"
                        >
                          {copiedId === messageId ? <span className="text-xs text-green-400">Copied!</span> : <CopyIcon className="w-4 h-4" />}
                        </button>
                        {renderDeleteControl(messageId)}
                      </div>
                    </div>
                  )}

                  {msg.role === "user" && (
                    <div className="flex justify-end items-center gap-2 mt-1 mr-1">
                      <span className="text-xs text-gray-600">You</span>
                      {renderDeleteControl(messageId)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Skeleton Loading (#542) */}
          {loading && !messages.some(m => m.streaming) && (
            <div className="flex justify-start" data-testid="message-skeleton">
              <div className="w-full max-w-md bg-gray-800/80 border border-gray-700/80 px-4 py-3 rounded-2xl rounded-bl-sm animate-pulse space-y-2.5">
                <div className="flex items-center gap-1.5 mb-2">
                  <AppLogoIcon className="w-4 h-4 text-purple-400/60" />
                  <span className="text-xs font-semibold text-purple-400/60">LocalMind</span>
                </div>
                <div className="h-3.5 bg-gray-700 rounded-full w-3/4" />
                <div className="h-3.5 bg-gray-700 rounded-full w-1/2" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input Controls */}
        <div className="px-4 pb-4 pt-2 shrink-0">
          <div className="flex items-end gap-2 bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3 focus-within:border-purple-500 transition-colors">
            
            <div className="relative" ref={plusMenuRef}>
              <button
                type="button"
                onClick={() => setShowPlusMenu(!showPlusMenu)}
                className="text-gray-400 hover:text-purple-400 p-1 rounded-lg transition"
                title="Add action"
              >
                <PlusCircleIcon className="w-5 h-5" />
              </button>

              {showPlusMenu && (
                <div className="absolute bottom-10 left-0 bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-1 z-20 min-w-[160px]">
                  <button
                    type="button"
                    onClick={() => setShowTemplateDialog(true)}
                    className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 rounded-lg flex items-center gap-2 transition"
                  >
                    <TemplateIcon className="w-4 h-4 text-purple-400" />
                    Prompt Templates
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col gap-1.5">
              {selectedTemplate && (
                <div className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2.5 py-1 w-fit">
                  <TemplateIcon className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-xs text-gray-300">{selectedTemplate.prompt_title}</span>
                  <button onClick={() => setSelectedTemplate(null)} className="text-gray-500 hover:text-gray-300 transition">
                    <CloseIcon className="w-3 h-3" />
                  </button>
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={loading ? "LocalMind is computing..." : "Ask anything... (Enter to send, Shift+Enter for new line)"}
                rows={1}
                disabled={loading}
                className="bg-transparent text-sm text-gray-100 placeholder-gray-500 resize-none outline-none w-full disabled:text-gray-500"
                style={{ minHeight: "24px", maxHeight: "160px" }}
              />
            </div>

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
                disabled={!input.trim() && !selectedTemplate}
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

        {showTemplateDialog && (
          <PromptTemplateDialog
            onClose={() => setShowTemplateDialog(false)}
            onSelect={handleSelectTemplate}
          />
        )}
      </div>
    </>
  );
}