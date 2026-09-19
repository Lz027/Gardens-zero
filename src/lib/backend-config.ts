/**
 * Gardens Zero backend (Supabase) connection details.
 *
 * These are baked into the build on purpose so the app works when hosted
 * anywhere (Netlify, static hosts, self-hosted) without configuring any
 * environment variables. Environment variables, when present, win.
 *
 * Only the publishable ("anon") key lives here — it is safe in client code and
 * all access is guarded by row level security.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const SUPABASE_URL = env["VITE_SUPABASE_URL"] || "https://yotwfwyvovgjvleqllqb.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY = env["VITE_SUPABASE_PUBLISHABLE_KEY"];

export const SUPABASE_PROJECT_ID = env["VITE_SUPABASE_PROJECT_ID"] || "yotwfwyvovgjvleqllqb";
