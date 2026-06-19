export interface DocumentQuestion {
  type: string;
  points: number;
  prompt: string;
  passage?: string;
  choices: string[] | null;
  answer: number | string;
  explanation?: string;
}

export interface ExamDocument {
  title: string;
  target: string;
  topic: string;
  date: string;
  questions: DocumentQuestion[];
}

const marks = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

const answerText = (question: DocumentQuestion) => {
  if (!question.choices) return String(question.answer ?? '').trim();
  const index = typeof question.answer === 'number' ? question.answer : Number(question.answer);
  if (!Number.isInteger(index) || index < 0 || index >= question.choices.length) return String(question.answer ?? '').trim();
  return `${marks[index] ?? `${index + 1}.`} ${question.choices[index]}`;
};

export const buildExamDocumentText = (exam: ExamDocument, mode: 'student' | 'teacher') => {
  const totalPoints = exam.questions.reduce((sum, question) => sum + question.points, 0);
  const header = [
    exam.title,
    `대상: ${exam.target}    범위: ${exam.topic}`,
    `출제일: ${exam.date}    총점: ${totalPoints}점`,
    mode === 'student' ? '이름: ____________________' : '[정답 및 해설]',
  ];
  const body = exam.questions.map((question, index) => {
    const lines = [
      `${index + 1}. ${question.prompt} (${question.points}점)`,
      question.passage ? `[지문] ${question.passage}` : '',
      ...(question.choices?.map((choice, choiceIndex) => `${marks[choiceIndex] ?? `${choiceIndex + 1}.`} ${choice}`) ?? []),
    ];
    if (!question.choices && mode === 'student') lines.push('답: ________________________________________________');
    if (mode === 'teacher') {
      lines.push(`정답: ${answerText(question)}`);
      if (question.explanation?.trim()) lines.push(`해설: ${question.explanation.trim()}`);
    }
    return lines.filter(Boolean).join('\n');
  });
  return [...header, '', ...body.flatMap((question, index) => index === body.length - 1 ? [question] : [question, ''])].join('\n');
};
