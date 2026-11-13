import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Vite-Konfiguration der Vorschau (`npm run vorschau`).
 *
 * Eigene Wurzel, damit die reguläre `index.html` und `npm run build`
 * unberührt bleiben. Der Code der Anwendung kommt aus `../src`.
 */
const vorschau = fileURLToPath(new URL(".", import.meta.url));
const projekt = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root: vorschau,
  publicDir: `${projekt}public`,
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
    fs: { allow: [projekt] },
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
