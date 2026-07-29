const { createClient } = require('@supabase/supabase-js');

// The service role key is server-only and must never reach the mobile app —
// it bypasses Row Level Security, which is fine here since our Express
// routes already do the auth/ownership checks before touching storage.
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const DOCS_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'documents';

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase Storage is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env'
    );
  }
  return supabase;
}

module.exports = { supabase, requireSupabase, DOCS_BUCKET };
