export const combineExamMaterialTexts = (savedTexts: Array<string | undefined>, currentText: string) =>
  [...savedTexts, currentText]
    .map(text => text?.trim() ?? '')
    .filter(Boolean)
    .map((text, index) => `[자료 ${index + 1}]\n${text}`)
    .join('\n\n');
