import "@testing-library/dom";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock IntersectionObserver for Navbar scroll-spy tests
global.IntersectionObserver = class IntersectionObserver {
  constructor(
    public callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit,
  ) {}

  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [];
} as any;

// Mock window.scrollY
Object.defineProperty(window, "scrollY", {
  writable: true,
  configurable: true,
  value: 0,
});

// Mock window.matchMedia (used by ThemeProvider for system theme detection)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// This jsdom/Node combination doesn't attach a localStorage implementation to
// window at all, crashing every test that touches it directly or via a
// component like ThemeProvider or SessionProvider with "Cannot read
// properties of undefined (reading 'getItem')". Minimal in-memory polyfill.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, "localStorage", {
    writable: true,
    configurable: true,
    value: new MemoryStorage(),
  });
}
