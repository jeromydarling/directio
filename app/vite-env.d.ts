/// <reference types="vite/client" />

declare module "*.svg?raw" {
  const content: string;
  export default content;
}

// Injected by the root loader in app/root.tsx (see window.ENV script). Holds
// only publishable values that are safe to ship to the browser.
declare global {
  interface Window {
    ENV?: {
      SENTRY_DSN?: string;
    };
  }
}

export {};
