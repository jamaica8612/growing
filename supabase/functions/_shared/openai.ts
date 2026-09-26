// OpenAI Responses API 공통 호출부 (assistant / exam-generate / exam-public).
//
// 같은 Supabase 프로젝트의 다른 앱이 OPENAI_API_KEY를 쓰고 있어서, 그로잉은
// 과금을 분리하려고 전용 시크릿 GROWING_OPENAI_API_KEY를 읽는다.

export const OPENAI_KEY_SECRET = 'GROWING_OPENAI_API_KEY';
export const OPENAI_MODEL_SECRET = 'GROWING_OPENAI_MODEL';
export const DEFAULT_OPENAI_MODEL = 'gpt-6-luna';

const RESPONSES_URL = 'https://api.openai.com/v1/responses';
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 2;
const MAX_STREAM_BUFFER = 1_000_000;

export type ResponseItem = Record<string, unknown> & { type?: string };

export interface OpenAIResponse {
  status?: string;
  output?: ResponseItem[];
  usage?: { output_tokens?: number };
  incomplete_details?: { reason?: string } | null;
}

export interface FunctionCall {
  call_id: string;
  name: string;
  arguments: string;
}

export class OpenAIError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'OpenAIError';
    this.status = status;
  }
}

export const OVERLOADED_MESSAGE = '지금 AI 서버가 잠시 혼잡해요(일시적 과부하). 잠깐 뒤 다시 시도해 주세요. 🙏';
export const MISSING_KEY_MESSAGE = `${OPENAI_KEY_SECRET} 시크릿이 설정되지 않았습니다.`;

export function openAIConfig(getEnv: (name: string) => string | undefined = name => Deno.env.get(name)) {
  const apiKey = getEnv(OPENAI_KEY_SECRET)?.trim() || null;
  const model = getEnv(OPENAI_MODEL_SECRET)?.trim() || DEFAULT_OPENAI_MODEL;
  return { apiKey, model };
}

interface CreateResponseOptions {
  stream?: boolean;
  onTextDelta?: (text: string) => void;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  retryDelayMs?: number;
}

async function errorDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const message = JSON.parse(text)?.error?.message;
    if (typeof message === 'string' && message) return message.slice(0, 200);
  } catch { /* 본문이 JSON이 아니면 그대로 쓴다 */ }
  return text.slice(0, 200);
}

function failureFor(status: number, detail: string): OpenAIError {
  if (status === 429 || status >= 500) return new OpenAIError(OVERLOADED_MESSAGE, status);
  if (status === 401 || status === 403) {
    return new OpenAIError(`${OPENAI_KEY_SECRET} 키가 거부됐어요 (${status}). 시크릿 값과 모델 권한을 확인해 주세요.`, 503);
  }
  return new OpenAIError(`OpenAI 호출 실패 (${status}): ${detail}`, 502);
}

async function readStream(res: Response, onTextDelta: (text: string) => void): Promise<OpenAIResponse> {
  if (!res.body) throw new OpenAIError('AI 응답 스트림이 비어 있어요. 다시 시도해 주세요.', 502);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let completed: OpenAIResponse | null = null;

  const consume = (block: string) => {
    const data = block.split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n');
    if (!data || data === '[DONE]') return;
    let event: { type?: string; delta?: unknown; response?: OpenAIResponse };
    try {
      event = JSON.parse(data);
    } catch {
      throw new OpenAIError('AI 응답을 읽지 못했어요. 다시 시도해 주세요.', 502);
    }
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') onTextDelta(event.delta);
    if ((event.type === 'response.completed' || event.type === 'response.incomplete') && event.response) completed = event.response;
    if (event.type === 'response.failed' || event.type === 'error') {
      throw new OpenAIError('AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.', 502);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      if (pending.length > MAX_STREAM_BUFFER) throw new OpenAIError('AI 응답이 너무 길어요. 질문 범위를 줄여 주세요.', 422);
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
  if (!completed) throw new OpenAIError('AI 연결이 중간에 끊겼어요. 다시 시도해 주세요.', 502);
  return completed;
}

export async function createResponse(
  apiKey: string,
  body: Record<string, unknown>,
  { stream = false, onTextDelta = () => {}, signal, fetcher = fetch, retryDelayMs = 700 }: CreateResponseOptions = {},
): Promise<OpenAIResponse> {
  let lastError: OpenAIError | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetcher(RESPONSES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(stream ? { ...body, stream: true } : body),
      signal,
    });
    if (res.ok) return stream ? readStream(res, onTextDelta) : await res.json() as OpenAIResponse;

    lastError = failureFor(res.status, await errorDetail(res));
    if (!RETRYABLE_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS) break;
    await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt));
  }
  throw lastError ?? new OpenAIError('AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.', 502);
}

export function outputText(response: OpenAIResponse): string {
  return (response.output ?? [])
    .filter(item => item.type === 'message')
    .flatMap(item => (Array.isArray(item.content) ? item.content : []) as ResponseItem[])
    .filter(part => part.type === 'output_text' && typeof part.text === 'string')
    .map(part => part.text as string)
    .join('\n')
    .trim();
}

export function functionCalls(response: OpenAIResponse): FunctionCall[] {
  return (response.output ?? [])
    .filter(item => item.type === 'function_call')
    .map(item => ({
      call_id: String(item.call_id ?? ''),
      name: String(item.name ?? ''),
      arguments: typeof item.arguments === 'string' ? item.arguments : '{}',
    }));
}
