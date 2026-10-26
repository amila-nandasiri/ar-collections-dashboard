import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Relative base so the build works on GitHub Pages under any path
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  // the sample CSVs are bundled into the app, so the main chunk is large by design
  build: { chunkSizeWarningLimit: 2500 }
});
