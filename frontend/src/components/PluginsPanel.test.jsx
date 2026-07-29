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
  getPlugins.mockResolvedValue({ plugins: mockPlugins });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PluginsPanel Search Refinement (#600)', () => {
  test('filters plugins in real time as the user types', async () => {
    render(<PluginsPanel sessionId="session-600" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Calculator')).toBeInTheDocument();
      expect(screen.getByText('Summarizer')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search plugins...');
    fireEvent.change(searchInput, { target: { value: 'calc' } });

    expect(screen.getByText('Calculator')).toBeInTheDocument();
    expect(screen.queryByText('Summarizer')).not.toBeInTheDocument();
  });

  test('displays empty message when no plugins match search query', async () => {
    render(<PluginsPanel sessionId="session-600" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Calculator')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search plugins...');
    fireEvent.change(searchInput, { target: { value: 'unknown' } });

    expect(screen.getByText('No matching plugins found.')).toBeInTheDocument();
  });
});