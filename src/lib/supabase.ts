import { createClient } from '@supabase/supabase-js';

// The publishable (anon) key is safe to ship in the client: every request is
// constrained by row level security, which scopes growing_* rows to the
// signed-in owner. The URL/key come from build-time env (.env).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);
