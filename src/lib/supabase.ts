import { createClient } from "@supabase/supabase-js";

// Public (anon) values only — never put a service_role/secret key here.
// Env vars override these publishable defaults.
const url =
  import.meta.env.VITE_SUPABASE_URL || "https://kvxcgliptbpqhwkhjfgm.supabase.co";
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2eGNnbGlwdGJwcWh3a2hqZmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQwNTY3MzcsImV4cCI6MjEwOTYzMjczN30.lCeeKQVkRqzQD9t8NDEQReuiyRDJKwrqIU-Y9AffCRQ";

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: typeof window !== "undefined",
    autoRefreshToken: typeof window !== "undefined",
  },
});
