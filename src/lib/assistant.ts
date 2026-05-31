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

  const res = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ messages: payload }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error ?? `AI 비서 요청에 실패했습니다 (${res.status}).`);
  }
  return {
    reply: data.reply as string,
    model: data.model as string,
    action: data.action as PendingAction | undefined,
  };
}

export async function executeAction(
  action: PendingAction
): Promise<{ success: boolean; message: string }> {
  const headers = await getAuthHeaders();

  const res = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error ?? `처리에 실패했습니다 (${res.status}).`);
  }
  return { success: data.success as boolean, message: data.message as string };
}
