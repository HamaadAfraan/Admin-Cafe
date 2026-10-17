import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Agar Vite config ya resolve mein kuch custom dalna ho, toh use 'vite' object ke andar rakhte hain
  vite: {
    resolve: {
      // Agar native use karna hai toh yahan dal sakte hain, warna chhod bhi sakte hain
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    server: { entry: "server" },
  },
});