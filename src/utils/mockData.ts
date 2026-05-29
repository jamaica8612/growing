import type { Student, Class, Attendance, Payment, CounselLog } from '../types';

export const initialStudents: Student[] = [
  {
    id: 'std_1',
    name: '김도현',
    school: '그린초등학교',
    grade: '초등 4학년',
    contact: '010-1111-2222',
    parentContact: '010-3333-4444',
    registrationDate: '2026-02-01',
    status: 'active',
    memo: '파닉스는 뗐고 기초 회화 및 독해 공부 중. 발표하는 것을 부끄러워하지만 성실함.',
  },
  {
    id: 'std_2',
    name: '이서아',
    school: '푸른초등학교',
    grade: '초등 3학년',
    contact: '',
    parentContact: '010-5555-6666',
    registrationDate: '2026-03-10',
    status: 'active',
    memo: '활발하고 흥이 많은 성격. 영어 게임이나 챈트(Chant) 수업에 매우 적극적.',
  },
  {
    id: 'std_3',
    name: '박준우',
    school: '그린초등학교',
    grade: '초등 5학년',
    contact: '010-2222-3333',
    parentContact: '010-7777-8888',
    registrationDate: '2026-01-15',
    status: 'active',
    memo: '어휘력이 풍부함. 쓰기 숙제를 가끔 밀려오는 편이라 지도가 필요함.',
  },
  {
    id: 'std_4',
    name: '최지우',
    school: '그린중학교',
    grade: '중등 1학년',
    contact: '010-4444-5555',
    parentContact: '010-9999-0000',
    registrationDate: '2025-11-01',
    status: 'active',
    memo: '중등 내신 대비 영문법 집중 학습 중. 독해력이 좋고 숙제도 꼼꼼히 해옴.',
  },
  {
    id: 'std_5',
    name: '정예은',
    school: '푸른초등학교',
    grade: '초등 6학년',
    contact: '010-6666-7777',
    parentContact: '010-1234-5678',
    registrationDate: '2026-04-01',
    status: 'active',
    memo: '최근 등록. 듣기 능력이 다소 부족하지만 리딩과 스피킹 열의가 높음.',
  },
  {
    id: 'std_6',
    name: '강민재',
    school: '그린중학교',
    grade: '중등 2학년',
    contact: '010-8888-9999',
    parentContact: '010-8765-4321',
    registrationDate: '2025-09-01',
    status: 'inactive',
    memo: '이사로 인해 2026년 4월 말 퇴원함. 아쉬워하며 이사 후 학원 추천해 드림.',
  },
];

export const initialClasses: Class[] = [
  {
    id: 'cls_1',
    name: '초등 파닉스반 (Phonics)',
    days: ['월', '수'],
    startTime: '14:00',
    endTime: '15:00',
    tuitionFee: 180000,
    studentIds: ['std_2', 'std_3'],
  },
  {
    id: 'cls_2',
    name: '초등 말하기 B반 (Speaking B)',
    days: ['화', '목'],
    startTime: '15:30',
    endTime: '17:00',
    tuitionFee: 200000,
    studentIds: ['std_1', 'std_5'],
  },
  {
    id: 'cls_3',
    name: '중등 문법/독해반 (Middle-Prep)',
    days: ['월', '수', '금'],
    startTime: '17:30',
    endTime: '19:00',
    tuitionFee: 250000,
    studentIds: ['std_4'],
  },
];

