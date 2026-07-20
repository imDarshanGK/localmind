import { useState, useRef } from "react";
import { uploadDocument, deleteDocument } from "../utils/api";
import { CheckIcon, DocumentsIcon, ErrorIcon, SpinnerIcon, UploadIcon, FileIcon } from "./Icons";

export default function UploadPanel({ sessionId, documents, isLoading = false, onUploaded, onClose }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef();

  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    setError("");
    setResult(null);
    try {
      const data = await uploadDocument(file, sessionId);
      setResult(data);
      onUploaded(data.filename);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  return (
    <div className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
          <DocumentsIcon className="w-4 h-4" /> Documents
        </p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">
          ×
        </button>
      </div>

      {/* Loading Skeleton Mode */}
      {isLoading ? (
        <div data-testid="upload-panel-skeleton" className="animate-pulse space-y-3">
          {/* Skeleton for Drop Zone */}
          <div className="border-2 border-dashed border-gray-800 rounded-xl px-4 py-6 flex flex-col items-center justify-center bg-gray-800/30">
            <div className="w-8 h-8 bg-gray-700/60 rounded-full mb-2"></div>
            <div className="h-3.5 bg-gray-700/60 rounded w-44 mb-1.5"></div>
            <div className="h-2.5 bg-gray-800/80 rounded w-56"></div>
          </div>

          {/* Skeleton for Indexed Document Items */}
          <div>
            <div className="h-3 bg-gray-800 rounded w-28 mb-2"></div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2">
                <div className="h-3 bg-gray-700/60 rounded w-36"></div>
                <div className="h-3 bg-gray-700/40 rounded w-14"></div>
              </div>
              <div className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2">
                <div className="h-3 bg-gray-700/60 rounded w-48"></div>
                <div className="h-3 bg-gray-700/40 rounded w-12"></div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current.click()}
            className={`border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition mb-3
              ${dragging ? "border-purple-500 bg-purple-900/20" : "border-gray-700 hover:border-purple-600 hover:bg-gray-800/50"}`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.csv,.docx,.md,.html"
              className="hidden"
              onChange={(e) => handleFile(e.target.files[0])}
            />
            <p className="text-2xl mb-1 flex justify-center">
              {uploading ? (
                <SpinnerIcon className="w-7 h-7 text-purple-400" />
              ) : (
                <UploadIcon className="w-7 h-7 text-gray-300" />
              )}
            </p>
            <p className="text-sm text-gray-400">
              {uploading ? "Indexing document..." : "Drop file here or click to browse"}
            </p>
            <p className="text-xs text-gray-600 mt-1">PDF · TXT · CSV · DOCX · MD · HTML · max 50MB</p>
          </div>

          {result && (
            <p className="text-xs text-green-400 mb-2 inline-flex items-center gap-1">
              <CheckIcon className="w-3.5 h-3.5" />
              {result.message}
            </p>
          )}
          {error && (
            <p className="text-xs text-red-400 mb-2 inline-flex items-center gap-1">
              <ErrorIcon className="w-3.5 h-3.5" />
              {error}
            </p>
          )}

          {/* Uploaded docs list / Inline Document Skeleton during uploading */}
          {uploading && (
            <div data-testid="document-uploading-skeleton" className="animate-pulse flex items-center justify-between text-xs bg-gray-800/70 border border-purple-500/30 rounded-lg px-3 py-2 mb-2">
              <div className="flex items-center gap-2">
                <SpinnerIcon className="w-3.5 h-3.5 text-purple-400" />
                <div className="h-3 bg-purple-900/50 rounded w-28"></div>
              </div>
              <div className="h-3 bg-gray-700/50 rounded w-16"></div>
            </div>
          )}

          {documents && documents.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Indexed documents:</p>
              {documents.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-gray-800 rounded-lg px-3 py-1.5 mb-1">
                  <span className="text-gray-300 truncate inline-flex items-center gap-1">
                    <FileIcon className="w-3.5 h-3.5" />
                    {d.filename || d}
                  </span>
                  {d.chunks_indexed && <span className="text-gray-500 ml-2 shrink-0">{d.chunks_indexed} chunks</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}