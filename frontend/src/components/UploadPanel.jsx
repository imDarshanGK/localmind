import { useState, useRef } from "react";
import { uploadDocument, deleteDocument, previewDocument } from "../utils/api";
import { CheckIcon, DocumentsIcon, ErrorIcon, SpinnerIcon, UploadIcon, FileIcon } from "./Icons";

export default function UploadPanel({ sessionId, documents, onUploaded, onClose }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState("");
  
  // Preview UI local states
  const [previewContent, setPreviewContent] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewFilename, setPreviewFilename] = useState("");

  const fileRef = useRef();

  async function handleFile(file) {
    if (!file) return;
    setUploading(true); setError(""); setResult(null);
    try {
      const data = await uploadDocument(file, sessionId);
      setResult(data);
      onUploaded(data.filename);
    } catch(e) { setError(e.message); }
    finally { setUploading(false); }
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  async function handleTriggerPreview(filename) {
    setLoadingPreview(true);
    setPreviewFilename(filename);
    try {
      const data = await previewDocument(filename, sessionId);
      setPreviewContent(data.content || "No textual content available to display.");
    } catch (e) {
      setError(e.message);
      setPreviewContent(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  return (
    <div className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0 relative">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5"><DocumentsIcon className="w-4 h-4" />Documents</p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e=>{e.preventDefault();setDragging(true)}}
        onDragLeave={()=>setDragging(false)}
        onDrop={onDrop}
        onClick={()=>fileRef.current.click()}
        className={`border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition mb-3
          ${dragging ? "border-purple-500 bg-purple-900/20" : "border-gray-700 hover:border-purple-600 hover:bg-gray-800/50"}`}>
        <input ref={fileRef} type="file" accept=".pdf,.txt,.csv,.docx,.md,.html" className="hidden"
          onChange={e=>handleFile(e.target.files[0])} />
        <p className="text-2xl mb-1 flex justify-center">{uploading ? <SpinnerIcon className="w-7 h-7 text-purple-400" /> : <UploadIcon className="w-7 h-7 text-gray-300" />}</p>
        <p className="text-sm text-gray-400">{uploading ? "Indexing document..." : "Drop file here or click to browse"}</p>
        <p className="text-xs text-gray-600 mt-1">PDF · TXT · CSV · DOCX · MD · HTML · max 50MB</p>
      </div>

      {result && <p className="text-xs text-green-400 mb-2 inline-flex items-center gap-1"><CheckIcon className="w-3.5 h-3.5" />{result.message}</p>}
      {error  && <p className="text-xs text-red-400 mb-2 inline-flex items-center gap-1"><ErrorIcon className="w-3.5 h-3.5" />{error}</p>}

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
                    onClick={() => handleTriggerPreview(currentFilename)}
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
    </div>
  );
}