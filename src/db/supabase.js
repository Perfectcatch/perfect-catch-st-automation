/**
 * Supabase Client Singleton
 * Replaces Prisma for simplified database access
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('supabase');

// Global variable to store the Supabase client instance
let supabase = null;

/**
 * Get or create the Supabase client instance
 * @returns {SupabaseClient}
 */
export function getSupabaseClient() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;

    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    }

    supabase = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    logger.info('Supabase client initialized');
  }

  return supabase;
}

/**
 * Check database connection
 * @returns {Promise<boolean>}
 */
export async function checkDatabaseConnection() {
  try {
    const client = getSupabaseClient();
    const { error } = await client.from('sync_log').select('id').limit(1);
    
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = table doesn't exist yet, which is fine for initial setup
      throw error;
    }
    
    return true;
  } catch (error) {
    logger.error({ error: error.message }, 'Database connection check failed');
    return false;
  }
}

/**
 * Execute raw SQL (for migrations)
 * Note: Requires database function to be set up in Supabase
 */
export async function executeSQL(sql) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('exec_sql', { sql_query: sql });
  
  if (error) throw error;
  return data;
}

export default getSupabaseClient;
