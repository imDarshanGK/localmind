import { ChatIcon } from "./Icons";

const ERROR_GUIDES = [
  {
    id: "ollama-status",
    title: "❌ Ollama Connection Failed (Status: Offline)",
    symptom: "The status bar shows a red indicator, or model dropdowns are completely empty.",
    solution: "Ensure the Ollama background service is actively running on your machine. Open a terminal and run `ollama serve` or start the Ollama desktop application.",
  },
  {
    id: "missing-models",
    title: "🧠 Missing AI Models / Empty Dropdown",
    symptom: "You can connect to Ollama, but no models appear in the selector.",
    solution: "You need to pull a model locally to your system. Run `ollama pull llama3` or `ollama pull mistral` in your terminal, then refresh this page.",
  },
  {
    id: "db-lock",
    title: "💾 ChromaDB / SQLite Database Initialization Error",
    symptom: "The backend server fails to start, throwing an environment or storage lock error.",
    solution: "Ensure no duplicate Python backend instances are running simultaneously. If the error persists, safely clear the lock file or temporary database folders located inside the `./backend/data/` path.",
  },
  {
    id: "cors-mismatch",
    title: "🌐 Network Connection Refused (Frontend ↔ Backend)",
    symptom: "The browser console displays CORS errors or network failure alerts when making requests.",
    solution: "Verify your backend is running on the expected port. Check your environment variable settings—if your frontend runs on port 5173, the backend environment variables must explicitly include it inside `CORS_ORIGINS`.",
  },
];

export default function TroubleshootingPage({ onBack }) {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-950 text-gray-100 p-6 md:p-12 relative flex flex-col items-center">
      <div className="w-full max-w-3xl">
        {/* Header Block */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-6 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">System Troubleshooting Guide</h1>
            <p className="text-sm text-gray-500 mt-1">Quick fixes for common offline AI setup configurations and environment errors.</p>
          </div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl transition text-gray-300 hover:text-white"
          >
            <ChatIcon className="w-3.5 h-3.5 rotate-180" />
            Back to Chat
          </button>
        </div>

        {/* Error Cards Stack */}
        <div className="flex flex-col gap-4">
          {ERROR_GUIDES.map((guide) => (
            <div key={guide.id} className="bg-gray-900/50 border border-gray-800/80 rounded-2xl p-5 hover:border-purple-500/30 transition shadow-sm">
              <h3 className="font-semibold text-gray-200 text-sm mb-2">{guide.title}</h3>
              <div className="text-xs space-y-2">
                <p className="text-gray-500">
                  <span className="font-medium text-gray-400">Symptom:</span> {guide.symptom}
                </p>
                <p className="text-gray-400 bg-gray-900/80 rounded-xl p-3 border border-gray-800 font-normal leading-relaxed">
                  <span className="font-semibold text-purple-400 block mb-1 uppercase tracking-wider text-[10px]">Recommended Fix</span>
                  {guide.solution}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Quick Contact */}
        <div className="mt-12 text-center border-t border-gray-900 pt-6">
          <p className="text-xs text-gray-600">
            Still experiencing issues? Open a detailed debug log issue inside the main repository tracking space.
          </p>
        </div>
      </div>
    </div>
  );
}