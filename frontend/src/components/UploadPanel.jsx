import { useState, useRef } from "react";
import { uploadDocument, deleteDocument } from "../utils/api";
import { CheckIcon, DocumentsIcon, ErrorIcon, SpinnerIcon, UploadIcon, FileIcon } from "./Icons";

export default function UploadPanel({ sessionId, documents, onUploaded, onClose }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState("");
  
  // FIXED (#574): Draft tracking state slot allocations
  const [draftFile, setDraftFile] = useState(null);
  
  const fileRef = useRef();

  async function handleFileSelect(file) {
    if (!file) return;
    setError("");
    setResult(null);
    // Stage the file as a local draft state object first instead of auto-uploading
    setDraftFile(file);
  }

  async function commitDraftUpload() {
    if (!draftFile) return;
    setUploading(true);
    setError("");
    setResult(null);
    try {
      const data = await uploadDocument(draftFile, sessionId);
      setResult(data);
      onUploaded(data.filename);
      setDraftFile(null); // Clear draft slot container on success profile loops
    } catch(e) { 
      setError(e.message); 
    } finally { 
      setUploading(false); 
    }
  }

  function onDrop(e) {
    e.preventDefault(); 
    setDragging(false);
    handleFileSelect(e.dataTransfer.files[0]);
  }

  return (
    <div className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
          <DocumentsIcon className="w-4 h-4" />Documents
        </p>
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
          onChange={e=>handleFileSelect(e.target.files[0])} />
        <p className="text-2xl mb-1 flex justify-center">{uploading ? <SpinnerIcon className="w-7 h-7 text-purple-400" /> : <UploadIcon className="w-7 h-7 text-gray-300" />}</p>
        <p className="text-sm text-gray-400">{uploading ? "Indexing document..." : "Drop file here or click to browse"}</p>
        <p className="text-xs text-gray-600 mt-1">PDF · TXT · CSV · DOCX · MD · HTML · max 50MB</p>
      </div>

      {/* FIXED (#574): Staged draft workspace block viewport rendering */}
      {draftFile && (
        <div className="bg-purple-950/20 border border-purple-900/40 rounded-xl p-3 mb-3 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-gray-300">
            <span className="inline-flex items-center gap-1.5 font-medium truncate max-w-[80%]">
              <FileIcon className="w-3.5 h-3.5 text-purple-400" />
              {draftFile.name} <span className="text-[10px] text-purple-400/80 bg-purple-950 px-1.5 py-0.5 rounded border border-purple-800/30">Draft</span>
            </span>
            <button 
              onClick={() => setDraftFile(null)} 
              className="text-gray-500 hover:text-gray-300 text-sm leading-none p-1"
              title="Cancel draft"
            >
              ×
            </button>
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={commitDraftUpload}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 text-white font-medium text-xs py-1.5 rounded-lg transition"
          >
            {uploading ? "Uploading Draft..." : "Upload Draft"}
          </button>
        </div>
      )}

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