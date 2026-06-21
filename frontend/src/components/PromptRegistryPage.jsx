export default function PromptRegistryPage({ onBack }) {
  return (
    <div className="p-4 text-gray-300">
      <button onClick={onBack} className="text-purple-400 hover:underline mb-4 block text-sm">
        ← Back to Chat
      </button>
      <h2 className="text-xl font-bold mb-2">Prompt Registry</h2>
      <p className="text-sm text-gray-500">Manage your custom system prompts here.</p>
    </div>
  );
}