import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import tailwindcss from '@tailwindcss/vite'; // Ye plugin zaroori hai

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      tsconfigPaths: true, // Yeh line add kar do warning hatane ke liye
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    server: { entry: "server" },
  },
});