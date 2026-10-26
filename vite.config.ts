import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Two builds:
//   default  -> dist/          the hosted dashboard (relative base, works under any path)
//   offline  -> dist-offline/  one self-contained HTML file people can download and open locally
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), tailwindcss(), ...(mode === "offline" ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === "offline" ? "dist-offline" : "dist",
    // the sample CSVs are bundled into the app, so the main chunk is large by design
    chunkSizeWarningLimit: 3000
  }
}));
