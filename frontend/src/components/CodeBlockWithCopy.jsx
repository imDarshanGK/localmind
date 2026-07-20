import { useState } from "react";

export default function CodeBlockWithCopy({ code, language }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="relative group my-2">
      <pre className={`language-${language} bg-gray-900 p-3 rounded-lg overflow-x-auto text-sm`}>
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded"
      >
        {copied ? "✓ Copied!" : "📋 Copy"}
      </button>
    </div>
  );
}