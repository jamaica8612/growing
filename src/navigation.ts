import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  MessageCircle,
  MessageSquare,
  Monitor,
  RefreshCw,
  Settings,
  ShieldCheck,
  Smartphone,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type TabId =
  | 'dashboard'
  | 'students'
  | 'classes'
  | 'attendance'
  | 'makeup'
  | 'stats'
  | 'data-quality'
  | 'payments'
  | 'counsel'
  | 'kakao'
  | 'messaging'
  | 'kiosk'
  | 'backup'
  | 'exams';

export type NavItem = {
  id: TabId;
  label: string;
  icon: LucideIcon;
  kind?: 'kiosk';
  mobile?: boolean;
  isSettings?: boolean;
  adminOnly?: boolean;
  paidOnly?: boolean;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const PRIMARY_NAV_GROUPS: NavGroup[] = [
  {
    title: '그날 운영',
    items: [
      { id: 'dashboard', label: '오늘', icon: LayoutDashboard, mobile: true },
      { id: 'attendance', label: '출결 관리', icon: CalendarCheck, mobile: true },
      { id: 'makeup', label: '보강 · 보충', icon: RefreshCw },
      { id: 'messaging', label: '알림장', icon: Smartphone, mobile: true },
      { id: 'kiosk', label: '키오스크 시작', icon: Monitor, kind: 'kiosk' },
    ],
  },
  {
    title: '원생 · 수업',
    items: [
      { id: 'students', label: '학생 관리', icon: Users, mobile: true },
      { id: 'classes', label: '반 / 시간표', icon: BookOpen },
      { id: 'exams', label: '평가 관리', icon: ClipboardList },
      { id: 'payments', label: '수납 관리', icon: CreditCard },
    ],
  },
  {
    title: '기록 · 분석',
    items: [
      { id: 'counsel', label: '상담 / 진도', icon: MessageSquare },
      { id: 'stats', label: '출결 통계', icon: BarChart3 },
      { id: 'kakao', label: '카카오 채널', icon: MessageCircle },
      { id: 'data-quality', label: '데이터 점검', icon: ShieldCheck },
    ],
  },
];

export type ScreenAction = {
  to: TabId;
  label: string;
  primary?: boolean;
  kind?: 'kiosk';
};

// 화면별 토픽바 맥락 액션 — 내비게이션 서브탭/바로가기 칩을 대체한다.
export const SCREEN_ACTIONS: Record<TabId, ScreenAction[]> = {
  dashboard: [
    { to: 'attendance', label: '출결 체크' },
    { to: 'kiosk', label: '키오스크 시작', kind: 'kiosk', primary: true },
  ],
  attendance: [
    { to: 'makeup', label: '보강 관리' },
    { to: 'messaging', label: '알림장 발송', primary: true },
  ],
  makeup: [{ to: 'attendance', label: '출결 입력' }],
  messaging: [{ to: 'kakao', label: '카카오 요청', primary: true }],
  students: [
    { to: 'stats', label: '출결 리포트' },
    { to: 'messaging', label: '학부모 안내', primary: true },
  ],
  classes: [
    { to: 'attendance', label: '출결 입력' },
    { to: 'exams', label: '평가 만들기', primary: true },
  ],
  exams: [{ to: 'messaging', label: '시험 결과 안내', primary: true }],
  payments: [
    { to: 'messaging', label: '미납 안내 보내기', primary: true },
    { to: 'students', label: '학생별 이력' },
  ],
  counsel: [{ to: 'students', label: '학생 상세' }],
  stats: [{ to: 'messaging', label: '관리 대상 안내', primary: true }],
  kakao: [{ to: 'messaging', label: '알림장' }],
  'data-quality': [],
  backup: [{ to: 'data-quality', label: '데이터 점검' }],
  kiosk: [],
};

export const SETTINGS_NAV_ITEM: NavItem = {
  id: 'backup',
  label: '설정',
  icon: Settings,
  isSettings: true,
  adminOnly: true,
  mobile: true,
};

export const WORKFLOW_SHORTCUTS: Record<string, NavItem[]> = {
  dashboard: [
    { id: 'attendance', label: '출결 상세', icon: CalendarCheck },
    { id: 'makeup', label: '보강 처리', icon: CalendarCheck },
    { id: 'messaging', label: '알림장 발송', icon: Smartphone },
    { id: 'kiosk', label: '키오스크 시작', icon: Monitor, kind: 'kiosk' },
  ],
  students: [
    { id: 'stats', label: '출결 리포트', icon: BarChart3 },
    { id: 'messaging', label: '학부모 안내', icon: Smartphone },
  ],
  classes: [
    { id: 'attendance', label: '출결 입력', icon: CalendarCheck },
    { id: 'makeup', label: '보강/보충', icon: CalendarCheck },
    { id: 'exams', label: '평가 관리', icon: ClipboardList },
    { id: 'stats', label: '출결 리포트', icon: BarChart3 },
  ],
  payments: [
    { id: 'messaging', label: '미납 안내', icon: Smartphone },
    { id: 'students', label: '학생별 이력', icon: Users },
  ],
  messaging: [
    { id: 'kakao', label: '카카오 요청', icon: MessageCircle },
    { id: 'exams', label: '시험 결과 안내', icon: ClipboardList },
  ],
  backup: [
    { id: 'data-quality', label: '데이터 점검', icon: ShieldCheck },
    { id: 'kakao', label: '카카오/Aligo 연동', icon: MessageCircle, adminOnly: true },
    { id: 'kiosk', label: '키오스크 시작', icon: Monitor, kind: 'kiosk' },
  ],
};

export type FlowTabGroup = {
  parentId: TabId;
  ids: TabId[];
  tabs: NavItem[];
};

export const FLOW_TAB_GROUPS: FlowTabGroup[] = [
  {
    parentId: 'students',
    ids: ['students', 'counsel'],
    tabs: [
      { id: 'students', label: '학생 목록', icon: Users },
      { id: 'counsel', label: '상담 기록', icon: MessageSquare },
    ],
  },
  {
    parentId: 'classes',
    ids: ['classes', 'attendance', 'makeup', 'exams', 'stats'],
    tabs: [
      { id: 'classes', label: '반/시간표', icon: BookOpen },
      { id: 'attendance', label: '출결 입력', icon: CalendarCheck },
      { id: 'makeup', label: '보강/보충', icon: CalendarCheck },
      { id: 'exams', label: '평가', icon: ClipboardList },
      { id: 'stats', label: '출결 리포트', icon: BarChart3 },
    ],
  },
  {
    parentId: 'messaging',
    ids: ['messaging', 'kakao'],
    tabs: [
      { id: 'messaging', label: '알림장', icon: Smartphone },
      { id: 'kakao', label: '카카오 요청', icon: MessageCircle },
    ],
  },
];

export const getPrimaryTabId = (tabId: TabId): TabId => {
  const group = FLOW_TAB_GROUPS.find(item => item.ids.includes(tabId));
  return group?.parentId ?? tabId;
};

export const TAB_TITLES: Record<TabId, string> = {
  dashboard: '오늘 운영',
  students: '학생 관리',
  classes: '수업 관리',
  attendance: '출결 상세',
  makeup: '보강/보충 처리',
  stats: '출결 리포트',
  'data-quality': '데이터 점검',
  payments: '수납 관리',
  counsel: '상담 기록',
  kakao: '카카오 요청/연동',
  messaging: '학부모 소통',
  kiosk: '자율 등하원 키오스크',
  backup: '설정',
  exams: '평가 관리',
};

export const TAB_DESCRIPTIONS: Record<TabId, string> = {
  dashboard: '오늘 수업, 출결, 보강, 미납 안내 후보를 한 화면에서 확인합니다.',
  students: '학생 상세 타임라인, 상담, 리포트, 출결·수납 이력을 관리합니다.',
  classes: '반과 시간표를 기준으로 수업 운영 흐름을 정리합니다.',
  attendance: '날짜와 반별 출결, 숙제, 보강/보충 상태를 자세히 입력합니다.',
  makeup: '결석으로 생긴 보강 필요 항목과 수행한 보강/보충을 처리합니다.',
  stats: '출결 흐름과 위험 신호를 리포트로 확인합니다.',
  'data-quality': '학생, 반, 출결, 수납 데이터의 누락과 중복을 점검합니다.',
  payments: '청구, 납부, 미납, 결제선생 가져오기를 관리합니다.',
  counsel: '상담, 진도, 테스트 기록을 학생별로 남기고 안내문으로 연결합니다.',
  kakao: '학부모 카카오 요청과 채널 연동 상태를 확인합니다.',
  messaging: '일일 종합알림장, 미납 안내, 상담 안내, 발송 후보를 정리합니다.',
  kiosk: '학생이 직접 등하원을 기록하는 단말 모드입니다.',
  backup: '연동, 백업, 키오스크 PIN, AI 설정, 데이터 관리 도구를 모았습니다.',
  exams: '시험 제작, 배포, 제출 현황, 결과 안내를 관리합니다.',
};

// 모바일 하단 빠른 이동 — 4개 핵심 탭. 5번째 "더보기"는 App에서 전체 메뉴 시트로 처리.
export const MOBILE_QUICK_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: '오늘', icon: LayoutDashboard },
  { id: 'attendance', label: '출결', icon: CalendarCheck },
  { id: 'messaging', label: '알림장', icon: Smartphone },
  { id: 'students', label: '학생', icon: Users },
];
