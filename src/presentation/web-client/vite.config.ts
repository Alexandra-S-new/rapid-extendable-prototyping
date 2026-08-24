import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// vite.config.ts (Subtask 23 §7/§41/§42): einzige Frontend-Build-Dependency.
// Reiner Build (kein Dev-Server im Einsatz) — der node:http-Server liefert
// die gebauten, statischen Dateien selbst aus (kein zweiter Prozess, keine
// CORS-Notwendigkeit, Subtask 23 §43). root zeigt bewusst auf dieses
// Verzeichnis, damit `vite build` unabhängig vom aufrufenden Arbeitsordner
// funktioniert. ESM-Projekt (package.json "type": "module") — kein
// CommonJS-__dirname verfügbar, daher über import.meta.url aufgelöst.
const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: here,
  build: {
    outDir: '../../../dist/web-client',
    emptyOutDir: true,
  },
});
