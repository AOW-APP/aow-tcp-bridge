import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Bun.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = Bun.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
