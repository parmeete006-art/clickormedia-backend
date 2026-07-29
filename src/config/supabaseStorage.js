const { createClient } = require('@supabase/supabase-js');

// The service role key is server-only and must never reach the mobile app —
// it bypasses Row Level Security, which is fine here since our Express
// routes already do the auth/ownership checks before touching storage.
let supabase = null;

const DOCS_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'documents';

function createSupabaseClient() {
  if (!supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } catch (error) {
      console.warn('Supabase client initialization failed:', error.message);
      supabase = null;
    }
  }

  return supabase;
}

function requireSupabase() {
  const client = createSupabaseClient();
  if (!client) {
    throw new Error(
      'Supabase Storage is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env'
    );
  }
  return client;
}

module.exports = { supabase: createSupabaseClient, requireSupabase, DOCS_BUCKET };
