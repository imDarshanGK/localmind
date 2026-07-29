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
  {
    id: 'calculator',
    name: 'Calculator',
    description: 'Evaluates math expressions',
    icon: 'calculator',
    changelog: [
      { version: 'v1.1.0', date: '2026-06-01', changes: 'Added scientific mode.' },
    ],
  },
  {
    id: 'summarizer',
    name: 'Summarizer',
    description: 'Summarizes long text',
    icon: 'summarizer',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  getPlugins.mockResolvedValue({ plugins: mockPlugins });
});

afterEach(() => {
  cleanup();
});

describe('PluginsPanel Changelog Previews (#603)', () => {
  test('renders plugin list correctly', async () => {
    render(<PluginsPanel sessionId="session-603" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Calculator')).toBeInTheDocument();
      expect(screen.getByText('Summarizer')).toBeInTheDocument();
    });
  });

  test('opens changelog preview modal when "View Changelog" is clicked', async () => {
    render(<PluginsPanel sessionId="session-603" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Calculator')).toBeInTheDocument();
    });

    const optionsBtn = screen.getByLabelText('Options for Calculator');
    fireEvent.click(optionsBtn);

    const changelogBtn = screen.getByText('View Changelog');
    fireEvent.click(changelogBtn);

    expect(screen.getByTestId('changelog-modal')).toBeInTheDocument();
    expect(screen.getByText('v1.1.0')).toBeInTheDocument();
    expect(screen.getByText('Added scientific mode.')).toBeInTheDocument();
  });

  test('displays fallback message when plugin has no changelog entries', async () => {
    render(<PluginsPanel sessionId="session-603" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Summarizer')).toBeInTheDocument();
    });

    const optionsBtn = screen.getByLabelText('Options for Summarizer');
    fireEvent.click(optionsBtn);

    const changelogBtn = screen.getByText('View Changelog');
    fireEvent.click(changelogBtn);

    expect(
      screen.getByText('No changelog preview available for Summarizer.')
    ).toBeInTheDocument();
  });
});