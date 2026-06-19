export interface ClasscardQuestion {
  prompt: string;
  passage?: string;
  choices: string[] | null;
  answer: number | string;
  explanation?: string;
}

const choiceMarks = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

const oneLine = (value: unknown) => String(value ?? '').replace(/[\t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

const answerText = (question: ClasscardQuestion) => {
  if (!question.choices) return oneLine(question.answer);
  const index = typeof question.answer === 'number' ? question.answer : Number(question.answer);
  if (!Number.isInteger(index) || index < 0 || index >= question.choices.length) return oneLine(question.answer);
  return `${choiceMarks[index] ?? `${index + 1}.`} ${oneLine(question.choices[index])}`;
};

export const buildClasscardPasteText = (questions: ClasscardQuestion[]) => questions.map((question, index) => {
  const frontParts = [
    question.passage ? `[지문] ${oneLine(question.passage)}` : '',
    `${index + 1}. ${oneLine(question.prompt)}`,
    question.choices?.map((choice, choiceIndex) => `${choiceMarks[choiceIndex] ?? `${choiceIndex + 1}.`} ${oneLine(choice)}`).join('  '),
  ].filter(Boolean);
  const backParts = [
    `정답: ${answerText(question)}`,
    question.explanation ? `해설: ${oneLine(question.explanation)}` : '',
  ].filter(Boolean);
  return `${frontParts.join(' | ')}\t${backParts.join(' | ')}`;
}).join('\n');
