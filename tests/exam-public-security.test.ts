import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
  },
}));

import { examsApi, makeShortCode } from '../src/lib/exams';
import {
  MAX_ANSWER_COUNT,
  MAX_REQUEST_BYTES,
  makeStudentKey,
  maskStudentName,
  normalizeVerificationSecret,
  phoneMatchesLast4,
  readJsonBody,
  signVerificationToken,
  validatedAnswers,
  verifyVerificationToken,
} from '../supabase/functions/exam-public/security';

const edgeSource = readFileSync(
  new URL('../supabase/functions/exam-public/index.ts', import.meta.url),
  'utf8',
);
const securitySource = readFileSync(
  new URL('../supabase/functions/exam-public/security.ts', import.meta.url),
  'utf8',
);
const examsSource = readFileSync(new URL('../src/lib/exams.ts', import.meta.url), 'utf8');

const QUESTION_ID = '11111111-1111-4111-8111-111111111111';
const EXAM_ID = '22222222-2222-4222-8222-222222222222';
const STUDENT_ID = '33333333-3333-4333-8333-333333333333';
const SECRET = 'exam-verification-secret-for-tests-1234567890';

describe('exam-public client contract', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
  });

  it('본인 확인 요청에는 공개 학생 키와 연락처 뒤 4자리만 보낸다', async () => {
    mocks.invoke.mockResolvedValue({
      data: { verificationToken: 'signed-token', expiresIn: 3600 },
      error: null,
    });

    await expect(examsApi.publicVerifyStudent('ABC123', 'opaque-student-key', '5678')).resolves.toEqual({
      verificationToken: 'signed-token',
      expiresIn: 3600,
    });
    expect(mocks.invoke).toHaveBeenCalledWith('exam-public', {
      body: {
        action: 'verify_student',
        code: 'ABC123',
        studentKey: 'opaque-student-key',
        contactLast4: '5678',
      },
    });
    expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty('studentId');
  });

  it('제출 요청에는 학생 UUID 대신 서버가 발급한 검증 토큰을 보낸다', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true, score: 90, total: 100 }, error: null });

    await examsApi.publicSubmit('ABC123', 'signed-token', { q1: 2 });

    expect(mocks.invoke).toHaveBeenCalledWith('exam-public', {
      body: {
        action: 'submit',
        code: 'ABC123',
        verificationToken: 'signed-token',
        answers: { q1: 2 },
      },
    });
    expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty('studentId');
  });

  it('엣지 함수의 비식별 오류 메시지를 사용자에게 전달한다', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: '입력한 정보로 본인 확인을 완료할 수 없습니다.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      },
    });

    await expect(examsApi.publicVerifyStudent('ABC123', 'opaque-student-key', '0000'))
      .rejects.toThrow('입력한 정보로 본인 확인을 완료할 수 없습니다.');
  });
});

