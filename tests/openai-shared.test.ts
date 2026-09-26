import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_OPENAI_MODEL,
  OVERLOADED_MESSAGE,
  OpenAIError,
  createResponse,
  functionCalls,
  openAIConfig,
  outputText,
} from '../supabase/functions/_shared/openai.ts';

const completed = {
  status: 'completed',
  output: [
    { type: 'reasoning', id: 'rs_1', encrypted_content: 'x' },
    { type: 'function_call', call_id: 'call_1', name: 'list_students', arguments: '{"status":"active"}' },
    { type: 'message', content: [{ type: 'output_text', text: '안녕하세요' }, { type: 'output_text', text: '지선쌤' }] },
  ],
};

function sseBody(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const text = events.map(event => `event: x\ndata: ${JSON.stringify(event)}\n\n`).join('');
  // 청크 경계가 이벤트 중간에 걸려도 조립되는지 확인하려고 잘게 나눠 보낸다.
  const chunks = text.match(/[\s\S]{1,17}/g) ?? [];
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('openAIConfig', () => {
  it('reads the growing-only key and defaults to gpt-6-luna', () => {
    const env: Record<string, string> = { GROWING_OPENAI_API_KEY: ' sk-growing ', OPENAI_API_KEY: 'sk-other' };
    expect(openAIConfig(name => env[name])).toEqual({ apiKey: 'sk-growing', model: DEFAULT_OPENAI_MODEL });
  });

  it('does not fall back to the shared OPENAI_API_KEY', () => {
    const env: Record<string, string> = { OPENAI_API_KEY: 'sk-other', GROWING_OPENAI_MODEL: 'gpt-6-luna-mini' };
    expect(openAIConfig(name => env[name])).toEqual({ apiKey: null, model: 'gpt-6-luna-mini' });
  });
});

describe('createResponse', () => {
  it('posts to the Responses API with a bearer key', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(completed), { status: 200 }));
    const result = await createResponse('sk-test', { model: 'gpt-6-luna', input: 'hi' }, { fetcher });

    expect(result).toEqual(completed);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(String(init.body))).toEqual({ model: 'gpt-6-luna', input: 'hi' });
  });

  it('retries once on overload and then succeeds', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":{"message":"busy"}}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completed), { status: 200 }));
    const result = await createResponse('sk-test', {}, { fetcher, retryDelayMs: 0 });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('completed');
  });

  it('reports overload after the retry is spent', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 429 }));
    const error = await createResponse('sk-test', {}, { fetcher, retryDelayMs: 0 }).catch(e => e);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(error).toBeInstanceOf(OpenAIError);
    expect(error).toMatchObject({ status: 429, message: OVERLOADED_MESSAGE });
  });

  it('does not retry a rejected key and names the growing secret', async () => {
    const fetcher = vi.fn(async () => new Response('{"error":{"message":"bad key"}}', { status: 401 }));
    const error = await createResponse('sk-test', {}, { fetcher, retryDelayMs: 0 }).catch(e => e);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(error.message).toContain('GROWING_OPENAI_API_KEY');
  });

  it('streams text deltas and returns the completed response', async () => {
    const fetcher = vi.fn(async () => new Response(sseBody([
      { type: 'response.created' },
      { type: 'response.output_text.delta', delta: '안녕' },
      { type: 'response.output_text.delta', delta: '하세요' },
      { type: 'response.completed', response: completed },
    ]), { status: 200 }));
    const deltas: string[] = [];
    const result = await createResponse('sk-test', { model: 'm' }, { fetcher, stream: true, onTextDelta: d => deltas.push(d) });

    expect(deltas).toEqual(['안녕', '하세요']);
    expect(result).toEqual(completed);
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).stream).toBe(true);
  });

  it('fails a stream that ends without a completed response', async () => {
    const fetcher = vi.fn(async () => new Response(sseBody([
      { type: 'response.output_text.delta', delta: '안녕' },
    ]), { status: 200 }));
    await expect(createResponse('sk-test', {}, { fetcher, stream: true })).rejects.toBeInstanceOf(OpenAIError);
  });
});

describe('response helpers', () => {
  it('joins message text and extracts function calls', () => {
    expect(outputText(completed)).toBe('안녕하세요\n지선쌤');
    expect(functionCalls(completed)).toEqual([
      { call_id: 'call_1', name: 'list_students', arguments: '{"status":"active"}' },
    ]);
  });
});
