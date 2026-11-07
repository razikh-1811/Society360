import '@testing-library/jest-dom/vitest';

// jsdom lacks these browser APIs that the app (or Recharts) uses.
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.scrollTo = () => {};
window.print = () => {};
URL.createObjectURL = () => 'blob:test';

// react-hot-toast reads prefers-reduced-motion via matchMedia.
window.matchMedia = window.matchMedia || ((query) => ({
  matches: false, media: query, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
}));
