import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({ supabase: {} }));

import { averageScores, formatCorrectionForCopy, splitSentences } from '../src/lib/corrections';
import {
  buildGradePrompt,
  isValidResultToken,
  makeResultToken,
  normalizeName,
  parseGradeResult,
  summarize,
  validateAnswers,
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

  it('makes unguessable result tokens', () => {
    const token = makeResultToken();
    expect(isValidResultToken(token)).toBe(true);
    expect(token).not.toBe(makeResultToken());
    expect(isValidResultToken('short')).toBe(false);
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
    new URL('../supabase/migrations/20261022090000_growing_correction_sets.sql', import.meta.url),
    'utf8',
  ).toLowerCase();

  it('enables owner-scoped RLS and has no public insert policy for submissions', () => {
    expect(sql).toContain('alter table growing_correction_sets enable row level security');
    expect(sql).toContain('alter table growing_correction_submissions enable row level security');
    expect(sql).not.toMatch(/on growing_correction_submissions for insert/);
    expect(sql).not.toContain("auth.role() = 'anon'");
  });
});
