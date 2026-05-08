import { defineConfig } from 'vite';

// Für GitHub Pages: VITE_BASE_PATH wird im CI auf /<repo-name>/ gesetzt.
// Lokal bleibt der Wert '/' (normaler Dev-Server).
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
});
