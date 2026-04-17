import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://yuokztriptlugbmdoszb.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_nKodTUuKk58E5pcOnMvtKQ_e8qhnalu'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