describe('exam-public executable security helpers', () => {
  it('응시코드는 Web Crypto 난수로 기존 6자리 형식을 유지한다', () => {
    for (let index = 0; index < 20; index += 1) {
      expect(makeShortCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    }
    const generatorSource = examsSource.slice(
      examsSource.indexOf('export function makeShortCode'),
      examsSource.indexOf('export interface ExamSubmission'),
    );
    expect(generatorSource).toContain('crypto.getRandomValues');
    expect(generatorSource).not.toContain('Math.random');
  });

  it('학생 키와 검증 토큰은 위조, 다른 시험 코드, 만료를 거부한다', async () => {
    const studentKey = await makeStudentKey(SECRET, EXAM_ID, STUDENT_ID);
    const token = await signVerificationToken(SECRET, 'ABC123', studentKey, 1_000);
    const forgedToken = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

    await expect(verifyVerificationToken(SECRET, token, 'ABC123', 1_001)).resolves.toMatchObject({
      code: 'ABC123',
      studentKey,
      issuedAt: 1_000,
      expiresAt: 4_600,
    });
    await expect(verifyVerificationToken(SECRET, token, 'XYZ789', 1_001)).resolves.toBeNull();
    await expect(verifyVerificationToken(`${SECRET}x`, token, 'ABC123', 1_001)).resolves.toBeNull();
    await expect(verifyVerificationToken(SECRET, forgedToken, 'ABC123', 1_001)).resolves.toBeNull();
    await expect(verifyVerificationToken(SECRET, token, 'ABC123', 4_600)).resolves.toBeNull();
  });

  it('짧은 secret은 거부하고 충분한 secret만 정규화한다', () => {
    expect(normalizeVerificationSecret('short-secret')).toBeNull();
    expect(normalizeVerificationSecret(`  ${SECRET}  `)).toBe(SECRET);
  });

  it('학생/보호자 연락처 뒤 4자리만 비교한다', () => {
    expect(phoneMatchesLast4('010-1234-5678', '5678')).toBe(true);
    expect(phoneMatchesLast4('02-123-5678', '5678')).toBe(true);
    expect(phoneMatchesLast4('010-1234-5678', '0000')).toBe(false);
    expect(phoneMatchesLast4('010-1234-5678', '678')).toBe(false);
    expect(phoneMatchesLast4('', '5678')).toBe(false);
  });

  it('공개 명단 이름을 길이에 맞게 마스킹한다', () => {
    expect(maskStudentName('김연아')).toBe('김*아');
    expect(maskStudentName('김아')).toBe('김*');
    expect(maskStudentName('김')).toBe('*');
    expect(maskStudentName('')).toBe('학생');
  });

  it('답안은 plain object, UUID 문항키, 문항 수와 문자열 길이를 제한한다', () => {
    expect(validatedAnswers({ [QUESTION_ID]: 'answer' })).toEqual({ [QUESTION_ID]: 'answer' });
    expect(validatedAnswers([])).toBeNull();
    expect(validatedAnswers({ q1: 'answer' })).toBeNull();
    expect(validatedAnswers({ [QUESTION_ID]: 'x'.repeat(4_001) })).toBeNull();
    expect(validatedAnswers(Object.fromEntries(
      Array.from({ length: MAX_ANSWER_COUNT + 1 }, (_, index) => [
        `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
        0,
      ]),
    ))).toBeNull();
  });

  it('선언 길이와 실제 스트림 모두 128KB를 넘으면 JSON 파싱 전에 거부한다', async () => {
    const declaredTooLarge = new Request('https://example.test', {
      method: 'POST',
      headers: { 'content-length': String(MAX_REQUEST_BYTES + 1) },
      body: '{}',
    });
    await expect(readJsonBody(declaredTooLarge)).resolves.toMatchObject({ ok: false, status: 413 });

    const streamedTooLarge = new Request('https://example.test', {
      method: 'POST',
      body: `"${'x'.repeat(MAX_REQUEST_BYTES)}"`,
    });
    await expect(readJsonBody(streamedTooLarge)).resolves.toMatchObject({ ok: false, status: 413 });
  });
});

describe('exam-public edge security contract', () => {
  const getExamSection = edgeSource.slice(
    edgeSource.indexOf("if (payload.action === 'get_exam')"),
    edgeSource.indexOf("if (payload.action === 'verify_student')"),
  );
  const submitSection = edgeSource.slice(
    edgeSource.indexOf("if (payload.action === 'submit')"),
    edgeSource.indexOf("if (payload.action === 'get_result')"),
  );
  const getResultSection = edgeSource.slice(
    edgeSource.indexOf("if (payload.action === 'get_result')"),
    edgeSource.indexOf("return jsonResponse({ error: 'Unknown action'"),
  );

  it('코드 조회 응답은 학생 원문 이름, UUID와 전체 제출 상태를 포함하지 않는다', () => {
    expect(getExamSection).toContain('studentKey: await makeStudentKey');
    expect(getExamSection).toContain('name: maskStudentName(row.name)');
    expect(getExamSection).not.toContain('name: row.name');
    expect(getExamSection).not.toContain(".from('growing_exam_submissions')");
    expect(getExamSection).not.toContain('submitted:');
    expect(getExamSection).not.toMatch(/return\s*\{\s*id:\s*row\.id/);
  });

  it('학생 및 보호자 연락처를 서버에서만 비교하고 원문은 반환하지 않는다', () => {
    expect(edgeSource).toContain(".select('id, name, status, contact, parent_contact')");
    expect(edgeSource).toContain('phoneMatchesLast4(student.contact, contactLast4)');
    expect(edgeSource).toContain('phoneMatchesLast4(student.parent_contact, contactLast4)');
    expect(edgeSource).not.toMatch(/jsonResponse\(\{[^}]*parent_contact/s);
  });

  it('결과 링크 응답은 내부 UUID를 q1 형식으로 치환하고 화면 필드만 반환한다', () => {
    expect(getResultSection).not.toContain(".select('*')");
    expect(getResultSection).toContain('const questionKey = `q${index + 1}`');
    expect(getResultSection).toContain('question_id: questionKey');
    expect(getResultSection).toContain('questions: publicQuestions');
    expect(getResultSection).toContain('answers: publicAnswers');
    const responseSection = getResultSection.slice(getResultSection.lastIndexOf('return jsonResponse({'));
    expect(responseSection).not.toContain('owner_id');
    expect(responseSection).not.toContain('student_id');
    expect(responseSection).not.toContain('exam_id');
    expect(responseSection).not.toContain('submission_id');
  });

  it('secret이 없으면 닫히고 짧은 TTL 서명 토큰 없이는 제출하지 않는다', () => {
    expect(edgeSource).toContain("Deno.env.get('EXAM_VERIFICATION_SECRET')");
    expect(securitySource).toContain('secret.length >= 32');
    expect(securitySource).toContain('export const VERIFICATION_TTL_SECONDS = 60 * 60');
    expect(edgeSource).toContain('const VERIFY_ATTEMPT_LIMIT = 5');
    expect(edgeSource).toContain('verificationToken: await signVerificationToken');
    expect(submitSection).toContain('const claims = await verifyVerificationToken');
    expect(submitSection).not.toContain('payload.studentId');
  });

  it('중복 제출 슬롯을 채점 전에 원자 선점하고 실패하면 정리한다', () => {
    const reservationIndex = submitSection.indexOf(".from('growing_exam_submissions')");
    const gradingIndex = submitSection.indexOf('graded = await Promise.all');
    expect(reservationIndex).toBeGreaterThan(-1);
    expect(gradingIndex).toBeGreaterThan(reservationIndex);
    expect(submitSection).toContain("status: 'submitted'");
    expect(submitSection).toContain(".select('id')");
    expect(submitSection).toContain('await cleanupSubmission()');
  });
});
