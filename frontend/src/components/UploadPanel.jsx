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
    <div className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
            <DocumentsIcon className="w-4 h-4" />Documents
          </p>
          
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
        
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none" aria-label="Close panel">×</button>
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
          {documents.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-xs bg-gray-800 rounded-lg px-3 py-1.5 mb-1">
              <span className="text-gray-300 truncate inline-flex items-center gap-1"><FileIcon className="w-3.5 h-3.5" />{d.filename || d}</span>
              {d.chunks_indexed && <span className="text-gray-500 ml-2 shrink-0">{d.chunks_indexed} chunks</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}