// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import PluginsPanel from './PluginsPanel';
import { getPlugins, runPlugin } from '../utils/api';

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
];

beforeEach(() => {
  localStorage.clear();
  getPlugins.mockResolvedValue({ plugins: mockPlugins });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PluginsPanel Saved Drafts (#596)', () => {
  test('restores saved plugin draft from localStorage on render', async () => {
    localStorage.setItem('localmind_plugin_draft_session-596', '2 + 2');

    render(<PluginsPanel sessionId="session-596" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Calculator')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Calculator'));

    const textarea = screen.getByPlaceholderText(/Enter input for Calculator.../i);
    expect(textarea.value).toBe('2 + 2');
  });

  test('persists plugin draft to localStorage as user types', async () => {
    render(<PluginsPanel sessionId="session-596" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Calculator')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Calculator'));

    const textarea = screen.getByPlaceholderText(/Enter input for Calculator.../i);
    fireEvent.change(textarea, { target: { value: '10 * 5' } });

    expect(localStorage.getItem('localmind_plugin_draft_session-596')).toBe('10 * 5');
  });

  test('clears saved plugin draft from localStorage upon successful execution', async () => {
    runPlugin.mockResolvedValue({ success: true, output: '50' });

    render(<PluginsPanel sessionId="session-596" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Calculator')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Calculator'));

    const textarea = screen.getByPlaceholderText(/Enter input for Calculator.../i);
    fireEvent.change(textarea, { target: { value: '10 * 5' } });

    const runBtn = screen.getByRole('button', { name: /Run Calculator/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText('50')).toBeInTheDocument();
    });

    expect(localStorage.getItem('localmind_plugin_draft_session-596')).toBeNull();
  });

  test('switches plugin draft dynamically when sessionId changes', async () => {
    localStorage.setItem('localmind_plugin_draft_session-A', 'Draft A');
    localStorage.setItem('localmind_plugin_draft_session-B', 'Draft B');

    const { rerender } = render(<PluginsPanel sessionId="session-A" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Calculator')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Calculator'));

    const textarea = screen.getByPlaceholderText(/Enter input for Calculator.../i);
    expect(textarea.value).toBe('Draft A');

    rerender(<PluginsPanel sessionId="session-B" onClose={vi.fn()} />);

    expect(textarea.value).toBe('Draft B');
  });
});