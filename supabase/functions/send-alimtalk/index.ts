import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type AlertType =
  | 'check_in'
  | 'check_out'
  | 'homework_done'
  | 'homework_incomplete'
  | 'homework_undone'
  | 'payment_request'
  | 'payment_paid'
  | 'custom';

interface SendAlimtalkRequest {
  studentId?: string;
  paymentId?: string;
  alertType: AlertType;
  recipientPhone: string;
  recipientName?: string;
  subject: string;
  message: string;
  fallbackMessage?: string;
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

function cleanPhone(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

function templateEnvName(alertType: AlertType): string {
  const suffix = alertType.toUpperCase();
  return `ALIGO_TPL_${suffix}`;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = requiredEnv('SUPABASE_URL');
  const supabaseAnonKey = requiredEnv('SUPABASE_ANON_KEY');
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: '로그인이 필요합니다.' }, 401);
  }

  let payload: SendAlimtalkRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: '요청 형식이 올바르지 않습니다.' }, 400);
  }

  const recipientPhone = cleanPhone(payload.recipientPhone ?? '');
  if (!payload.alertType || !recipientPhone || !payload.subject || !payload.message) {
    return jsonResponse({ error: '알림톡 발송에 필요한 정보가 부족합니다.' }, 400);
  }

  const baseLog = {
    student_id: payload.studentId || null,
    payment_id: payload.paymentId || null,
    alert_type: payload.alertType,
    channel: 'alimtalk',
    provider: 'aligo',
    recipient_phone: recipientPhone,
    recipient_name: payload.recipientName || null,
    subject: payload.subject,
    message: payload.message,
  };

  const { data: logRow, error: logError } = await supabase
    .from('growing_message_logs')
    .insert({ ...baseLog, status: 'queued' })
    .select('id')
    .single();

  if (logError) return jsonResponse({ error: logError.message }, 500);
  const logId = logRow.id as string;

  try {
    const userid = requiredEnv('ALIGO_USER_ID');
    const apikey = requiredEnv('ALIGO_API_KEY');
    const senderkey = requiredEnv('ALIGO_SENDER_KEY');
    const sender = requiredEnv('ALIGO_SENDER');
    const tplCode = requiredEnv(templateEnvName(payload.alertType));
    const failover = Deno.env.get('ALIGO_FAILOVER') ?? 'N';
    const testMode = Deno.env.get('ALIGO_TEST_MODE') ?? 'N';

    const form = new URLSearchParams();
    form.set('userid', userid);
    form.set('apikey', apikey);
    form.set('senderkey', senderkey);
    form.set('tpl_code', tplCode);
    form.set('sender', cleanPhone(sender));
    form.set('receiver_1', recipientPhone);
    form.set('recvname_1', payload.recipientName ?? '');
    form.set('subject_1', payload.subject);
    form.set('message_1', payload.message);
    form.set('failover', failover);
    form.set('testMode', testMode);
    if (failover === 'Y') {
      form.set('fsubject_1', payload.subject);
      form.set('fmessage_1', payload.fallbackMessage || payload.message);
    }

    const aligoRes = await fetch('https://kakaoapi.aligo.in/akv10/alimtalk/send/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form,
    });
    const text = await aligoRes.text();
    let providerResponse: Record<string, unknown>;
    try {
      providerResponse = JSON.parse(text);
    } catch {
      providerResponse = { raw: text };
    }

    const code = typeof providerResponse.code === 'number' ? providerResponse.code : null;
    const success = aligoRes.ok && (code === null || code >= 0);
    const providerMessageId =
      providerResponse.mid ?? providerResponse.message_id ?? providerResponse.msg_id ?? null;

    await supabase
      .from('growing_message_logs')
      .update({
        status: success ? 'sent' : 'failed',
        template_code: tplCode,
        provider_message_id: providerMessageId ? String(providerMessageId) : null,
        provider_response: providerResponse,
        error_message: success ? null : String(providerResponse.message ?? '알리고 발송 실패'),
      })
      .eq('id', logId);

    if (!success) {
      return jsonResponse({ error: providerResponse.message ?? '알리고 발송 실패', providerResponse }, 502);
    }

    return jsonResponse({ ok: true, logId, providerResponse });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알림톡 발송 중 오류가 발생했습니다.';
    if (logId) {
      await supabase
        .from('growing_message_logs')
        .update({ status: 'failed', error_message: message })
        .eq('id', logId);
    }
    return jsonResponse({ error: message }, 500);
  }
});
