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
  checkIn: '{학생명} {시간} 등원완료',
  checkOut: '{학생명} {시간} 하원완료',
  homeworkDone: '{학생명} 숙제완료',
  homeworkIncomplete: '{학생명} 숙제미흡',
  homeworkUndone: '{학생명} 숙제미제출',
  makeup: '{학생명} {날짜} {시간} 보강\n\n보강 시간 확인 후, 가능 여부 답장주세요 😊',
  test: '{학생명} {평가명} {점수}',
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