// Let's assume today is 2026-05-29 (Friday)
export const initialAttendance: Attendance[] = [
  // 2026-05-27 (Wed) - Class 1, Class 3
  { id: 'att_1', studentId: 'std_2', classId: 'cls_1', date: '2026-05-27', status: 'present', memo: '' },
  { id: 'att_2', studentId: 'std_3', classId: 'cls_1', date: '2026-05-27', status: 'late', memo: '학습지 교사가 늦게 가 영어를 10분 지각함' },
  { id: 'att_3', studentId: 'std_4', classId: 'cls_3', date: '2026-05-27', status: 'present', memo: '' },

  // 2026-05-28 (Thu) - Class 2
  { id: 'att_4', studentId: 'std_1', classId: 'cls_2', date: '2026-05-28', status: 'present', memo: '' },
  { id: 'att_5', studentId: 'std_5', classId: 'cls_2', date: '2026-05-28', status: 'absent', memo: '가족 행사로 결석 (6/1 보강 예정)' },

  // 2026-05-29 (Fri) - Class 3 (Today)
  { id: 'att_6', studentId: 'std_4', classId: 'cls_3', date: '2026-05-29', status: 'present', memo: '' },
];

export const initialPayments: Payment[] = [
  // 5월 수납 내역 (Billing Month: 2026-05)
  { id: 'pay_1', studentId: 'std_1', billingMonth: '2026-05', amount: 200000, paymentDate: '2026-05-15', paymentMethod: 'card', status: 'paid' },
  { id: 'pay_2', studentId: 'std_2', billingMonth: '2026-05', amount: 180000, paymentDate: '2026-05-12', paymentMethod: 'transfer', status: 'paid' },
  { id: 'pay_3', studentId: 'std_3', billingMonth: '2026-05', amount: 180000, status: 'unpaid' }, // Unpaid!
  { id: 'pay_4', studentId: 'std_4', billingMonth: '2026-05', amount: 250000, paymentDate: '2026-05-05', paymentMethod: 'card', status: 'paid' },
  { id: 'pay_5', studentId: 'std_5', billingMonth: '2026-05', amount: 200000, status: 'unpaid' }, // Unpaid!

  // 4월 수납 내역 (Billing Month: 2026-04)
  { id: 'pay_6', studentId: 'std_1', billingMonth: '2026-04', amount: 200000, paymentDate: '2026-04-14', paymentMethod: 'card', status: 'paid' },
  { id: 'pay_7', studentId: 'std_2', billingMonth: '2026-04', amount: 180000, paymentDate: '2026-04-10', paymentMethod: 'transfer', status: 'paid' },
  { id: 'pay_8', studentId: 'std_3', billingMonth: '2026-04', amount: 180000, paymentDate: '2026-04-12', paymentMethod: 'cash', status: 'paid' },
  { id: 'pay_9', studentId: 'std_4', billingMonth: '2026-04', amount: 250000, paymentDate: '2026-04-05', paymentMethod: 'card', status: 'paid' },
];

export const initialCounselLogs: CounselLog[] = [
  {
    id: 'log_1',
    studentId: 'std_1',
    date: '2026-05-18',
    title: '전화 상담 - 단어 암기 상태 공유',
    content: '어머님께 도현이가 리딩 해석은 훌륭하나 어휘 복습이 부족함을 말씀드림. 가정에서도 매일 15분씩 단어장을 눈으로 훑을 수 있도록 지도해 주시기로 하심.',
    type: 'counsel',
  },
  {
    id: 'log_2',
    studentId: 'std_3',
    date: '2026-05-20',
    title: 'Unit 5 단원 평가 테스트 결과',
    content: '파닉스 장모음 규칙에 대한 이해가 높음. 20문제 중 18문제 득점. 틀린 문제는 e의 묵음 처리에 대한 부분으로 오답노트 작성 및 추가 설명 완료.',
    type: 'test',
    score: '90/100',
  },
  {
    id: 'log_3',
    studentId: 'std_4',
    date: '2026-05-25',
    title: '중등 내신 대비 영문법 진도 현황',
    content: '관계대명사의 주격/목적격 개념 학습 완료. 선행사에 따른 주격 관계대명사 일치 문제 100% 이해함. 다음 주에는 소유격 관계대명사와 관계부사 대비 예정.',
    type: 'progress',
  },
];
