import { useState } from "react";

const API = "http://localhost:8000/api";

export default function UploadPanel({ sessionId, onUploaded }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("session_id", sessionId);

    try {
      const res = await fetch(`${API}/upload/`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Upload failed");
      }
      const data = await res.json();
      setResult(data);
      onUploaded(data.filename);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="px-6 py-4 border-b border-gray-800 bg-gray-900">
      <p className="text-sm font-semibold text-white mb-3">📄 Upload Document for Q&A</p>
      <div className="flex items-center gap-3">
        <label className="flex-1 cursor-pointer">
          <input
            type="file"
            accept=".pdf,.txt,.csv,.docx"
            onChange={(e) => setFile(e.target.files[0])}
            className="hidden"
          />
          <div className="border border-dashed border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-400 hover:border-purple-500 hover:text-purple-400 transition text-center">
            {file ? `📎 ${file.name}` : "Click to choose PDF, TXT, CSV, DOCX"}
          </div>
        </label>
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="text-sm bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl transition font-medium"
        >
          {uploading ? "Indexing..." : "Upload"}
        </button>
      </div>
      {result && (
        <p className="text-xs text-green-400 mt-2">
          ✅ {result.message}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-400 mt-2">❌ {error}</p>
      )}
      <p className="text-xs text-gray-600 mt-2">
        Supported: PDF, TXT, CSV, DOCX • Max 50MB • Processed locally
      </p>
    </div>
  );
}
