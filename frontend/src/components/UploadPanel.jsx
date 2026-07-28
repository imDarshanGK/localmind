import { useState, useRef } from "react";
import { uploadDocument, deleteDocument } from "../utils/api";
import { CheckIcon, DocumentsIcon, ErrorIcon, SpinnerIcon, UploadIcon, FileIcon } from "./Icons";

const ALLOWED_EXTENSIONS = ["pdf", "txt", "csv", "docx", "md", "html"];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export default function UploadPanel({ sessionId, documents, onUploaded, onClose }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef();

  async function handleFile(file) {
    if (!file) return;

    setError("");
    setResult(null);

    // 1. Check file extension
    const ext = file.name.split(".").pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setError(`Unsupported file format (.${ext}). Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    // 2. Check file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("File size exceeds 50MB limit.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setUploading(true);

    try {
      const data = await uploadDocument(file, sessionId);
      setResult(data);
      if (onUploaded) onUploaded(data.filename);
    } catch (e) {
      const errMsg = e?.response?.data?.detail || e?.message || "Failed to upload document.";
      setError(typeof errMsg === "object" ? JSON.stringify(errMsg) : String(errMsg));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }

  return (
    <div className="border-b border-gray-800 bg-gray-900 px-5 py-4 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
          <DocumentsIcon className="w-4 h-4" />
          Documents
        </p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">
          &times;
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current && fileRef.current.click()}
        className={`border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition mb-3 ${
          dragging ? "border-purple-500 bg-purple-900/20" : "border-gray-700 hover:border-purple-600 hover:bg-gray-800/50"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.csv,.docx,.md,.html"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFile(e.target.files[0]);
            }
          }}
        />
        <p className="text-2xl mb-1 flex justify-center">
          {uploading ? <SpinnerIcon className="w-7 h-7 text-purple-400" /> : <UploadIcon className="w-7 h-7 text-gray-300" />}
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

      {/* Uploaded docs list */}
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
    </div>
  );
}