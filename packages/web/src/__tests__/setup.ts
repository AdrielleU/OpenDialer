import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock EventSource (not available in jsdom)
class MockEventSource {
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

vi.stubGlobal('EventSource', MockEventSource);

// Mock fetch for API calls in components
vi.stubGlobal(
  'fetch',
  vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
);
