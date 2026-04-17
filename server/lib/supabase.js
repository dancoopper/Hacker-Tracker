/**
 * server/lib/supabase.js
 * Initialises and exports a shared Supabase client.
 * Reads credentials from environment variables (loaded via dotenv in index.js).
 */

const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
    throw new Error(
        'Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file.'
    );
}

const supabase = createClient(url, key);

module.exports = supabase;
