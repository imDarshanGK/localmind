import { useState, useEffect, useRef } from "react";
import { 
  AppLogoIcon, 
  BatchIcon, 
  DocumentsIcon, 
  LightningIcon, 
  OfflineIcon, 
  OnlineIcon, 
  PlugIcon, 
  SettingsIcon, 
  TrashIcon 
} from "./Icons";

export default function StatusBar({ 
  ollamaOk, 
  model, 
  docCount, 
  onUpload, 
  onPlugins, 
  onSettings, 
  onClear, 
  useStream, 
  onToggleStream,
  // Favorite & Pin Props (#634)
  isFavorite = false,
  onToggleFavorite,
  isPinned = false,
  onTogglePin,
  // Export & Share Props (#638)
  onExport,
  onShare,
  // Contextual Action Menu Props (#635)
  contextActions = []
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Merge onExport and onShare into the contextual menu items (#638)
  const effectiveContextActions = [
    ...(onExport ? [{ id: "export-action", label: "Export Chat", onClick: onExport, icon: "📥" }] : []),
    ...(onShare ? [{ id: "share-action", label: "Share Session", onClick: onShare, icon: "🔗" }] : []),
    ...contextActions
  ];

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="flex items-center justify-between px-5 py-2.5 border-b border-gray-800 bg-gray-900 shrink-0 relative">
      <div className="flex items-center gap-3">
        <AppLogoIcon className="w-5 h-5 text-purple-400" />
        <span className="font-semibold text-white text-sm">LocalMind</span>

        {/* Favorite Action Toggle */}
        {onToggleFavorite && (
          <button
            onClick={onToggleFavorite}
            data-testid="btn-favorite"
            title={isFavorite ? "Unfavorite session" : "Favorite session"}
            className={`text-xs transition ${isFavorite ? "text-amber-400" : "text-gray-500 hover:text-amber-300"}`}
          >
            {isFavorite ? "★" : "☆"}
          </button>
        )}

        {/* Pin Action Toggle */}
        {onTogglePin && (
          <button
            onClick={onTogglePin}
            data-testid="btn-pin"
            title={isPinned ? "Unpin status bar" : "Pin status bar"}
            className={`text-xs transition ${isPinned ? "text-indigo-400" : "text-gray-500 hover:text-indigo-300"}`}
          >
            {isPinned ? "📌" : "📍"}
          </button>
        )}

        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-900 text-purple-300">{model}</span>
        {ollamaOk === true  && <StatusBadge icon={<OnlineIcon className="w-3.5 h-3.5 text-green-300" />} className="bg-green-900 text-green-300" label="online" />}
        {ollamaOk === false && <StatusBadge icon={<OfflineIcon className="w-3.5 h-3.5 text-red-300" />} className="bg-red-900 text-red-300" label="ollama offline" />}
        {docCount > 0 && <StatusBadge testId="doc-count-badge" icon={<DocumentsIcon className="w-3.5 h-3.5 text-blue-300" />} className="bg-blue-900 text-blue-300" label={`${docCount} doc${docCount>1?"s":""}`} />}
      </div>
      
      <div className="flex items-center gap-1.5" data-testid="status-bar-actions">
        {/* Direct Export & Share Quick Action Buttons (#638) */}
        {onExport && (
          <button
            onClick={onExport}
            data-testid="btn-export"
            title="Export session"
            className="text-xs px-2 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition font-medium inline-flex items-center gap-1"
          >
            📥 <span className="hidden sm:inline">Export</span>
          </button>
        )}
        {onShare && (
          <button
            onClick={onShare}
            data-testid="btn-share"
            title="Share session"
            className="text-xs px-2 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition font-medium inline-flex items-center gap-1"
          >
            🔗 <span className="hidden sm:inline">Share</span>
          </button>
        )}

        <Btn onClick={onToggleStream} testId="btn-stream" title={useStream ? "Streaming ON" : "Streaming OFF"}
          active={useStream} icon={useStream ? <LightningIcon className="w-3.5 h-3.5" /> : <BatchIcon className="w-3.5 h-3.5" />} label={useStream ? "Stream" : "Batch"} />
        <Btn onClick={onUpload}   testId="btn-docs"   icon={<DocumentsIcon className="w-3.5 h-3.5" />} label="Docs"     />
        <Btn onClick={onPlugins}  testId="btn-plugins" icon={<PlugIcon className="w-3.5 h-3.5" />} label="Plugins"  />
        <Btn onClick={onClear}    testId="btn-clear"    icon={<TrashIcon className="w-3.5 h-3.5" />} label="Clear"    />
        <Btn onClick={onSettings} testId="btn-settings" icon={<SettingsIcon className="w-3.5 h-3.5" />} label="Settings" />

        {/* Contextual Action Menu (#635) */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            data-testid="btn-context-menu"
            title="Contextual Actions"
            className="text-xs px-2 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition font-medium inline-flex items-center"
          >
            ⋮
          </button>

          {menuOpen && (
            <div 
              data-testid="context-menu-dropdown"
              className="absolute right-0 mt-1 w-44 rounded-md shadow-lg bg-gray-800 border border-gray-700 z-50 py-1 text-xs"
            >
              {effectiveContextActions.length > 0 ? (
                effectiveContextActions.map((action, idx) => (
                  <button
                    key={action.id || idx}
                    onClick={() => {
                      action.onClick?.();
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2 transition"
                  >
                    {action.icon && <span>{action.icon}</span>}
                    <span>{action.label}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-1.5 text-gray-500 italic">No contextual actions</div>
              )}
            </div>
          )}
        </div>
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