import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({ supabase: {} }));

import { averageScores, buildCorrectionPrintHtml, formatCorrectionForCopy, hashPin as appHashPin, splitSentences } from '../src/lib/corrections';
import {
  SESSION_TTL_SECONDS,
  buildGradePrompt,
  hashPin,
  isValidPin,
  makePinSalt,
  normalizeName,
  parseGradeResult,
  summarize,
  signSession,
  validateAnswers,
  verifySession,
} from '../supabase/functions/correction-public/logic';

describe('splitSentences', () => {
  it('splits English sentences on terminal punctuation', () => {
    expect(splitSentences('Tom went to the park. He met his friend! Did they play?'))
      .toEqual(['Tom went to the park.', 'He met his friend!', 'Did they play?']);
  });

  it('keeps abbreviations, decimals and closing quotes in one sentence', () => {
    expect(splitSentences('Mr. Kim lives in the U.S. now. It costs 3.5 dollars. "Wow," she said. "Really?" Yes.'))
      .toEqual(['Mr. Kim lives in the U.S. now.', 'It costs 3.5 dollars.', '"Wow," she said.', '"Really?"', 'Yes.']);
  });

  it('treats line breaks as boundaries and drops blank lines', () => {
    expect(splitSentences('톰은 공원에 갔다. 그는 친구를 만났다\n\n둘은 축구를 했다.'))
      .toEqual(['톰은 공원에 갔다.', '그는 친구를 만났다', '둘은 축구를 했다.']);
  });
});

describe('scores and copy text', () => {
  it('averages per-sentence percentages and clamps them', () => {
    expect(averageScores([{ completeness: 100, accuracy: 80 }, { completeness: 50, accuracy: 150 }]))
      .toEqual({ completeness: 75, accuracy: 90 });
    expect(averageScores([])).toEqual({ completeness: 0, accuracy: 0 });
    expect(summarize([{ completeness: 100, accuracy: 80 }, { completeness: 50, accuracy: -5 }]))
      .toEqual({ completeness: 75, accuracy: 40 });
  });

  it('formats a copyable correction with each answer followed by its correction', () => {
    const text = formatCorrectionForCopy(
      { title: '3과', mode: 'translate', sentences: ['I am happy.', 'You are kind.'] },
      {
        studentName: '민지',
        items: [
          { answer: '나는 행복하다.', corrected: '나는 행복하다.', explanation: '잘했어요.', completeness: 100, accuracy: 100 },
          { answer: '', corrected: '너는 친절하다.', explanation: '빈칸이에요.', completeness: 0, accuracy: 0 },
        ],
      },
    );
    expect(text).toContain('[해석 첨삭] 3과 - 민지');
    expect(text).toContain('완성도 50% · 정확도 50%');
    expect(text).toContain('2. You are kind.\n- 내 답: (빈칸)\n- 첨삭: 너는 친절하다.\n- 설명: 빈칸이에요.');
  });

  it('builds one escaped print page per submission', () => {
    const html = buildCorrectionPrintHtml(
      { title: '3과 <본문>', mode: 'compose', sentences: ['나는 학생이다.', '그는 친절하다.'] },
      [
        {
          studentName: '민지',
          published: false,
          items: [
            { answer: 'I am a student.', corrected: 'I am a student.', explanation: '잘했어요.', completeness: 100, accuracy: 100 },
            { answer: 'He <b>kind</b>.', corrected: 'He is kind.', explanation: 'be동사가 필요해요.', completeness: 100, accuracy: 85 },
          ],
        },
        { studentName: '지훈', items: [] },
      ],
    );
    expect(html.match(/<section class="sheet">/g)).toHaveLength(2);
    expect(html).toContain('.sheet + .sheet { break-before: page; }');
    expect(html).toContain('영작 첨삭 결과지');
    expect(html).toContain('3과 &lt;본문&gt;');
    expect(html).toContain('He &lt;b&gt;kind&lt;/b&gt;.');
    expect(html).not.toContain('<b>kind</b>');
    expect(html).toContain('<span class="pass">✓ 정답</span>');
    expect(html).toContain('<p class="fix">He is kind.</p>');
    expect(html).toContain('<span class="draft">검토 전</span>');
    expect(html).toContain('<span>정확도</span><b>93</b>');
    expect(html).toContain('그로잉영어 교습소');
    expect(html).toContain('<b>1<small>/2</small></b>');
    expect(html).toContain('(빈칸)');
    expect(html).not.toContain('<script');
  });
});

