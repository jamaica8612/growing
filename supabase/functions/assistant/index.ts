// Supabase Edge Function: AI 학원 비서 (Phase 0 — 파이프 검증)
//
// 정적 호스팅(GitHub Pages)에서는 GEMINI_API_KEY를 노출할 수 없으므로, 이
// 함수가 프론트엔드와 Gemini API 사이의 중계 계층 역할을 한다. 호출은 항상
// 로그인한 원장님의 Supabase JWT로 이루어지며(플랫폼 verify_jwt + 아래 사용자
// 확인), 추후 Phase에서 동일 토큰으로 RLS 범위 내 DB 조회 tool을 실행한다.
//
// Phase 0 범위: 인증 확인 → 대화 메시지를 Gemini로 전달 → 답변 반환.
// (DB 조회/쓰기 tool, 멀티 에이전트는 Phase 1~3에서 추가)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// 모델 티어링: 라우터/조회 등 단순 작업은 저렴한 lite, 안내장 작성·종합 등
// 품질이 필요한 작업만 flash. Phase 0에서는 단일 응답이라 flash만 사용한다.
const MODELS = {
  lite: 'gemini-2.5-flash-lite',
  flash: 'gemini-2.5-flash',
} as const;

const SYSTEM_PROMPT = `당신은 '그로잉영어' 영어 교습소의 AI 운영 비서입니다.
원장님을 도와 학생·출결·수납·상담 업무를 돕습니다.
항상 한국어로 간결하고 정중하게(존댓말) 답합니다.
지금은 초기 단계라 아직 학원 데이터베이스에 직접 연결되어 있지 않습니다.
데이터 조회가 필요한 질문에는 "곧 연결될 예정"임을 알리고, 일반적인 운영 도움말을 제공하세요.`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Gemini generateContent 호출. 대화 히스토리를 Gemini 형식(user/model)으로 변환.
async function callGemini(model: string, system: string, messages: ChatMessage[]): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY 시크릿이 설정되지 않았습니다.');

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini 호출 실패 (${res.status}): ${detail.slice(0, 500)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p: { text?: string }) => p.text ?? '').join('').trim();
  return text || '(빈 응답을 받았습니다.)';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST 요청만 지원합니다.' }, 405);
  }

  try {
    // 인증 사용자 확인: 전달된 JWT로 사용자 객체를 얻는다(추후 RLS 호출에 재사용).
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return jsonResponse({ error: '인증이 필요합니다. 다시 로그인해 주세요.' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
    if (messages.length === 0) {
      return jsonResponse({ error: '메시지가 비어 있습니다.' }, 400);
    }

    const reply = await callGemini(MODELS.flash, SYSTEM_PROMPT, messages);
    return jsonResponse({ reply, model: MODELS.flash });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' }, 500);
  }
});
