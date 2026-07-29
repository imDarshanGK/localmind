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

describe('PluginsPanel Contextual Action Menu (#602)', () => {
  test('opens context action menu on trigger button click', async () => {
    render(<PluginsPanel sessionId="session-602" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Calculator')).toBeInTheDocument();
    });

    const optionsBtn = screen.getByLabelText('Options for Calculator');
    fireEvent.click(optionsBtn);

    expect(screen.getByText('Select & Run')).toBeInTheDocument();
    expect(screen.getByText('Copy Details')).toBeInTheDocument();
  });

  test('selects plugin via contextual menu option', async () => {
    render(<PluginsPanel sessionId="session-602" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Calculator')).toBeInTheDocument();
    });

    const optionsBtn = screen.getByLabelText('Options for Calculator');
    fireEvent.click(optionsBtn);

    const selectMenuItem = screen.getByText('Select & Run');
    fireEvent.click(selectMenuItem);

    expect(screen.getByText('Evaluates expressions')).toBeInTheDocument();
  });
});