describe('correction-public logic', () => {
  it('validates student name and answers', () => {
    expect(normalizeName('  김  민지 ')).toBe('김 민지');
    expect(normalizeName('')).toBeNull();
    expect(normalizeName('가'.repeat(21))).toBeNull();
    expect(validateAnswers([' a ', ''], 2)).toEqual(['a', '']);
    expect(validateAnswers(['a'], 2)).toBeNull();
    expect(validateAnswers(['a', 1], 2)).toBeNull();
    expect(validateAnswers(['x'.repeat(1001)], 1)).toBeNull();
  });

  it('hashes PINs the same way in the app (teacher reset) and the edge function', async () => {
    const salt = makePinSalt();
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(await hashPin(salt, '1234')).toBe(await appHashPin(salt, '1234'));
    expect(await hashPin(salt, '1234')).not.toBe(await hashPin(salt, '1235'));
    expect(isValidPin('0123')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });

  it('signs student sessions and rejects tampered or expired tokens', async () => {
    const secret = 's'.repeat(32);
    const claims = { ownerId: '11111111-1111-1111-1111-111111111111', studentId: '22222222-2222-2222-2222-222222222222', name: '민지' };
    const now = Date.now();
    const token = await signSession(secret, claims, now);
    expect(await verifySession(secret, token, now)).toMatchObject(claims);
    expect(await verifySession('t'.repeat(32), token, now)).toBeNull();
    const [payload, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ v: 1, ...claims, studentId: '33333333-3333-3333-3333-333333333333', exp: 9_999_999_999 })).toString('base64url');
    expect(await verifySession(secret, `${forged}.${signature}`, now)).toBeNull();
    expect(await verifySession(secret, `${payload}.${signature}`, now + (SESSION_TTL_SECONDS + 1) * 1000)).toBeNull();
    expect(await verifySession(secret, 'garbage', now)).toBeNull();
  });

  it('builds a prompt with every sentence and blank markers', () => {
    const prompt = buildGradePrompt('compose', ['나는 학생이다.', '그는 선생님이다.'], ['I am student.', '']);
    expect(prompt).toContain('Return exactly 2 items');
    expect(prompt).toContain('student: I am student.');
    expect(prompt).toContain('student: (blank)');
  });

  it('parses AI output and forces blank answers to 0%', () => {
    const items = parseGradeResult(
      '```json\n{"items":[{"corrected":"I am a student.","explanation":"관사 a가 필요해요.","completeness":100,"accuracy":70},{"corrected":"He is a teacher.","explanation":"빈칸","completeness":90,"accuracy":90}]}\n```',
      ['I am student.', ''],
    );
    expect(items[0]).toEqual({ answer: 'I am student.', corrected: 'I am a student.', explanation: '관사 a가 필요해요.', completeness: 100, accuracy: 70 });
    expect(items[1].completeness).toBe(0);
    expect(items[1].accuracy).toBe(0);
  });

  it('rejects AI output with the wrong number of items', () => {
    expect(() => parseGradeResult('{"items":[]}', ['a'])).toThrow();
  });
});

describe('correction migration', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20261022094643_growing_correction_sets.sql', import.meta.url),
    'utf8',
  ).toLowerCase();

  it('enables owner-scoped RLS and leaves student/submission inserts to the edge function', () => {
    expect(sql).toContain('alter table growing_correction_sets enable row level security');
    expect(sql).toContain('alter table growing_correction_students enable row level security');
    expect(sql).toContain('alter table growing_correction_submissions enable row level security');
    expect(sql).not.toMatch(/on growing_correction_submissions for insert/);
    expect(sql).not.toMatch(/on growing_correction_students for insert/);
    expect(sql).toContain('unique (set_id, student_id)');
    expect(sql).not.toMatch(/pin text|pin_plain/);
    expect(sql).not.toContain("auth.role() = 'anon'");
  });
});
