import React, { useState, useEffect } from 'react';

const shortcuts = [
  { keys: ['Ctrl', 'K'], description: 'Toggle sidebar' },
  { keys: ['Ctrl', 'N'], description: 'New chat' },
  { keys: ['Ctrl', 'Enter'], description: 'Send message' },
  { keys: ['Ctrl', 'Shift', 'C'], description: 'Clear chat' },
  { keys: ['Escape'], description: 'Close panels' },
];

export default function KeyboardShortcutsHint() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Close shortcuts"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <ul className="space-y-2">
          {shortcuts.map((shortcut, index) => (
            <li key={index} className="flex justify-between items-center py-1">
              <span className="text-sm text-gray-700 dark:text-gray-300">{shortcut.description}</span>
              <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600">
                {shortcut.keys.join(' + ')}
              </kbd>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
          Press <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600">?</kbd> to toggle this hint.
        </p>
      </div>
    </div>
  );
}
