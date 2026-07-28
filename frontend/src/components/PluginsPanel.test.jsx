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

const mockPluginsWithCompatibility = [
  { 
    id: 'calculator', 
    name: 'Calculator', 
    description: 'Evaluates expressions', 
    icon: 'calculator',
    compatibility: ['v1.0', 'Local'] 
  },
  { 
    id: 'summarizer', 
    name: 'Summarizer', 
    description: 'Summarizes text', 
    icon: 'summarizer',
    compatibility: ['v2.0', 'Cloud'] 
  }
];

beforeEach(() => {
  localStorage.clear();
  getPlugins.mockResolvedValue({ plugins: mockPluginsWithCompatibility });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PluginsPanel Compatibility Badges (#597)', () => {
  test('renders compatibility badges for each plugin in the catalog selector', async () => {
    render(<PluginsPanel sessionId="session-597" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Calculator')).toBeInTheDocument();
    });

    const badges = screen.getAllByTestId('compatibility-badge');
    expect(badges.length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('v1.0')).toBeInTheDocument();
    expect(screen.getByText('Local')).toBeInTheDocument();
    expect(screen.getByText('v2.0')).toBeInTheDocument();
    expect(screen.getByText('Cloud')).toBeInTheDocument();
  });

  test('displays plugin compatibility metadata in detailed selection view', async () => {
    render(<PluginsPanel sessionId="session-597" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Calculator')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Calculator'));

    expect(screen.getByText('Compatibility:')).toBeInTheDocument();
  });
});