import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.4';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedSupabaseClient = ReturnType<typeof createClient<any>>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-kakao-event-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface KakaoChannelEventPayload {
  event?: string;
  user?: {
    id?: string;
    properties?: {
      plusfriendUserKey?: string;
    };
  };
}

interface KakaoChannelRow {
  owner_id: string;
  enabled: boolean;
}

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function getEventSecret(req: Request): string {
  const url = new URL(req.url);
  return (
    req.headers.get('x-kakao-event-secret') ||
    url.searchParams.get('secret') ||
    url.searchParams.get('event_secret') ||
    ''
  );
}

async function resolveChannelOwner(supabase: UntypedSupabaseClient, eventSecret: string): Promise<string | null> {
  if (!eventSecret) return null;
  const { data, error } = await supabase
    .from('growing_kakao_channels')
    .select('owner_id, enabled')
    .eq('event_secret', eventSecret)
    .eq('enabled', true)
    .maybeSingle();
  if (error) throw error;
  return (data as KakaoChannelRow | null)?.owner_id ?? null;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let payload: KakaoChannelEventPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const ownerId = await resolveChannelOwner(supabase, getEventSecret(req));
  if (!ownerId) {
    return jsonResponse({ error: 'Unauthorized channel' }, 401);
  }

  const kakaoUserKey = payload.user?.id ?? '';
  const plusfriendUserKey = payload.user?.properties?.plusfriendUserKey ?? null;
  const eventType = payload.event ?? 'channel_event';

  const now = new Date().toISOString();
  if (eventType.includes('block') || eventType.includes('unlink') || eventType.includes('unfollow')) {
    await supabase
      .from('growing_kakao_parent_links')
      .update({ blocked_at: now })
      .eq('owner_id', ownerId)
      .eq('kakao_user_key', kakaoUserKey);
  }

  await supabase.from('growing_kakao_events').insert({
    owner_id: ownerId,
    kakao_user_key: kakaoUserKey,
    plusfriend_user_key: plusfriendUserKey,
    event_type: eventType,
    status: 'received',
    raw_payload: payload,
  });

  return jsonResponse({ ok: true });
});
