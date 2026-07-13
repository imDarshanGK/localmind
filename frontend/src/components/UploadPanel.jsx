import { useState, useRef, useEffect } from "react";
import { uploadDocument, deleteDocument, previewDocument } from "../utils/api";
import { CheckIcon, DocumentsIcon, ErrorIcon, SpinnerIcon, UploadIcon, FileIcon } from "./Icons";

export default function UploadPanel({ sessionId, documents, onUploaded, onClose, show, minimalMode }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Preview UI local states
  const [previewContent, setPreviewContent] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewFilename, setPreviewFilename] = useState("");

  const [uploadResults, setUploadResults] = useState([]);
  const [error, setError] = useState("");
  const fileRef = useRef();

  // FIXED (#570): Initialize persistence layer state from localStorage based on active sessionId
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(`upload-panel-collapsed:${sessionId}`);
      return saved === "true";
    } catch (e) {
      return false;
    }
  });

  // FIXED (#570): Sync view state configurations safely as explicit string values
  useEffect(() => {
    try {
      localStorage.setItem(`upload-panel-collapsed:${sessionId}`, String(isCollapsed));
    } catch (e) {
      console.warn("localStorage persistence layer allocation blocked:", e);
    }
  }, [isCollapsed, sessionId]);

  // Poll for document status updates if any are queued/processing
  useEffect(() => {
    if (minimalMode || !show) return;
    const isProcessing = documents.some(d => d.status === "queued" || d.status === "processing");
    if (!isProcessing) return;
    const interval = setInterval(() => {
      onUploaded(); // Triggers refreshDocuments
    }, 2000);
    return () => clearInterval(interval);
  }, [documents, onUploaded, minimalMode, show]);

  // FIXED (#567): Global event listener to dismiss panel when Escape key is pressed
  useEffect(() => {
    if (!show) return;
    function handleGlobalKeyDown(e) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [show, onClose]);

  async function handleFiles(filelist) {
    const files = Array.from(filelist || []);
    if (files.length === 0) return;
    setUploading(true); 
    setError("");
    setUploadResults([]);
    for (const file of files) {
      try {
        const data = await uploadDocument(file, sessionId);
        setUploadResults(prev => [...prev, { filename: data.filename || file.name, status: "success", message: data.message }]);
        onUploaded(data.filename);
      } catch(e) { 
        const errorMessage = e.message || "An unexpected error occurred during document processing.";
        setError(errorMessage);
        setUploadResults(prev => [...prev, { filename: file.name, status: "error", message: errorMessage }]);
      }
    }
    setUploading(false); 
  }

  function onDrop(e) {
    e.preventDefault(); 
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  // FIXED (#567): Intercept keyboard interactions (Space/Enter) on the interactive dropzone box layout
  function handleDropzoneKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileRef.current.click();
    }
  }

  async function handleTriggerPreview(filename) {
    setLoadingPreview(true);
    setPreviewFilename(filename);
    try {
      const data = await previewDocument(filename, sessionId);
      setPreviewContent(data.content || "No textual content available to display.");
    } catch (e) {
      setPreviewContent(`Error loading preview: ${e.message}`);
    } finally {
      setLoadingPreview(false);
    }
  }

  return (
    <section 
      data-testid="upload-panel"
      aria-labelledby="upload-panel-title"
      className={`border-b border-gray-800 bg-gray-900 px-4 py-3 sm:px-5 sm:py-4 shrink-0 w-full transition-all duration-200 ${show ? 'block' : 'hidden'}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          {/* FIXED (#570): Persistent view collapse button trigger control toggle layout */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-gray-400 hover:text-white text-xs p-1 focus:outline-none focus:ring-1 focus:ring-purple-500 rounded transition"
            aria-label={isCollapsed ? "Expand upload section" : "Collapse upload section"}
          >
            {isCollapsed ? "▶" : "▼"}
          </button>
          
          <h2 id="upload-panel-title" className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
            <DocumentsIcon className="w-4 h-4" aria-hidden="true" />
            Documents
          </h2>
          
          {/* FIXED (#571): Pure CSS/Tailwind interactive help tooltip utility box */}
          <div className="group relative inline-block">
            <button
              type="button"
              className="text-gray-500 hover:text-purple-400 text-xs font-mono border border-gray-700 hover:border-purple-500/40 rounded-full w-4 h-4 inline-flex items-center justify-center bg-gray-950 cursor-help transition-colors focus:outline-none focus:ring-1 focus:ring-purple-500"
              aria-label="Upload limits information description"
            >
              i
            </button>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block group-focus-within:block w-48 bg-gray-950 border border-gray-800 text-gray-400 text-[10px] p-2 rounded shadow-xl z-50 pointer-events-none leading-relaxed">
              <span className="font-semibold text-white block mb-0.5">Supported Upload Formats:</span>
              PDF, TXT, CSV, DOCX, MD, HTML files up to a maximum limit of 50MB.
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-950"></div>
            </div>
          </div>
        </div>
        
        <button 
          onClick={onClose} 
          className="text-gray-500 hover:text-gray-300 text-lg leading-none p-1 rounded focus:outline-none focus:ring-2 focus:ring-purple-500" 
          aria-label="Close upload panel"
        >
          ×
        </button>
      </div>

      {error && (
        <div data-testid="upload-error-banner" className="mb-3 text-xs bg-red-950/40 border border-red-900/60 text-red-400 p-2.5 rounded-lg flex items-start gap-2">
          <ErrorIcon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold text-red-300">Upload Failure</p>
            <p className="text-red-400/90 leading-relaxed mt-0.5">{error}</p>
          </div>
          <button 
            type="button" 
            onClick={() => setError("")}
            className="text-red-400/60 hover:text-red-300 text-base font-bold leading-none px-1 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            aria-label="Dismiss failure banner"
          >
            ×
          </button>
        </div>
      )}

      {/* FIXED (#570): Enforced conditional rendering block to handle DOM tree unmounting patterns */}
      {!isCollapsed && (
        <div>
          {/* Drop zone */}
          <div
            tabIndex={0}
            role="button"
            aria-label="File upload drop zone. Press Enter or Space to browse."
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current.click()}
            onKeyDown={handleDropzoneKeyDown}
            className={`border-2 border-dashed rounded-xl px-3 py-4 sm:px-4 sm:py-5 text-center cursor-pointer transition mb-3 outline-none focus:ring-2 focus:ring-purple-500
              ${dragging ? "border-purple-500 bg-purple-900/20" : "border-gray-700 hover:border-purple-600 hover:bg-gray-800/50"}`}
          >
            <input ref={fileRef} type="file" accept=".pdf,.txt,.csv,.docx,.md,.html,.srt,.vtt" className="hidden" multiple
              aria-label="Upload document input"
              onChange={e => handleFiles(e.target.files)} />
            
            <p className="text-2xl mb-1 flex justify-center">
              {uploading ? <SpinnerIcon className="w-7 h-7 text-purple-400" /> : <UploadIcon className="w-7 h-7 text-gray-300" />}
            </p>
            <p className="text-xs sm:text-sm text-gray-400">{uploading ? "Indexing documents..." : "Drop files here or click to browse"}</p>
            <p className="text-[10px] sm:text-xs text-gray-600 mt-1">PDF · TXT · CSV · DOCX · MD · HTML · SRT · VTT · max 50MB</p>
          </div>

          <div role="status" aria-live="polite" className="empty:hidden">
            {uploadResults.length > 0 && (
              <div className="mb-2">
                {uploadResults.map((r, i) => (
                  <p key={i} className={`text-xs mb-1 inline-flex items-center gap-1 ${r.status === "success" ? "text-green-400" : "text-red-400"}`}>
                    {r.status === "success" ? <CheckIcon className="w-3.5 h-3.5" /> : <ErrorIcon className="w-3.5 h-3.5" />}
                    <span className="truncate">{r.filename}{r.status === "error" ? `: ${r.message}` : ""}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
          
          {/* Uploaded docs list */}
          {documents.length > 0 && (
            <div aria-label="Indexed documents collection">
              <p className="text-xs text-gray-500 mb-1">Indexed documents:</p>
              <ul className="space-y-1">
                {documents.map((d, i) => {
                  const currentFilename = d.filename || d;
                  return (
                    <li key={i} className="flex items-center justify-between text-xs bg-gray-800 rounded-lg px-3 py-2 sm:py-1.5 mb-1 hover:bg-gray-750 transition min-h-[36px]">
                      <span className="text-gray-300 truncate inline-flex items-center gap-1 max-w-[65%]">
                        <FileIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{currentFilename}</span>
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {d.chunks_indexed && <span className="text-gray-500 text-[11px] sm:text-xs">{d.chunks_indexed} chunks</span>}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleTriggerPreview(currentFilename); }}
                          className="p-2 sm:p-1 text-gray-400 hover:text-purple-400 rounded transition min-w-[32px] min-h-[32px] sm:min-w-0 sm:min-h-0 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-purple-500"
                          title="Preview Document Content"
                          disabled={loadingPreview}
                        >
                          {loadingPreview && previewFilename === currentFilename ? (
                            <SpinnerIcon className="w-3.5 h-3.5" />
                          ) : (
                            "👁️"
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Read-Only Modal Viewport Overlay */}
      {previewContent !== null && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-2xl rounded-2xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <div className="truncate pr-4">
                <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider block">Read-Only Preview</span>
                <h3 className="text-sm font-medium text-white truncate">{previewFilename}</h3>
              </div>
              <button 
                type="button"
                onClick={() => setPreviewContent(null)}
                className="text-gray-400 hover:text-white px-3 py-1.5 sm:px-2 sm:py-1 text-sm bg-gray-800 border border-gray-700 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                Close
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed bg-gray-950/40 selection:bg-purple-900">
              {previewContent}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}