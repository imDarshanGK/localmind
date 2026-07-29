// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import PluginsPanel from './PluginsPanel';
import { getPlugins } from '../utils/api';

expect.extend(jestDomMatchers);

vi.mock('../utils/api', () => ({
  getPlugins: vi.fn(),
  runPlugin: vi.fn(),
}));

vi.mock('./Icons', () => ({
  PlugIcon: () => <span data-testid="plug-icon" />,
  CalculatorIcon: () => <span data-testid="calc-icon" />,
  SummaryIcon: () => <span data-testid="summary-icon" />,
  GlobeIcon: () => <span data-testid="globe-icon" />,
  CodeIcon: () => <span data-testid="code-icon" />,
  HashIcon: () => <span data-testid="hash-icon" />,
  BracesIcon: () => <span data-testid="braces-icon" />,
  ErrorIcon: () => <span data-testid="error-icon" />,
}));

const mockPlugins = [
  { id: 'calculator', name: 'Calculator', description: 'Evaluates expressions', icon: 'calculator' },
  { id: 'summarizer', name: 'Summarizer', description: 'Summarizes text', icon: 'summarizer' }
];

beforeEach(() => {
  localStorage.clear();
  getPlugins.mockResolvedValue({ plugins: mockPlugins });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PluginsPanel Favorite & Pin Support (#601)', () => {
  test('toggles pin state and saves to localStorage', async () => {
    render(<PluginsPanel sessionId="session-601" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Summarizer')).toBeInTheDocument();
    });

    const pinBtn = screen.getByLabelText('Pin Summarizer');
    fireEvent.click(pinBtn);

    expect(screen.getByLabelText('Unpin Summarizer')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('plugins-panel-pinned:session-601'))).toContain('summarizer');
  });

  test('restores pinned favorites from localStorage on mount', async () => {
    localStorage.setItem('plugins-panel-pinned:session-601', JSON.stringify(['summarizer']));

    render(<PluginsPanel sessionId="session-601" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Unpin Summarizer')).toBeInTheDocument();
      expect(screen.getByLabelText('Pin Calculator')).toBeInTheDocument();
    });
  });
});