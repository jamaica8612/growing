// Parent notice message templates.
//
// Owners can edit these in the settings screen. Stored values live in
// growing_settings.message_templates; missing values fall back to these
// concise defaults.

export interface MessageTemplates {
  checkIn: string;
  checkOut: string;
  homeworkDone: string;
  homeworkIncomplete: string;
  homeworkUndone: string;
  makeup: string;
  test: string;
}

export type MessageTemplateKey = keyof MessageTemplates;

export const DEFAULT_TEMPLATES: MessageTemplates = {
  checkIn: '안녕하세요, 그로잉영어입니다.\n{학생명} 학생 {시간} 등원했습니다.',
  checkOut: '안녕하세요, 그로잉영어입니다.\n{학생명} 학생 {시간} 하원했습니다.',
  homeworkDone: '안녕하세요, 그로잉영어입니다.\n{학생명} 학생 숙제 확인 완료했습니다.',
  homeworkIncomplete: '안녕하세요, 그로잉영어입니다.\n{학생명} 학생 숙제가 일부 미흡합니다. 가정에서 한 번 더 확인 부탁드립니다.',
  homeworkUndone: '안녕하세요, 그로잉영어입니다.\n{학생명} 학생 숙제가 제출되지 않았습니다. 다음 수업 전까지 확인 부탁드립니다.',
  makeup: '안녕하세요, 그로잉영어입니다.\n{학생명} 학생 보강 수업은 {날짜} {시간}입니다.',
  test: '안녕하세요, 그로잉영어입니다.\n{학생명} 학생 {평가명} 결과는 {점수}입니다.',
};

export const TEMPLATE_META: { key: MessageTemplateKey; label: string; tokens: string[] }[] = [
  { key: 'checkIn', label: '등원 완료', tokens: ['{학생명}', '{시간}'] },
  { key: 'checkOut', label: '하원 완료', tokens: ['{학생명}', '{시간}'] },
  { key: 'homeworkDone', label: '숙제 완료', tokens: ['{학생명}'] },
  { key: 'homeworkIncomplete', label: '숙제 미흡', tokens: ['{학생명}'] },
  { key: 'homeworkUndone', label: '숙제 미제출', tokens: ['{학생명}'] },
  { key: 'makeup', label: '보강 안내', tokens: ['{학생명}', '{날짜}', '{시간}'] },
  { key: 'test', label: '평가 결과', tokens: ['{학생명}', '{평가명}', '{점수}'] },
];

export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{([^}]+)\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

export function mergeTemplates(stored: Partial<MessageTemplates> | null | undefined): MessageTemplates {
  return { ...DEFAULT_TEMPLATES, ...(stored ?? {}) };
}
