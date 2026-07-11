import { useState, useRef } from "react";
import { uploadDocument, deleteDocument } from "../utils/api";
import { CheckIcon, DocumentsIcon, ErrorIcon, SpinnerIcon, UploadIcon, FileIcon } from "./Icons";

export default function UploadPanel({ sessionId, documents, onUploaded, onClose }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState("");
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

  return (
    // FIXED (#569): Converted container outer div to a semantic <section> with an accessibility landmark label
    <section 
      aria-labelledby="upload-panel-title"
      className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0"
    >
      <div className="flex items-center justify-between mb-3">
        {/* FIXED (#569): Added id matching the section landmark header reference */}
        <h2 id="upload-panel-title" className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
          <DocumentsIcon className="w-4 h-4" aria-hidden="true" />
          Documents
        </h2>
        <button 
          onClick={onClose} 
          className="text-gray-500 hover:text-gray-300 text-lg leading-none p-1 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
          aria-label="Close upload panel"
        >
          ×
        </button>
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
          aria-label="Upload document input"
          onChange={e=>handleFile(e.target.files[0])} />
        <p className="text-2xl mb-1 flex justify-center">{uploading ? <SpinnerIcon className="w-7 h-7 text-purple-400" /> : <UploadIcon className="w-7 h-7 text-gray-300" />}</p>
        <p className="text-sm text-gray-400">{uploading ? "Indexing document..." : "Drop file here or click to browse"}</p>
        <p className="text-xs text-gray-600 mt-1">PDF · TXT · CSV · DOCX · MD · HTML · max 50MB</p>
      </div>

      {/* FIXED (#569): Wrapped asynchronous operation results inside an explicit live area status landmark region */}
      <div role="status" aria-live="polite" className="empty:hidden">
        {result && <p className="text-xs text-green-400 mb-2 inline-flex items-center gap-1"><CheckIcon className="w-3.5 h-3.5" />{result.message}</p>}
        {error  && <p className="text-xs text-red-400 mb-2 inline-flex items-center gap-1"><ErrorIcon className="w-3.5 h-3.5" />{error}</p>}
      </div>

      {/* Uploaded docs list */}
      {documents.length > 0 && (
        // FIXED (#569): Converted text labels and items into a semantic accessible list element tree structure
        <div aria-label="Indexed documents collection">
          <p className="text-xs text-gray-500 mb-1">Indexed documents:</p>
          <ul className="space-y-1">
            {documents.map((d, i) => (
              <li key={i} className="flex items-center justify-between text-xs bg-gray-800 rounded-lg px-3 py-1.5">
                <span className="text-gray-300 truncate inline-flex items-center gap-1">
                  <FileIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  {d.filename || d}
                </span>
                {d.chunks_indexed && <span className="text-gray-500 ml-2 shrink-0">{d.chunks_indexed} chunks</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}