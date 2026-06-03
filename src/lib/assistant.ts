import { supabase } from './supabase';

export interface UpdateAttendanceAction {
  type: 'update_attendance';
  attendance_id: string;
  student_name: string;
  date: string;
  old_status: string;
  new_status: string;
}

export interface CreateAttendanceAction {
  type: 'create_attendance';
  student_id: string;
  student_name: string;
  date: string;
  old_status: string;
  new_status: string;
}

export interface UpdatePaymentAction {
  type: 'update_payment';
  payment_id: string;
  student_name: string;
  billing_month: string;
  amount: number;
}

export interface CreateCounselLogAction {
  type: 'create_counsel_log';
  student_id: string;
  student_name: string;
  date: string;
  title: string;
  content: string;
  log_type: string;
  score?: string;
}

export interface UpdateStudentMemoAction {
  type: 'update_student_memo';
  student_id: string;
  student_name: string;
  old_memo: string;
  new_memo: string;
}

export type PendingAction =
  | UpdateAttendanceAction
  | CreateAttendanceAction
  | UpdatePaymentAction
  | CreateCounselLogAction
  | UpdateStudentMemoAction;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  action?: PendingAction;
  actionStatus?: 'pending' | 'approved' | 'rejected';
}

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assistant`;

// 기술적인 오류 메시지를 사용자가 보기 쉬운 한국어 안내로 바꾼다.
function friendlyError(raw: string | undefined, status?: number): string {
  const msg = raw ?? '';
  if (status === 401 || msg.includes('인증')) {
    return '로그인이 풀렸어요. 페이지를 새로고침하고 다시 로그인해 주세요. 🙏';
  }
  if (status === 429 || status === 503 || msg.includes('과부하') || msg.includes('혼잡')) {
    return '지금 AI가 잠시 바빠요. 1~2분 뒤에 다시 시도해 주세요. 🙏';
  }
  if (msg.includes('GEMINI_API_KEY')) {
    return 'AI 비서 설정(API 키)이 아직 준비되지 않았어요. 관리자에게 문의해 주세요.';
  }
  // 그 외 알 수 없는 오류는 따뜻한 기본 멘트로.
  return '아이비가 잠시 답하지 못했어요. 잠시 후 다시 시도해 주세요. 계속 안 되면 새로고침을 부탁드려요. 🙏';
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('로그인이 필요합니다.');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

export async function sendAssistantMessage(
  messages: ChatMessage[]
): Promise<{ reply: string; model: string; action?: PendingAction }> {
  const headers = await getAuthHeaders();
  // ChatMessage를 Edge Function이 기대하는 role/content 쌍만으로 정리
  const payload = messages.map(m => ({ role: m.role, content: m.content }));

  let res: Response;
  try {
    res = await fetch(FUNCTIONS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages: payload }),
    });
  } catch {
    throw new Error('인터넷 연결이 불안정한 것 같아요. 네트워크 상태를 확인하고 다시 시도해 주세요. 📶');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(friendlyError(data?.error, res.status));
  }
  return {
    reply: data.reply as string,
    model: data.model as string,
    action: data.action as PendingAction | undefined,
  };
}

export async function generateCounselBriefing(prompt: string): Promise<string> {
  const { reply } = await sendAssistantMessage([{ role: 'user', content: prompt }]);
  return reply;
}

export async function executeAction(
  action: PendingAction
): Promise<{ success: boolean; message: string }> {
  const headers = await getAuthHeaders();

  let res: Response;
  try {
    res = await fetch(FUNCTIONS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action }),
    });
  } catch {
    throw new Error('인터넷 연결이 불안정한 것 같아요. 네트워크 상태를 확인하고 다시 시도해 주세요. 📶');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(friendlyError(data?.error, res.status));
  }
  return { success: data.success as boolean, message: data.message as string };
}
