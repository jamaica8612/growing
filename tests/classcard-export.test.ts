import { describe, expect, it } from 'vitest';
import { buildClasscardPasteText } from '../src/lib/classcardExport';

describe('buildClasscardPasteText', () => {
  it('객관식 문제를 앞면과 정답 뒷면의 탭 형식으로 만든다', () => {
    const text = buildClasscardPasteText([{
      passage: 'Tom is happy.',
      prompt: 'Tom의 기분은?',
      choices: ['sad', 'happy', 'angry'],
      answer: 1,
      explanation: 'happy는 행복한이라는 뜻입니다.',
    }]);

    expect(text).toBe('[지문] Tom is happy. | 1. Tom의 기분은? | ① sad  ② happy  ③ angry\t정답: ② happy | 해설: happy는 행복한이라는 뜻입니다.');
  });

  it('문항 내부 줄바꿈과 탭이 카드 행을 깨지 않게 정리한다', () => {
    const text = buildClasscardPasteText([
      { prompt: '첫째 줄\n둘째 줄', choices: null, answer: '정답\t하나' },
      { prompt: '두 번째 문제', choices: null, answer: 'answer' },
    ]);

    expect(text.split('\n')).toHaveLength(2);
    expect(text).toContain('1. 첫째 줄 둘째 줄\t정답: 정답 하나');
  });
});
