import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import netlify from "@netlify/vite-plugin-tanstack-start";

export default defineConfig({
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      // Points TanStack Start's server request-handler entry at
      // src/server.ts (our SSR error wrapper around h3's swallowed
      // errors) - this is separate from src/start.ts's `startInstance`
      // config, which is auto-discovered by convention.
      server: { entry: "server" },
    }),
    viteReact(),
    // Emits the Netlify server function + routing for the SSR build. This is
    // what makes dist/client deployable - on its own it holds only hashed
    // assets and no index.html, so every route 404s without a server handler.
    netlify(),
  ],
});
