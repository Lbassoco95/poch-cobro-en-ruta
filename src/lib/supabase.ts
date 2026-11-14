import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const llave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigurado = Boolean(url && llave);

export const supabase: SupabaseClient | null = supabaseConfigurado
  ? createClient(url, llave, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
