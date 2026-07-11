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
    // FIXED (#568): Implemented dynamic responsive padding adjustments across mobile vs desktop breaks
    <div className="border-b border-gray-800 bg-gray-900 px-4 py-3 sm:px-5 sm:py-4 shrink-0 w-full">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
          <DocumentsIcon className="w-4 h-4" />Documents
        </p>
        {/* FIXED (#568): Optimized tap/touch interaction targets for mobile close actions */}
        <button 
          onClick={onClose} 
          className="text-gray-500 hover:text-gray-300 text-2xl sm:text-lg leading-none p-2 sm:p-0 -mr-2 sm:mr-0 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center sm:block"
          aria-label="Close upload panel"
        >
          ×
        </button>
      </div>

      {/* Drop zone */}
      {/* FIXED (#568): Scaled inner padding sizes dynamically for mobile touch regions */}
      <div
        onDragOver={e=>{e.preventDefault();setDragging(true)}}
        onDragLeave={()=>setDragging(false)}
        onDrop={onDrop}
        onClick={()=>fileRef.current.click()}
        className={`border-2 border-dashed rounded-xl px-3 py-4 sm:px-4 sm:py-5 text-center cursor-pointer transition mb-3
          ${dragging ? "border-purple-500 bg-purple-900/20" : "border-gray-700 hover:border-purple-600 hover:bg-gray-800/50"}`}>
        <input ref={fileRef} type="file" accept=".pdf,.txt,.csv,.docx,.md,.html" className="hidden"
          onChange={e=>handleFile(e.target.files[0])} />
        <p className="text-2xl mb-1 flex justify-center">{uploading ? <SpinnerIcon className="w-7 h-7 text-purple-400" /> : <UploadIcon className="w-7 h-7 text-gray-300" />}</p>
        <p className="text-xs sm:text-sm text-gray-400">{uploading ? "Indexing document..." : "Tap to browse or drop file here"}</p>
        <p className="text-[10px] sm:text-xs text-gray-600 mt-1">PDF · TXT · CSV · DOCX · MD · HTML · max 50MB</p>
      </div>

      {result && <p className="text-xs text-green-400 mb-2 inline-flex items-center gap-1"><CheckIcon className="w-3.5 h-3.5" />{result.message}</p>}
      {error  && <p className="text-xs text-red-400 mb-2 inline-flex items-center gap-1"><ErrorIcon className="w-3.5 h-3.5" />{error}</p>}

      {/* Uploaded docs list */}
      {documents.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Indexed documents:</p>
          {documents.map((d, i) => (
            // FIXED (#568): Enforced padding sizing metrics matching touch standards
            <div key={i} className="flex items-center justify-between text-xs bg-gray-800 rounded-lg px-3 py-2 sm:py-1.5 mb-1 min-h-[36px]">
              <span className="text-gray-300 truncate inline-flex items-center gap-1 max-w-[70%]">
                <FileIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{d.filename || d}</span>
              </span>
              {d.chunks_indexed && <span className="text-gray-500 ml-2 shrink-0 text-[11px] sm:text-xs">{d.chunks_indexed} chunks</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}