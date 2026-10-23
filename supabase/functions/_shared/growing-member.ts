import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.110.4';

export const NOT_A_MEMBER_MESSAGE = '그로잉 사용 승인이 필요한 계정입니다.';

// The Supabase project is shared with other apps, so a valid login alone is not
// enough to use Growing's paid AI functions. `client` must carry the caller's
// JWT; RLS only lets a user see their own growing_members row.
export async function isGrowingMember(client: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await client
    .from('growing_members')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
