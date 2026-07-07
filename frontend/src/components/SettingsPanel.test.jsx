// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import SettingsPanel from './SettingsPanel';

describe('SettingsPanel Responsive Layout Structure', () => {
  test('should render the settings panel grid components correctly', () => {
    const mockSettings = {
      default_model: 'llama3',
      default_language: 'en',
      temperature: 0.7,
      max_history_turns: 10,
      rag_top_k: 4,
      rag_chunk_overlap: 50,
      theme: 'dark',
      minimal_mode: false,
    };

    render(
      <SettingsPanel 
        settings={mockSettings} 
        onSave={vi.fn()} 
        onClose={vi.fn()} 
      />
    );

    // Verify the grid base renders the core labels correctly
    expect(screen.getByTestId('settings-panel')).toBeDefined();
    expect(screen.getByText('Default Model')).toBeDefined();
    expect(screen.getByText('Theme')).toBeDefined();
  });
});