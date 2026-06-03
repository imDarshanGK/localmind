import React, { useState, useEffect } from 'react';
import ChatWindow from './components/ChatWindow';
import Sidebar from './components/Sidebar';
import SettingsPanel from './components/SettingsPanel';
import PluginsPanel from './components/PluginsPanel';
import UploadPanel from './components/UploadPanel';
import StatusBar from './components/StatusBar';
import KeyboardShortcutsHint from './components/KeyboardShortcutsHint';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [modelStatus, setModelStatus] = useState('disconnected');

  useEffect(() => {
    function handleKeyDown(e) {
      // Ctrl+K: toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSidebarOpen(prev => !prev);
      }
      // Ctrl+N: new chat
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setCurrentSessionId(null);
      }
      // Escape: close all panels
      if (e.key === 'Escape') {
        setSettingsOpen(false);
        setPluginsOpen(false);
        setUploadOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        currentSessionId={currentSessionId}
        onSessionSelect={setCurrentSessionId}
        onNewChat={() => setCurrentSessionId(null)}
      />
      <div className="flex-1 flex flex-col">
        <ChatWindow
          sessionId={currentSessionId}
          onSettingsOpen={() => setSettingsOpen(true)}
          onPluginsOpen={() => setPluginsOpen(true)}
          onUploadOpen={() => setUploadOpen(true)}
        />
        <StatusBar modelStatus={modelStatus} />
      </div>
      {settingsOpen && (
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      )}
      {pluginsOpen && (
        <PluginsPanel onClose={() => setPluginsOpen(false)} />
      )}
      {uploadOpen && (
        <UploadPanel onClose={() => setUploadOpen(false)} />
      )}
      <KeyboardShortcutsHint />
    </div>
  );
}
