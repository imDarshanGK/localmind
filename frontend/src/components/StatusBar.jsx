import { AppLogoIcon, BatchIcon, DocumentsIcon, LightningIcon, OfflineIcon, OnlineIcon, PlugIcon, SettingsIcon, TrashIcon } from "./Icons";

// Helper badge renderer for search refinement indicators (#633)
function SearchRefinementBadge({ searchRefinement }) {
  if (!searchRefinement) return null;

  const mode = String(
    typeof searchRefinement === "object" ? searchRefinement.mode || searchRefinement.type : searchRefinement
  ).toLowerCase();

  let badgeStyle = "bg-slate-800 text-slate-300 border-slate-700";
  let label = "Search: Standard";
  let icon = "🔍";

  if (mode.includes("semantic") || mode.includes("vector")) {
    badgeStyle = "bg-indigo-950/60 text-indigo-300 border-indigo-800/60";
    label = "Search: Semantic";
    icon = "🧠";
  } else if (mode.includes("keyword") || mode.includes("lexical") || mode.includes("exact")) {
    badgeStyle = "bg-sky-950/60 text-sky-300 border-sky-800/60";
    label = "Search: Keyword";
    icon = "🔤";
  } else if (mode.includes("hybrid") || mode.includes("combined") || mode.includes("dense")) {
    badgeStyle = "bg-purple-950/60 text-purple-300 border-purple-800/60";
    label = "Search: Hybrid";
    icon = "🔀";
  }

  return (
    <span
      data-testid="search-refinement-badge"
      className={`text-[10px] font-mono px-2 py-0.5 rounded border inline-flex items-center gap-1 ${badgeStyle}`}
      title={`Search Refinement Mode: ${mode}`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

export default function StatusBar({ 
  ollamaOk, 
  model, 
  docCount, 
  searchRefinement, 
  onUpload, 
  onPlugins, 
  onSettings, 
  onClear, 
  useStream, 
  onToggleStream 
}) {
  return (
    <header className="flex items-center justify-between px-5 py-2.5 border-b border-gray-800 bg-gray-900 shrink-0">
      <div className="flex items-center gap-3">
        <AppLogoIcon className="w-5 h-5 text-purple-400" />
        <span className="font-semibold text-white text-sm">LocalMind</span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-900 text-purple-300">{model}</span>

        {/* Search Refinement Indicator (#633) */}
        {searchRefinement && <SearchRefinementBadge searchRefinement={searchRefinement} />}

        {ollamaOk === true  && <StatusBadge icon={<OnlineIcon className="w-3.5 h-3.5 text-green-300" />} className="bg-green-900 text-green-300" label="online" />}
        {ollamaOk === false && <StatusBadge icon={<OfflineIcon className="w-3.5 h-3.5 text-red-300" />} className="bg-red-900 text-red-300" label="ollama offline" />}
        {docCount > 0 && <StatusBadge testId="doc-count-badge" icon={<DocumentsIcon className="w-3.5 h-3.5 text-blue-300" />} className="bg-blue-900 text-blue-300" label={`${docCount} doc${docCount>1?"s":""}`} />}
      </div>
      <div className="flex items-center gap-1.5">
        <Btn onClick={onToggleStream} testId="btn-stream" title={useStream ? "Streaming ON" : "Streaming OFF"}
          active={useStream} icon={useStream ? <LightningIcon className="w-3.5 h-3.5" /> : <BatchIcon className="w-3.5 h-3.5" />} label={useStream ? "Stream" : "Batch"} />
        <Btn onClick={onUpload}   testId="btn-docs"   icon={<DocumentsIcon className="w-3.5 h-3.5" />} label="Docs"     />
        <Btn onClick={onPlugins}  testId="btn-plugins" icon={<PlugIcon className="w-3.5 h-3.5" />} label="Plugins"  />
        <Btn onClick={onClear}    testId="btn-clear"    icon={<TrashIcon className="w-3.5 h-3.5" />} label="Clear"    />
        <Btn onClick={onSettings} testId="btn-settings" icon={<SettingsIcon className="w-3.5 h-3.5" />} label="Settings" />
      </div>
    </header>
  );
}

function Btn({ onClick, label, icon, active, title, testId }) {
  return (
    <button onClick={onClick} title={title} data-testid={testId}
      className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium inline-flex items-center gap-1.5
        ${active ? "border-purple-500 text-purple-300 bg-purple-900/30" : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200"}`}>
      {icon}
      {label}
    </button>
  );
}

function StatusBadge({ icon, label, className, testId }) {
  return (
    <span data-testid={testId} className={`text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${className}`}>
      {icon}
      {label}
    </span>
  );
}