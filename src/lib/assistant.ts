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

export interface CreateAssistantNoteAction {
  type: 'create_assistant_note';
  scope: 'academy' | 'student';
  student_id: string | null;
  student_name: string | null;
  category: string;
  content: string;
}

export type PendingAction =
  | UpdateAttendanceAction
  | CreateAttendanceAction
  | UpdatePaymentAction
  | CreateCounselLogAction
  | UpdateStudentMemoAction
  | CreateAssistantNoteAction;

export type ActionStatus = 'pending' | 'approved' | 'rejected';

export interface ProposedAction {
  action: PendingAction;
  status: ActionStatus;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  // 아이비가 답을 만들며 거친 단계(자료 조회 등). '생각 과정'으로 접어서 보여준다.
  steps?: string[];
  // 승인해야 저장되는 변경 제안. 한 답변에 여러 건이 올 수 있다.
  actions?: ProposedAction[];
}

export interface AssistantReply {
  reply: string;
  model: string;
  steps: string[];
  actions: PendingAction[];
}

export interface AssistantStreamHandlers {
  onProgress?: (message: string) => void;
  onDelta?: (text: string) => void;
  // 도구 호출 전에 흘러나온 문장은 최종 답이 아니라서 지운다.
  onReset?: () => void;
}

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assistant`;

// 기술적인 오류 메시지를 사용자가 보기 쉬운 한국어 안내로 바꾼다.
function friendlyError(raw: string | undefined, status?: number): string {
  const msg = raw ?? '';
  if (status === 401 || msg.includes('인증')) {
    return '로그인이 풀렸어요. 페이지를 새로고침하고 다시 로그인해 주세요. 🙏';
  }
  // 키 누락·거부도 503으로 오므로 과부하 안내보다 먼저 확인한다.
  if (msg.includes('OPENAI_API_KEY')) {
    return 'AI 비서 설정(API 키)이 아직 준비되지 않았어요. 관리자에게 문의해 주세요.';
  }
  if (status === 429 || status === 503 || msg.includes('과부하') || msg.includes('혼잡')) {
    return '지금 AI가 잠시 바빠요. 1~2분 뒤에 다시 시도해 주세요. 🙏';
  }
  // 질문 범위·시간 초과 안내는 서버 문구가 이미 사용자용이다.
  if ((status === 422 || status === 504) && msg) return msg;
  // 그 외 알 수 없는 오류는 따뜻한 기본 멘트로.
  return '아이비가 잠시 답하지 못했어요. 잠시 후 다시 시도해 주세요. 계속 안 되면 새로고침을 부탁드려요. 🙏';
}

function toReply(data: Record<string, unknown>): AssistantReply {
  const actions = Array.isArray(data.actions)
    ? data.actions as PendingAction[]
    : data.action ? [data.action as PendingAction] : [];
  return {
    reply: typeof data.reply === 'string' ? data.reply : '',
    model: typeof data.model === 'string' ? data.model : '',
    steps: Array.isArray(data.steps) ? data.steps.filter((s): s is string => typeof s === 'string') : [],
    actions,
  };
}

const NETWORK_ERROR = '인터넷 연결이 불안정한 것 같아요. 네트워크 상태를 확인하고 다시 시도해 주세요. 📶';

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('로그인이 필요합니다.');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

// ChatMessage를 Edge Function이 기대하는 role/content 쌍만으로 정리
const toPayload = (messages: ChatMessage[]) => messages.map(m => ({ role: m.role, content: m.content }));

export async function sendAssistantMessage(messages: ChatMessage[]): Promise<AssistantReply> {
  const headers = await getAuthHeaders();

  let res: Response;
  try {
    res = await fetch(FUNCTIONS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages: toPayload(messages) }),
    });
  } catch {
    throw new Error(NETWORK_ERROR);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(friendlyError(data?.error, res.status));
  }
  return toReply(data);
}

// SSE 한 덩어리("event: x\ndata: {...}")를 이벤트 이름과 데이터로 나눈다.
export function parseSseBlock(block: string): { event: string; data: Record<string, unknown> } | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  try {
    const data = JSON.parse(dataLines.join('\n'));
    return data && typeof data === 'object' ? { event, data } : null;
  } catch {
    return null;
  }
}

// 진행 단계와 답변을 실시간으로 받는다. 서버가 JSON으로 답하면(배포 전환 중 등) 그대로 받아들인다.
export async function streamAssistantMessage(
  messages: ChatMessage[],
  handlers: AssistantStreamHandlers = {},
): Promise<AssistantReply> {
  const headers = await getAuthHeaders();

  let res: Response;
  try {
    res = await fetch(FUNCTIONS_URL, {
      method: 'POST',
      headers: { ...headers, Accept: 'text/event-stream' },
      body: JSON.stringify({ messages: toPayload(messages), stream: true }),
    });
  } catch {
    throw new Error(NETWORK_ERROR);
  }

  const isStream = res.headers.get('content-type')?.includes('text/event-stream');
  if (!res.ok || !isStream || !res.body) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(friendlyError(data?.error, res.status));
    return toReply(data);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  // consume 안에서 채워지므로 선언 시점의 null로 좁혀지지 않게 한다.
  let done = null as AssistantReply | null;

  const consume = (block: string) => {
    const parsed = parseSseBlock(block);
    if (!parsed) return;
    const { event, data } = parsed;
    if (event === 'progress' && typeof data.message === 'string') handlers.onProgress?.(data.message);
    else if (event === 'delta' && typeof data.text === 'string') handlers.onDelta?.(data.text);
    else if (event === 'reset') handlers.onReset?.();
    else if (event === 'done') done = toReply(data);
    else if (event === 'error') {
      throw new Error(friendlyError(typeof data.error === 'string' ? data.error : undefined, Number(data.status) || undefined));
    }
  };

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        throw new Error(NETWORK_ERROR);
      }
      if (chunk.done) break;
      pending += decoder.decode(chunk.value, { stream: true });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(pending))) {
        consume(pending.slice(0, boundary.index));
        pending = pending.slice(boundary.index + boundary[0].length);
      }
    }
    pending += decoder.decode();
    if (pending.trim()) consume(pending);
  } finally {
    reader.releaseLock();
  }

  if (!done) throw new Error('아이비의 답변이 중간에 끊겼어요. 다시 시도해 주세요. 🙏');
  return done;
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
    throw new Error(NETWORK_ERROR);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(friendlyError(data?.error, res.status));
  }
  // 검증 실패는 200 + { success: false, error }로 온다.
  return { success: data.success === true, message: String(data.message ?? data.error ?? '') };
}
