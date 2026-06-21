import { useState, useRef, useEffect } from "react";
import { uploadDocument, deleteDocument } from "../utils/api";
import { CheckIcon, DocumentsIcon, ErrorIcon, SpinnerIcon, UploadIcon, FileIcon } from "./Icons";

export default function UploadPanel({ sessionId, documents, onUploaded, onClose, show }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults,    setUploadResults]    = useState([]);
  const fileRef = useRef();

  async function handleFiles(filelist) {
    const files = Array.from(filelist || []);
    if (files.length === 0) return;
    setUploading(true); setUploadResults([]);
    for (const file of files) {
    try {
      const data = await uploadDocument(file, sessionId);
      setUploadResults(prev => [...prev, {filename: data.filename || file.name, status:"success",message:data.message}]);
      onUploaded(data.filename);
    } catch(e) { 
      setUploadResults(prev => [...prev, {filename: file.name, status:"error", message:e.message}])
    }
  }
  setUploading(false); 
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  // Poll for document status updates if any are queued/processing
  useEffect(() => {
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
        <input ref={fileRef} type="file" accept=".pdf,.txt,.csv,.docx,.md,.html,.srt,.vtt" className="hidden" multiple
          onChange={e=>handleFiles(e.target.files)} />
        
        <p className="text-2xl mb-1 flex justify-center">{uploading ? <SpinnerIcon className="w-7 h-7 text-purple-400" /> : <UploadIcon className="w-7 h-7 text-gray-300" />}</p>
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