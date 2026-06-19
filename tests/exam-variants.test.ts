import { describe, expect, it } from 'vitest';
import { createBTypeQuestions } from '../src/lib/examVariants';

describe('createBTypeQuestions', () => {
  it('문항과 보기를 섞으면서 객관식 정답을 보정한다', () => {
    const questions = [
      { id: 'q1', choices: ['A', 'B', 'C'], answer: 1 },
      { id: 'q2', choices: ['D', 'E', 'F'], answer: 0 },
    ];
    const values = [0, 0, 0, 0, 0];
    const mixed = createBTypeQuestions(questions, () => values.shift() ?? 0);

    expect(mixed.map(question => question.id)).toEqual(['q2', 'q1']);
    mixed.forEach(question => {
      const original = questions.find(item => item.id === question.id)!;
      expect(question.choices?.[Number(question.answer)]).toBe(original.choices[Number(original.answer)]);
    });
  });

  it('서술형 정답은 그대로 유지한다', () => {
    const [mixed] = createBTypeQuestions([{ id: 'q1', choices: null, answer: 'written answer' }], () => 0);
    expect(mixed.answer).toBe('written answer');
  });
});
