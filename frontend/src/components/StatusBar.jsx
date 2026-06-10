import { AppLogoIcon, BatchIcon, DocumentsIcon, LightningIcon, OfflineIcon, OnlineIcon, PlugIcon, SettingsIcon, TemplateIcon, TrashIcon } from "./Icons";

export default function StatusBar({ ollamaOk, model, docCount, onUpload, onPrompts, onPlugins, onSettings, onClear, useStream, onToggleStream }) {
  return (
    <header className="flex items-center justify-between px-5 py-2.5 border-b border-gray-800 bg-gray-900 shrink-0">
      <div className="flex items-center gap-3">
        <AppLogoIcon className="w-5 h-5 text-purple-400" />
        <span className="font-semibold text-white text-sm">LocalMind</span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-900 text-purple-300">{model}</span>
        {ollamaOk === true  && <StatusBadge icon={<OnlineIcon className="w-3.5 h-3.5 text-green-300" />} className="bg-green-900 text-green-300" label="online" />}
        {ollamaOk === false && <StatusBadge icon={<OfflineIcon className="w-3.5 h-3.5 text-red-300" />} className="bg-red-900 text-red-300" label="ollama offline" />}
        {docCount > 0 && <StatusBadge icon={<DocumentsIcon className="w-3.5 h-3.5 text-blue-300" />} className="bg-blue-900 text-blue-300" label={`${docCount} doc${docCount>1?"s":""}`} />}
      </div>
      <div className="flex items-center gap-1.5">
        <Btn onClick={onToggleStream} title={useStream ? "Streaming ON" : "Streaming OFF"}
          active={useStream} icon={useStream ? <LightningIcon className="w-3.5 h-3.5" /> : <BatchIcon className="w-3.5 h-3.5" />} label={useStream ? "Stream" : "Batch"} />
        <Btn onClick={onUpload}   icon={<DocumentsIcon className="w-3.5 h-3.5" />} label="Docs"     />
        <Btn onClick={onPrompts}  icon={<TemplateIcon className="w-3.5 h-3.5" />} label="Prompts"  />
        <Btn onClick={onPlugins}  icon={<PlugIcon className="w-3.5 h-3.5" />} label="Plugins"  />
        <Btn onClick={onClear}    icon={<TrashIcon className="w-3.5 h-3.5" />} label="Clear"    />
        <Btn onClick={onSettings} icon={<SettingsIcon className="w-3.5 h-3.5" />} label="Settings" />
      </div>
    </header>
  );
}

function Btn({ onClick, label, icon, active, title }) {
  return (
    <button onClick={onClick} title={title}
      className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium inline-flex items-center gap-1.5
        ${active ? "border-purple-500 text-purple-300 bg-purple-900/30" : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200"}`}>
      {icon}
      {label}
    </button>
  );
}

function StatusBadge({ icon, label, className }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${className}`}>
      {icon}
      {label}
    </span>
  );
}
