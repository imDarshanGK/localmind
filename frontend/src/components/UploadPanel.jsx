import { useState, useRef, useEffect } from "react";
import { uploadDocument, deleteDocument } from "../utils/api";
import { CheckIcon, DocumentsIcon, ErrorIcon, SpinnerIcon, UploadIcon, FileIcon } from "./Icons";

export default function UploadPanel({ sessionId, documents, onUploaded, onClose, show, minimalMode }) {
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

  // Poll for document status updates if any are queued/processing
  useEffect(() => {
    if (minimalMode) return;
    const isProcessing = documents.some(d => d.status === "queued" || d.status === "processing");
    if (!isProcessing) return;
    const interval = setInterval(() => {
      onUploaded(); // Triggers refreshDocuments
    }, 2000);
    return () => clearInterval(interval);
  }, [documents, onUploaded]);


  return (
    <div data-testid="upload-panel" className={`border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0 ${show ? 'block' : 'hidden'}`}>
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
        
        {/* Updated accept attribute to include .srt and .vtt transcript options */}
        <input ref={fileRef} type="file" accept=".pdf,.txt,.csv,.docx,.md,.html,.srt,.vtt" className="hidden"
          onChange={e=>handleFile(e.target.files[0])} />
        
        <p className="text-2xl mb-1 flex justify-center">{uploading ? <SpinnerIcon className="w-7 h-7 text-purple-400" /> : <UploadIcon className="w-7 h-7 text-gray-300" />}</p>
        <p className="text-sm text-gray-400">{uploading ? "Indexing document..." : "Drop file here or click to browse"}</p>
        
        {/* Updated visual footer labels to explicitly display audio transcript support */}
        <p className="text-xs text-gray-600 mt-1">PDF · TXT · CSV · DOCX · MD · HTML · SRT · VTT · max 50MB</p>
      </div>

      {result && <p className="text-xs text-green-400 mb-2 inline-flex items-center gap-1"><CheckIcon className="w-3.5 h-3.5" />{result.message}</p>}
      {error  && <p className="text-xs text-red-400 mb-2 inline-flex items-center gap-1"><ErrorIcon className="w-3.5 h-3.5" />{error}</p>}

      {/* Uploaded docs list */}
      {documents.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Indexed documents:</p>
          {documents.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-xs bg-gray-800 rounded-lg px-3 py-1.5 mb-1">
              <span className="text-gray-300 truncate inline-flex items-center gap-1">
                <FileIcon className="w-3.5 h-3.5" />{d.filename || d}
              </span>
              <span className="text-gray-500 ml-2 shrink-0">
                {d.status === 'queued' || d.status === 'processing' ? (
                  <span className="text-purple-400 inline-flex items-center gap-1">
                    <SpinnerIcon className="w-3 h-3" /> 
                    {d.status === 'processing' && d.chunks_indexed > 0 ? `Processing (${d.chunks_indexed})` : 'Processing'}
                  </span>
                ) : d.status === 'failed' ? (
                  <span className="text-red-400 inline-flex items-center gap-1"><ErrorIcon className="w-3 h-3" /> Failed</span>
                ) : d.chunks_indexed != null ? (
                  `${d.chunks_indexed} chunks`
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}