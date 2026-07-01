import { useState, useRef, useEffect } from "react";
import { uploadDocument, deleteDocument, previewDocument } from "../utils/api";
import { CheckIcon, DocumentsIcon, ErrorIcon, SpinnerIcon, UploadIcon, FileIcon, TrashIcon, CloseIcon } from "./Icons";

export default function UploadPanel({ sessionId, documents, onUploaded, onClose, show, minimalMode }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Preview UI local states
  const [previewContent, setPreviewContent] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewFilename, setPreviewFilename] = useState("");

  const [documentToDelete, setDocumentToDelete] = useState(null);
  const [showToast, setShowToast] = useState(false);

  const [uploadResults, setUploadResults] = useState([]);
  const fileRef = useRef();

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

  async function handleFiles(filelist) {
    const files = Array.from(filelist || []);
    if (files.length === 0) return;
    setUploading(true); 
    setUploadResults([]);
    for (const file of files) {
      try {
        const data = await uploadDocument(file, sessionId);
        setUploadResults(prev => [...prev, { filename: data.filename || file.name, status: "success", message: data.message }]);
        onUploaded(data.filename);
      } catch(e) { 
        setUploadResults(prev => [...prev, { filename: file.name, status: "error", message: e.message }]);
      }
    }
    setUploading(false); 
  }

  function onDrop(e) {
    e.preventDefault(); 
    setDragging(false);
    handleFiles(e.dataTransfer.files);
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

  async function handleDeleteConfirm() {
    if (!documentToDelete) return;
    const docId = documentToDelete.id;
    try {
      await deleteDocument(docId);
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
      onUploaded();
    } catch (e) {
      console.error("Error deleting document:", e);
    } finally {
      setDocumentToDelete(null);
    }
  }

  return (
    <div data-testid="upload-panel" className={`border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0 ${show ? 'block' : 'hidden'}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
          <DocumentsIcon className="w-4 h-4" />Documents
        </p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current.click()}
        className={`border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition mb-3
          ${dragging ? "border-purple-500 bg-purple-900/20" : "border-gray-700 hover:border-purple-600 hover:bg-gray-800/50"}`}
      >
        {/* Updated accept attribute to include .srt and .vtt transcript options */}
        <input ref={fileRef} type="file" accept=".pdf,.txt,.csv,.docx,.md,.html,.srt,.vtt" className="hidden" multiple
          onChange={e => handleFiles(e.target.files)} />
        
        <p className="text-2xl mb-1 flex justify-center">
          {uploading ? <SpinnerIcon className="w-7 h-7 text-purple-400" /> : <UploadIcon className="w-7 h-7 text-gray-300" />}
        </p>
        <p className="text-sm text-gray-400">{uploading ? "Indexing documents..." : "Drop files here or click to browse"}</p>
        
        {/* Updated visual footer labels to explicitly display audio transcript support */}
        <p className="text-xs text-gray-600 mt-1">PDF · TXT · CSV · DOCX · MD · HTML · SRT · VTT · max 50MB</p>
      </div>

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
      
      {/* Uploaded docs list */}
      {documents.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Indexed documents:</p>
          {documents.map((d, i) => {
            const currentFilename = d.filename || d;
            return (
              <div key={i} className="flex items-center justify-between text-xs bg-gray-800 rounded-lg px-3 py-1.5 mb-1 hover:bg-gray-750 transition">
                <span className="text-gray-300 truncate inline-flex items-center gap-1 max-w-[65%]">
                  <FileIcon className="w-3.5 h-3.5" />
                  {currentFilename}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {d.chunks_indexed && <span className="text-gray-500">{d.chunks_indexed} chunks</span>}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleTriggerPreview(currentFilename); }}
                    className="p-1 text-gray-400 hover:text-purple-400 rounded transition"
                    title="Preview Document Content"
                    disabled={loadingPreview}
                  >
                    {loadingPreview && previewFilename === currentFilename ? (
                      <SpinnerIcon className="w-3.5 h-3.5" />
                    ) : (
                      "👁️"
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDocumentToDelete(d); }}
                    className="p-1 text-gray-400 hover:text-red-400 rounded transition"
                    title="Delete Document"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
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
                onClick={() => setPreviewContent(null)}
                className="text-gray-400 hover:text-white px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded-lg transition"
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

      {/* Document Delete Confirmation Modal */}
      {documentToDelete !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <button
                onClick={() => setDocumentToDelete(null)}
                className="text-gray-500 hover:text-gray-300 transition"
                title="Close"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
              <h2 className="text-sm font-semibold text-white">Delete Document</h2>
              <div className="w-4" />
            </div>

            {/* Body */}
            <div className="px-5 py-5">
              <p className="text-sm text-gray-300">
                Are you sure you want to delete '{documentToDelete.filename || documentToDelete}'? This action cannot be undone.
              </p>
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-5 pb-5">
              <button
                autoFocus
                onClick={() => setDocumentToDelete(null)}
                className="flex-1 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-xl font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 text-sm bg-red-600 hover:bg-red-500 active:bg-red-700 text-white py-2 rounded-xl font-medium transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center justify-between gap-4 bg-gray-900 border border-green-500/40 text-gray-200 text-xs rounded-xl shadow-2xl px-4 py-3 animate-fade-in min-w-[240px]">
          <p className="truncate">Document deleted successfully.</p>
          <button
            onClick={() => setShowToast(false)}
            className="text-gray-500 hover:text-gray-300 text-xs font-semibold leading-none ml-2"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}