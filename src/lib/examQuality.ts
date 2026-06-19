export interface QualityQuestion {
  prompt: string;
  points: number;
  choices: string[] | null;
  answer: number | string;
  explanation?: string;
}

export interface ExamQualityIssue {
  questionIndex: number;
  severity: 'error' | 'warning';
  message: string;
}

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalized = (value: unknown) => clean(value).toLocaleLowerCase('ko-KR');

export const inspectExamQuestions = (questions: QualityQuestion[]): ExamQualityIssue[] => {
  const issues: ExamQualityIssue[] = [];
  const promptIndexes = new Map<string, number[]>();

  questions.forEach((question, questionIndex) => {
    const prompt = clean(question.prompt);
    if (!prompt) issues.push({ questionIndex, severity: 'error', message: '문제 내용이 비어 있습니다.' });
    if (!Number.isFinite(question.points) || question.points <= 0) {
      issues.push({ questionIndex, severity: 'error', message: '배점을 1점 이상으로 설정해 주세요.' });
    }

    if (question.choices) {
      if (question.choices.length < 2) {
        issues.push({ questionIndex, severity: 'error', message: '객관식 보기가 2개보다 적습니다.' });
      }
      if (question.choices.some(choice => !clean(choice))) {
        issues.push({ questionIndex, severity: 'error', message: '내용이 비어 있는 보기가 있습니다.' });
      }
      const uniqueChoices = new Set(question.choices.map(normalized).filter(Boolean));
      if (uniqueChoices.size < question.choices.filter(choice => clean(choice)).length) {
        issues.push({ questionIndex, severity: 'warning', message: '같은 보기가 중복되어 있습니다.' });
      }
      const answerIndex = typeof question.answer === 'number' ? question.answer : Number(question.answer);
      if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= question.choices.length) {
        issues.push({ questionIndex, severity: 'error', message: '정답 번호가 보기 범위를 벗어났습니다.' });
      }
    } else if (!clean(question.answer)) {
      issues.push({ questionIndex, severity: 'error', message: '서술형 정답이 비어 있습니다.' });
    }

    if (!clean(question.explanation)) {
      issues.push({ questionIndex, severity: 'warning', message: '해설이 없습니다.' });
    }

    if (prompt) {
      const key = normalized(prompt);
      promptIndexes.set(key, [...(promptIndexes.get(key) ?? []), questionIndex]);
    }
  });

  promptIndexes.forEach(indexes => {
    if (indexes.length < 2) return;
    indexes.forEach(questionIndex => issues.push({ questionIndex, severity: 'warning', message: '다른 문항과 문제 내용이 중복됩니다.' }));
  });

  return issues.sort((a, b) => a.questionIndex - b.questionIndex || (a.severity === 'error' ? -1 : 1));
};
