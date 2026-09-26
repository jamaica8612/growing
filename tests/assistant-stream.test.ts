import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'jwt-test' } } })) },
  },
}));

import { parseSseBlock, streamAssistantMessage } from '../src/lib/assistant';

const action = {
  type: 'update_payment',
  payment_id: 'p1',
  student_name: '홍길동',
  billing_month: '2026-09',
  amount: 150000,
};

function sseResponse(events: [string, unknown][]): Response {
  const encoder = new TextEncoder();
  const text = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
  // 청크 경계가 이벤트 중간에 걸려도 조립되는지 확인하려고 잘게 나눠 보낸다.
  const chunks = text.match(/[\s\S]{1,13}/g) ?? [];
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
}

describe('parseSseBlock', () => {
  it('reads the event name and JSON data', () => {
    expect(parseSseBlock('event: progress\ndata: {"message":"확인 중"}')).toEqual({
      event: 'progress',
      data: { message: '확인 중' },
    });
  });

  it('ignores blocks without JSON data', () => {
    expect(parseSseBlock(': keep-alive')).toBeNull();
    expect(parseSseBlock('event: x\ndata: not-json')).toBeNull();
  });
});

describe('streamAssistantMessage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('relays progress, deltas and resets, then returns the final reply with every proposal', async () => {
    const fetchMock = vi.fn(async () => sseResponse([
      ['progress', { message: '질문을 살펴보고 있어요.' }],
      ['delta', { text: '확인해 볼게요' }],
      ['reset', {}],
      ['progress', { message: '수납 기록을 확인하고 있어요.' }],
      ['delta', { text: '미납은 ' }],
      ['delta', { text: '1건이에요.' }],
      ['done', {
        reply: '미납은 1건이에요.',
        model: 'gpt-6-luna',
        steps: ['질문을 살펴보고 있어요.', '수납 기록을 확인하고 있어요.'],
        actions: [action, { ...action, payment_id: 'p2' }],
        action,
      }],
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const events: string[] = [];
    let live = '';
    const result = await streamAssistantMessage([{ role: 'user', content: '미납 알려줘' }], {
      onProgress: message => events.push(`progress:${message}`),
      onDelta: text => { live += text; },
      onReset: () => { events.push(`reset:${live}`); live = ''; },
    });

    expect(events).toEqual([
      'progress:질문을 살펴보고 있어요.',
      'reset:확인해 볼게요',
      'progress:수납 기록을 확인하고 있어요.',
    ]);
    expect(live).toBe('미납은 1건이에요.');
    expect(result).toEqual({
      reply: '미납은 1건이에요.',
      model: 'gpt-6-luna',
      steps: ['질문을 살펴보고 있어요.', '수납 기록을 확인하고 있어요.'],
      actions: [action, { ...action, payment_id: 'p2' }],
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ messages: [{ role: 'user', content: '미납 알려줘' }], stream: true });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-test');
  });

  it('accepts a plain JSON reply from a function that does not stream yet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ reply: '안녕하세요', model: 'm', action }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(streamAssistantMessage([{ role: 'user', content: '안녕' }])).resolves.toEqual({
      reply: '안녕하세요', model: 'm', steps: [], actions: [action],
    });
  });

  it('shows the API key guidance before the busy message for a missing key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      ['progress', { message: '질문을 살펴보고 있어요.' }],
      ['error', { error: 'GROWING_OPENAI_API_KEY 시크릿이 설정되지 않았습니다.', status: 503 }],
    ])));

    await expect(streamAssistantMessage([{ role: 'user', content: '안녕' }]))
      .rejects.toThrow('AI 비서 설정(API 키)이 아직 준비되지 않았어요');
  });

  it('fails clearly when the stream ends without a final answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      ['progress', { message: '질문을 살펴보고 있어요.' }],
    ])));

    await expect(streamAssistantMessage([{ role: 'user', content: '안녕' }]))
      .rejects.toThrow('중간에 끊겼어요');
  });
});
