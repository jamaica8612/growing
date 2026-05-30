import { supabase } from './supabase';

// AI 비서 채팅 메시지. role은 화면/전송 모두에서 쓰는 최소 형태.
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assistant`;

// 'assistant' Edge Function을 호출한다. 로그인 세션의 access token을 실어
// 보내 함수 측에서 사용자를 식별하고(추후 RLS 범위 DB 접근), 직접 fetch를
// 써서 오류 본문(JSON의 error)을 그대로 읽어 사용자에게 보여준다.
export async function sendAssistantMessage(
  messages: ChatMessage[]
): Promise<{ reply: string; model: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const res = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ messages }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error ?? `AI 비서 요청에 실패했습니다 (${res.status}).`);
  }
  return { reply: data.reply as string, model: data.model as string };
}
