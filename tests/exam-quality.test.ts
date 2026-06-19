import { describe, expect, it } from 'vitest';
import { inspectExamQuestions } from '../src/lib/examQuality';

describe('inspectExamQuestions', () => {
  it('정상 문항은 문제를 보고하지 않는다', () => {
    expect(inspectExamQuestions([{
      prompt: 'Choose the correct answer.',
      points: 10,
      choices: ['is', 'are'],
      answer: 0,
      explanation: 'The subject is singular.',
    }])).toEqual([]);
  });

  it('잘못된 정답 번호와 중복 보기를 찾는다', () => {
    const issues = inspectExamQuestions([{
      prompt: 'Choose one.',
      points: 5,
      choices: ['apple', ' apple ', 'banana'],
      answer: 4,
      explanation: '',
    }]);

    expect(issues.map(issue => issue.message)).toEqual(expect.arrayContaining([
      '같은 보기가 중복되어 있습니다.',
      '정답 번호가 보기 범위를 벗어났습니다.',
      '해설이 없습니다.',
    ]));
  });

  it('중복 문항은 해당 문항 모두에 경고한다', () => {
    const questions = [0, 1].map(() => ({
      prompt: 'What is this?', points: 5, choices: null, answer: 'book', explanation: 'It is a book.',
    }));
    const duplicateIssues = inspectExamQuestions(questions).filter(issue => issue.message.includes('중복'));

    expect(duplicateIssues.map(issue => issue.questionIndex)).toEqual([0, 1]);
  });
});
