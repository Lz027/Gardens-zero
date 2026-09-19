import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import tsconfigPaths from "vite-tsconfig-paths";

const SUPABASE_URL = process.env["VITE_SUPABASE_URL"] || "https://yotwfwyvovgjvleqllqb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || "";
const SUPABASE_PROJECT_ID = process.env["VITE_SUPABASE_PROJECT_ID"] || "yotwfwyvovgjvleqllqb";

process.env["VITE_SUPABASE_URL"] = SUPABASE_URL;
process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] = SUPABASE_PUBLISHABLE_KEY;
process.env["VITE_SUPABASE_PROJECT_ID"] = SUPABASE_PROJECT_ID;
process.env["SUPABASE_URL"] = SUPABASE_URL;
process.env["SUPABASE_PUBLISHABLE_KEY"] = SUPABASE_PUBLISHABLE_KEY;
process.env["SUPABASE_PROJECT_ID"] = SUPABASE_PROJECT_ID;

// Deployment adapter (Netlify, etc.) is only wired in when a preset is requested,
// so the default build keeps its plain dist/client + dist/server output.
const deployPreset = process.env["NITRO_PRESET"] || (process.env["NETLIFY"] ? "netlify" : "");

export default defineConfig({
  plugins: [
    tanstackStart({
      server: { entry: "server" },
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
    ...(deployPreset ? [nitro({ preset: deployPreset })] : []),
  ],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    host: "::",
    port: 8080,
    strictPort: true,
  },
});
