import { describe, expect, it } from 'vitest';
import { buildExamDocumentText } from '../src/lib/examDocumentExport';

const exam = {
  title: 'Unit 3 Test', target: '초등 5반', topic: '현재진행형', date: '2026-06-19',
  questions: [
    { type: 'grammar', points: 10, prompt: 'Choose one.', choices: ['is running', 'run'], answer: 0, explanation: '현재진행형입니다.' },
    { type: 'writing', points: 10, prompt: 'Write a sentence.', choices: null, answer: 'I am running.', explanation: 'be동사와 -ing를 씁니다.' },
  ],
};

describe('buildExamDocumentText', () => {
  it('학생용 문서에는 정답을 숨기고 서술형 답란을 만든다', () => {
    const text = buildExamDocumentText(exam, 'student');
    expect(text).toContain('이름: ____________________');
    expect(text).toContain('답: ________________________________________________');
    expect(text).not.toContain('정답: ① is running');
  });

  it('선생님용 문서에는 정답과 해설을 넣는다', () => {
    const text = buildExamDocumentText(exam, 'teacher');
    expect(text).toContain('[정답 및 해설]');
    expect(text).toContain('정답: ① is running');
    expect(text).toContain('정답: I am running.');
    expect(text).toContain('해설: be동사와 -ing를 씁니다.');
  });
});
