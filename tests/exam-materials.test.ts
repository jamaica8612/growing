import { describe, expect, it } from 'vitest';
import { combineExamMaterialTexts } from '../src/lib/examMaterials';

describe('combineExamMaterialTexts', () => {
  it('추가한 자료와 아직 입력 중인 자료를 모두 생성용 텍스트로 합친다', () => {
    expect(combineExamMaterialTexts(['First passage', 'Second passage'], 'Current passage')).toBe(
      '[자료 1]\nFirst passage\n\n[자료 2]\nSecond passage\n\n[자료 3]\nCurrent passage',
    );
  });

  it('삭제되거나 비어 있는 자료는 제외한다', () => {
    expect(combineExamMaterialTexts([undefined, '  Kept passage  ', ''], '')).toBe('[자료 1]\nKept passage');
  });
});
