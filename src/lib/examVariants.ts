export interface VariantQuestion {
  choices: string[] | null;
  answer: number | string;
}

const shuffled = <T,>(items: T[], random: () => number): T[] => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
};

export const createBTypeQuestions = <T extends VariantQuestion>(questions: T[], random: () => number = Math.random): T[] =>
  shuffled(questions, random).map(question => {
    if (!question.choices || question.choices.length < 2) return { ...question };
    const answerIndex = typeof question.answer === 'number' ? question.answer : Number(question.answer);
    const indexedChoices = question.choices.map((choice, originalIndex) => ({ choice, originalIndex }));
    const mixedChoices = shuffled(indexedChoices, random);
    const nextAnswer = Number.isInteger(answerIndex)
      ? mixedChoices.findIndex(item => item.originalIndex === answerIndex)
      : -1;
    return {
      ...question,
      choices: mixedChoices.map(item => item.choice),
      answer: nextAnswer >= 0 ? nextAnswer : question.answer,
    };
  });
