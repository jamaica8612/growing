// 학부모 알림 메시지 템플릿.
//
// 등원/하원/숙제/보강/평가 알림 문구를 한곳에 모아 원장님이 설정 화면에서
// 직접 편집할 수 있게 한다. 저장 위치는 growing_settings.message_templates
// (jsonb)이며, 값이 없으면 DEFAULT_TEMPLATES로 폴백한다.
//
// 토큰은 {학생명} {시간} {날짜} {평가명} {점수} 형태이며, renderTemplate가
// 전달된 변수로 치환한다. 이 구조는 추후 카카오 알림톡 템플릿(사전 승인 필요)
// 으로 그대로 매핑하기 위한 사전 준비이기도 하다.

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
  checkIn:
    '안녕하세요, 그로잉영어입니다. 🌱\n\n오늘 {학생명} 학생이 {시간}에 안전하게 등원하였습니다.\n오늘도 밝은 분위기 속에서 즐겁고 성실하게 공부하고 귀가할 수 있도록 지도하겠습니다. 감사합니다.',
  checkOut:
    '안녕하세요, 그로잉영어입니다. 🌱\n\n오늘 {학생명} 학생이 금일 개별 학습 일정을 건강하게 마치고 {시간}에 하원하였습니다.\n가정에서도 숙제 수행 및 오늘 배운 단어를 복습할 수 있도록 격려와 지도 유도 부탁드립니다. 조은 하루 보내세요!',
  homeworkDone:
    '안녕하세요, 그로잉영어입니다. 🌱\n\n오늘 {학생명} 학생은 부여된 영어 숙제와 단어 암기 준비를 아주 성실하게 잘 완료하고 수업에 참여하였습니다. 대견한 모습에 가정에서도 많은 칭찬과 격려 부탁드립니다. 감사합니다.',
  homeworkIncomplete:
    '안녕하세요, 그로잉영어입니다. 🌱\n\n오늘 {학생명} 학생은 영어 숙제 및 단어 준비가 다소 부족(일부 미완료)한 상태로 등원하였습니다. 교습소에서 개별 보완 지도를 실시하였으나, 가정에서도 학습 습관이 유지되도록 남은 과제를 챙겨주시기를 부탁드립니다.',
  homeworkUndone:
    '안녕하세요, 그로잉영어입니다. 🌱\n\n오늘 {학생명} 학생은 영어 숙제 및 단어 암기 준비가 전혀 되어있지 않았습니다. 학업 연속성을 위해 과제 수행이 필수적이오니, 가정에서도 숙제를 반드시 완료해서 보낼 수 있도록 각별한 지도 협조를 부탁드립니다.',
  makeup:
    '안녕하세요, 그로잉영어입니다. 🌱\n\n{학생명} 학생의 미수강 진도 보충을 위한 개별 보강 수업 일정을 안내드립니다.\n\n- 일시: {날짜} {시간}\n\n학생이 늦지 않고 출석하여 진도를 맞출 수 있도록 학부모님의 지도 협조 부탁드립니다. 감사합니다.',
  test:
    '안녕하세요, 그로잉영어입니다. 🌱\n\n오늘 시행한 {학생명} 학생의 단원 평가 결과를 안내해 드립니다.\n\n- 평가 영역: {평가명}\n- 평가 점수: {점수}\n\n스스로 열심히 노력하여 훌륭한 성취를 낸 {학생명} 학생에게 아낌없는 칭찬과 응원 부탁드립니다. 늘 믿고 맡겨주셔서 감사드립니다.',
};

// 설정 UI에서 각 템플릿의 라벨과 사용 가능 토큰을 안내하기 위한 메타.
export const TEMPLATE_META: { key: MessageTemplateKey; label: string; tokens: string[] }[] = [
  { key: 'checkIn', label: '등원 완료 🌱', tokens: ['{학생명}', '{시간}'] },
  { key: 'checkOut', label: '하원 완료 🏡', tokens: ['{학생명}', '{시간}'] },
  { key: 'homeworkDone', label: '숙제 완료 👍', tokens: ['{학생명}'] },
  { key: 'homeworkIncomplete', label: '숙제 미흡 📝', tokens: ['{학생명}'] },
  { key: 'homeworkUndone', label: '숙제 안함 ⚠️', tokens: ['{학생명}'] },
  { key: 'makeup', label: '보강 안내 🕒', tokens: ['{학생명}', '{날짜}', '{시간}'] },
  { key: 'test', label: '평가 결과 🎯', tokens: ['{학생명}', '{평가명}', '{점수}'] },
];

// {토큰}을 전달된 변수로 치환한다. 변수에 없는 토큰은 그대로 둔다(편집 중
// 미리보기에서 어떤 자리인지 보이도록).
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{([^}]+)\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

// 저장값(부분/구버전 가능)을 기본값과 병합해 항상 모든 키가 채워진 객체를 만든다.
export function mergeTemplates(stored: Partial<MessageTemplates> | null | undefined): MessageTemplates {
  return { ...DEFAULT_TEMPLATES, ...(stored ?? {}) };
}
