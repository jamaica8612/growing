import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.4';
import {
  ALIMTALK_LIMITS,
  parseAlimtalkRequest,
  resolveOwnedRecipient,
  type AlimtalkAlertType,
  type OwnedPaymentRow,
  type OwnedStudentRow,
} from './policy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_REQUEST_BODY_BYTES = 16_384;
const textEncoder = new TextEncoder();

function jsonResponse(
  obj: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

function templateEnvName(alertType: AlimtalkAlertType): string {
  return `ALIGO_TPL_${alertType.toUpperCase()}`;
}

function providerCode(response: Record<string, unknown>): number | null {
  const raw = response.code ?? response.result_code;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && /^-?[0-9]+$/.test(raw.trim())) return Number(raw);
  return null;
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: '허용되지 않는 요청입니다.' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch?.[1]) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);

  const supabaseUrl = requiredEnv('SUPABASE_URL');
  const supabaseAnonKey = requiredEnv('SUPABASE_ANON_KEY');
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(tokenMatch[1]);
  if (userError || !userData.user) {
    return jsonResponse({ error: '로그인이 필요합니다.' }, 401);
  }
  const ownerId = userData.user.id;

  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    return jsonResponse({ error: '요청 내용이 너무 큽니다.' }, 413);
  }

  let rawPayload: unknown;
  try {
    const rawBody = await req.text();
    if (textEncoder.encode(rawBody).byteLength > MAX_REQUEST_BODY_BYTES) {
      return jsonResponse({ error: '요청 내용이 너무 큽니다.' }, 413);
    }
    rawPayload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: '요청 형식이 올바르지 않습니다.' }, 400);
  }

  const parsed = parseAlimtalkRequest(rawPayload);
  if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400);
  const payload = parsed.value;

  const studentResult = await supabase
    .from('growing_students')
    .select('id, owner_id, name, parent_contact')
    .eq('id', payload.studentId)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (studentResult.error) {
    console.error('Failed to resolve owned student for alimtalk');
    return jsonResponse({ error: '학생 정보를 확인하지 못했습니다.' }, 500);
  }

  let payment: OwnedPaymentRow | null = null;
  if (payload.paymentId) {
    const paymentResult = await supabase
      .from('growing_payments')
      .select('id, owner_id, student_id')
      .eq('id', payload.paymentId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (paymentResult.error) {
      console.error('Failed to resolve owned payment for alimtalk');
      return jsonResponse({ error: '수납 정보를 확인하지 못했습니다.' }, 500);
    }
    payment = paymentResult.data as OwnedPaymentRow | null;
  }

  const recipient = resolveOwnedRecipient(
    ownerId,
    payload,
    studentResult.data as OwnedStudentRow | null,
    payment,
  );
  if (!recipient.ok) return jsonResponse({ error: recipient.error }, recipient.status);

  const now = Date.now();
  const [ownerFiveMinutes, ownerDay, studentHour] = await Promise.all([
    supabase
      .from('growing_message_logs')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId)
      .gte('created_at', new Date(now - 5 * 60 * 1_000).toISOString()),
    supabase
      .from('growing_message_logs')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId)
      .gte('created_at', new Date(now - 24 * 60 * 60 * 1_000).toISOString()),
    supabase
      .from('growing_message_logs')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId)
      .eq('student_id', payload.studentId)
      .gte('created_at', new Date(now - 60 * 60 * 1_000).toISOString()),
  ]);
  if (ownerFiveMinutes.error || ownerDay.error || studentHour.error) {
    console.error('Failed to evaluate alimtalk rate limit');
    return jsonResponse({ error: '발송 한도를 확인하지 못했습니다.' }, 500);
  }

  let retryAfter = 0;
  if ((studentHour.count ?? 0) >= ALIMTALK_LIMITS.sendsPerStudentPerHour) retryAfter = 60 * 60;
  else if ((ownerFiveMinutes.count ?? 0) >= ALIMTALK_LIMITS.sendsPerOwnerPerFiveMinutes) retryAfter = 5 * 60;
  else if ((ownerDay.count ?? 0) >= ALIMTALK_LIMITS.sendsPerOwnerPerDay) retryAfter = 24 * 60 * 60;
  if (retryAfter > 0) {
    return jsonResponse(
      { error: '알림톡 발송 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      429,
      { 'Retry-After': String(retryAfter) },
    );
  }

  const baseLog = {
    owner_id: ownerId,
    student_id: payload.studentId,
    payment_id: payload.paymentId ?? null,
    alert_type: payload.alertType,
    channel: 'alimtalk',
    provider: 'aligo',
    recipient_phone: recipient.recipientPhone,
    recipient_name: recipient.recipientName || null,
    subject: payload.subject,
    message: payload.message,
  };

  const { data: logRow, error: logError } = await supabase
    .from('growing_message_logs')
    .insert({ ...baseLog, status: 'queued' })
    .select('id')
    .single();

  if (logError || !logRow?.id) {
    console.error('Failed to create alimtalk message log');
    return jsonResponse({ error: '알림톡 발송 기록을 만들지 못했습니다.' }, 500);
  }
  const logId = String(logRow.id);

  try {
    const userid = requiredEnv('ALIGO_USER_ID');
    const apikey = requiredEnv('ALIGO_API_KEY');
    const senderkey = requiredEnv('ALIGO_SENDER_KEY');
    const sender = requiredEnv('ALIGO_SENDER');
    const tplCode = requiredEnv(templateEnvName(payload.alertType));
    const failover = Deno.env.get('ALIGO_FAILOVER') === 'Y' ? 'Y' : 'N';
    const testMode = Deno.env.get('ALIGO_TEST_MODE') === 'Y' ? 'Y' : 'N';

    const form = new URLSearchParams();
    form.set('userid', userid);
    form.set('apikey', apikey);
    form.set('senderkey', senderkey);
    form.set('tpl_code', tplCode);
    form.set('sender', digitsOnly(sender));
    form.set('receiver_1', recipient.recipientPhone);
    form.set('recvname_1', recipient.recipientName);
    form.set('subject_1', payload.subject);
    form.set('message_1', payload.message);
    form.set('failover', failover);
    form.set('testMode', testMode);
    if (failover === 'Y') {
      form.set('fsubject_1', payload.subject);
      form.set('fmessage_1', payload.fallbackMessage ?? payload.message);
    }

    const aligoResponse = await fetch('https://kakaoapi.aligo.in/akv10/alimtalk/send/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form,
    });
    const responseText = await aligoResponse.text();
    let providerResponse: Record<string, unknown>;
    try {
      const decoded: unknown = JSON.parse(responseText);
      providerResponse = typeof decoded === 'object' && decoded !== null && !Array.isArray(decoded)
        ? decoded as Record<string, unknown>
        : { raw: decoded };
    } catch {
      providerResponse = { raw: responseText.slice(0, 2_000) };
    }

    const code = providerCode(providerResponse);
    const success = aligoResponse.ok && code !== null && code >= 0;
    const providerMessageId =
      providerResponse.mid ?? providerResponse.message_id ?? providerResponse.msg_id ?? null;

    const updateResult = await supabase
      .from('growing_message_logs')
      .update({
        status: success ? 'sent' : 'failed',
        template_code: tplCode,
        provider_message_id: providerMessageId ? String(providerMessageId) : null,
        provider_response: providerResponse,
        error_message: success ? null : String(providerResponse.message ?? '알리고 발송 실패'),
      })
      .eq('id', logId)
      .eq('owner_id', ownerId);
    if (updateResult.error) console.error('Failed to update alimtalk message log');

    if (!success) {
      return jsonResponse({ error: '알림톡 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, 502);
    }

    return jsonResponse({ ok: true, logId });
  } catch (error) {
    console.error('Alimtalk provider request failed', error instanceof Error ? error.message : 'unknown error');
    await supabase
      .from('growing_message_logs')
      .update({ status: 'failed', error_message: '알림톡 발송 중 오류가 발생했습니다.' })
      .eq('id', logId)
      .eq('owner_id', ownerId);
    return jsonResponse({ error: '알림톡 발송 중 오류가 발생했습니다.' }, 500);
  }
}

Deno.serve(async req => {
  try {
    return await handleRequest(req);
  } catch (error) {
    console.error('Unhandled send-alimtalk error', error instanceof Error ? error.message : 'unknown error');
    return jsonResponse({ error: '알림톡 요청을 처리하지 못했습니다.' }, 500);
  }
});
