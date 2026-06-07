import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { useAcademyData } from './hooks/useAcademyData';
import { Login } from './components/Login';

// Import Tab Components
import { Dashboard } from './components/Dashboard';
import { Students } from './components/Students';
import { Classes } from './components/Classes';
import { AttendanceManager } from './components/Attendance';
import { AttendanceStats } from './components/AttendanceStats';
import { Payments } from './components/Payments';
import { CounselLogs } from './components/CounselLogs';
import { Backup } from './components/Backup';
import { Kiosk } from './components/Kiosk';
import { Messaging } from './components/Messaging';
import { Assistant } from './components/Assistant';
import { DataQuality } from './components/DataQuality';
import { MakeupManager } from './components/MakeupManager';
import { KakaoManager } from './components/KakaoManager';
import { Exams, PublicExamRoute, PublicResultRoute } from './components/Exams';
import {
  FLOW_TAB_GROUPS,
  MOBILE_QUICK_NAV_ITEMS,
  PRIMARY_NAV_GROUPS,
  SETTINGS_NAV_ITEM,
  TAB_DESCRIPTIONS as FLOW_TAB_DESCRIPTIONS,
  TAB_TITLES as FLOW_TAB_TITLES,
  WORKFLOW_SHORTCUTS,
  getPrimaryTabId,
  type NavItem as FlowNavItem,
  type TabId,
} from './navigation';

// Import Icons
import {
  LayoutDashboard,
  Users,
  BookOpen,
  ClipboardList,
  CalendarCheck,
  CreditCard,
  MessageSquare,
  ShieldCheck,
  Menu,
  X,
  Smartphone,
  MessageCircle,
  Monitor,
  BarChart3,
  LogOut,
  type LucideIcon,
} from 'lucide-react';

// 담쟁이(Ivy) 브랜드 아이콘
const IvyIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 20h10M10 20c5.5-2.5.8-6.4 5-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.6 1.4-.5 2.6-.4 4 1.7-.4 3-1 4-2.2 1-1.3 1.3-3 1.4-4.8-2.4.6-3.9 1.5-4.7 3z" />
  </svg>
);

// Navigation grouped by usage flow so the most-frequent daily tasks sit at the
// top. Rendered by both the desktop sidebar and the mobile drawer. The 'kiosk'
// item launches full-screen mode via a confirm; settings live in the footer.
type NavItem = { id: string; label: string; icon: LucideIcon; kind?: 'kiosk' };
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: '오늘 업무',
    items: [
      { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
      { id: 'attendance', label: '출결 관리', icon: CalendarCheck },
      { id: 'makeup', label: '보강/보충 관리', icon: CalendarCheck },
      { id: 'messaging', label: '알림장 발송', icon: Smartphone },
      { id: 'kiosk', label: '키오스크 모드', icon: Monitor, kind: 'kiosk' },
    ],
  },
  {
    title: '원생 · 수업',
    items: [
      { id: 'students', label: '학생 관리', icon: Users },
      { id: 'classes', label: '반/시간표 관리', icon: BookOpen },
      { id: 'payments', label: '수납 관리', icon: CreditCard },
    ],
  },
  {
    title: '기록 · 분석',
    items: [
      { id: 'counsel', label: '상담/진도 일지', icon: MessageSquare },
      { id: 'kakao', label: '카카오 관리', icon: MessageCircle },
      { id: 'stats', label: '출결 통계', icon: BarChart3 },
      { id: 'data-quality', label: '\uB370\uC774\uD130 \uC810\uAC80', icon: ShieldCheck },
    ],
  },
];


const TAB_TITLES: Record<string, string> = {
  dashboard: '학원 운영 대시보드',
  students: '재원생 주소록 및 관리',
  classes: '학급 개설 및 시간표',
  attendance: '출석 및 보강 관리',
  makeup: '보강/보충 관리',
  stats: '월별 출결 통계 리포트',
  'data-quality': '\uB370\uC774\uD130 \uC810\uAC80',
  payments: '교육비 수납 장부',
  counsel: '상담 및 학습/성적 일지',
  kakao: '카카오 채널봇 관리',
  messaging: '알림장 발송 도우미',
  kiosk: '자율 등하원 키오스크',
  backup: 'AI·알림·백업 설정',
};

if (!NAV_GROUPS.some(group => group.items.some(item => item.id === 'exams'))) {
  NAV_GROUPS[1]?.items.splice(2, 0, { id: 'exams', label: '평가 관리', icon: ClipboardList });
}
TAB_TITLES.exams = '평가 관리';
void NAV_GROUPS;
void TAB_TITLES;

const KIOSK_RELOAD_RESET_KEY = 'growing:kiosk-reload-reset';

function NavItemButton({
  active,
  icon: Icon,
  label,
  onClick,
  badge,
  kioskStyle,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  badge?: number;
  kioskStyle?: boolean;
}) {
  return (
    <button
      className={`side-item${active ? ' active' : ''}`}
      style={kioskStyle ? { color: '#a3e2c9', fontWeight: 700 } : undefined}
      onClick={onClick}
    >
      <Icon size={18} /> {label}
      {badge ? <span className="badge-n">{badge}</span> : null}
    </button>
  );
}

// Centered full-screen message (loading / error states).
function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        color: 'var(--color-text-secondary)',
        textAlign: 'center',
      }}
    >
      <div>{children}</div>
    </div>
  );
}

// Top-level: resolve the auth session, then gate the app behind login.
function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [hashRoute, setHashRoute] = useState(() => window.location.hash);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onHashChange = () => setHashRoute(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (hashRoute.startsWith('#/exam-result/')) {
    return <PublicResultRoute token={decodeURIComponent(hashRoute.replace('#/exam-result/', ''))} />;
  }

  if (hashRoute.startsWith('#/exam/')) {
    return <PublicExamRoute code={decodeURIComponent(hashRoute.replace('#/exam/', ''))} />;
  }

  if (!authReady) {
    return <FullScreen><IvyIcon size={28} /><div style={{ marginTop: '0.75rem', color: 'var(--color-text-secondary)' }}>불러오는 중...</div></FullScreen>;
  }
  if (!session) {
    return <Login />;
  }
  return <AcademyApp session={session} />;
}

// The signed-in application: loads data for the owner and renders the UI.
function AcademyApp({ session }: { session: Session }) {
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (sessionStorage.getItem(KIOSK_RELOAD_RESET_KEY) === '1') {
      sessionStorage.removeItem(KIOSK_RELOAD_RESET_KEY);
    }
    return 'dashboard';
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const data = useAcademyData(session.user.id);
  const {
    loading,
    error,
    reload,
    students,
    classes,
    attendance,
    payments,
    counselLogs,
    kioskAlerts,
    homeworkAlerts,
    kakaoParentLinks,
    kakaoParentRequests,
    kakaoEventLogs,
    kioskPin,
  } = data;

  const handleLogout = () => {
    void supabase.auth.signOut();
  };

  useEffect(() => {
    const markKioskReload = () => {
      if (activeTab === 'kiosk') {
        sessionStorage.setItem(KIOSK_RELOAD_RESET_KEY, '1');
      }
    };
    window.addEventListener('beforeunload', markKioskReload);
    window.addEventListener('pagehide', markKioskReload);
    return () => {
      window.removeEventListener('beforeunload', markKioskReload);
      window.removeEventListener('pagehide', markKioskReload);
    };
  }, [activeTab]);

  const handleAssistantDraftToMessaging = () => {
    setActiveTab('messaging');
    setIsMobileMenuOpen(false);
  };

  const goDashboard = () => {
    sessionStorage.removeItem(KIOSK_RELOAD_RESET_KEY);
    setActiveTab('dashboard');
    setIsMobileMenuOpen(false);
  };

  const startKioskMode = () => {
    if (window.confirm('자율출결 키오스크 단말기 모드로 전환하시겠습니까? (복귀 시 관리자 PIN이 필요합니다)')) {
      sessionStorage.removeItem(KIOSK_RELOAD_RESET_KEY);
      setActiveTab('kiosk');
      setIsMobileMenuOpen(false);
    }
  };

  const mobileQuickNavItems: FlowNavItem[] = MOBILE_QUICK_NAV_ITEMS;
  const primaryActiveTab = getPrimaryTabId(activeTab);

  // Render Page Content based on tab Selection
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            students={students}
            classes={classes}
            attendance={attendance}
            payments={payments}
            onSaveAttendance={data.handleSaveAttendance}
            onNavigate={(tab) => {
              setActiveTab(tab);
              setIsMobileMenuOpen(false);
            }}
          />
        );
      case 'students':
        return (
          <Students
            students={students}
            classes={classes}
            attendance={attendance}
            payments={payments}
            counselLogs={counselLogs}
            onAddStudent={data.handleAddStudent}
            onUpdateStudent={data.handleUpdateStudent}
            onWithdrawStudent={data.handleWithdrawStudent}
            onPauseStudent={data.handlePauseStudent}
            onRestoreStudent={data.handleRestoreStudent}
            onAddCounselLog={data.handleAddCounselLog}
            onUpdateCounselLog={data.handleUpdateCounselLog}
          />
        );
      case 'classes':
        return (
          <Classes
            classes={classes}
            students={students}
            onAddClass={data.handleAddClass}
            onUpdateClass={data.handleUpdateClass}
            onDeleteClass={data.handleDeleteClass}
          />
        );
      case 'exams':
        return <Exams classes={classes} students={students} onSendGuideToMessaging={handleAssistantDraftToMessaging} />;
      case 'attendance':
        return (
          <AttendanceManager
            attendance={attendance}
            students={students}
            classes={classes}
            onSaveAttendance={data.handleSaveAttendance}
            onDeleteAttendance={data.handleDeleteAttendance}
          />
        );
      case 'makeup':
        return (
          <MakeupManager
            attendance={attendance}
            students={students}
            classes={classes}
            onSaveAttendance={data.handleSaveAttendance}
          />
        );
      case 'stats':
        return (
          <AttendanceStats
            students={students}
            classes={classes}
            attendance={attendance}
            payments={payments}
            onSendDraftToMessaging={handleAssistantDraftToMessaging}
          />
        );
      case 'data-quality':
        return (
          <DataQuality
            students={students}
            classes={classes}
            attendance={attendance}
            payments={payments}
            counselLogs={counselLogs}
            onNavigate={(tab) => {
              setActiveTab(tab as TabId);
              setIsMobileMenuOpen(false);
            }}
          />
        );
      case 'payments':
        return (
          <Payments
            payments={payments}
            students={students}
            classes={classes}
            onGenerateMonthlyBills={data.handleGenerateMonthlyBills}
            onRecordPayment={data.handleRecordPayment}
            onCancelPayment={data.handleCancelPayment}
            onDeletePayment={data.handleDeletePayment}
            onAddManualPayment={data.handleAddManualPayment}
            onImportPayssam={data.handleImportPayssam}
            onNavigate={(tab) => {
              setActiveTab(tab);
              setIsMobileMenuOpen(false);
            }}
          />
        );
      case 'counsel':
        return (
          <CounselLogs
            counselLogs={counselLogs}
            students={students}
            onAddCounselLog={data.handleAddCounselLog}
            onDeleteCounselLog={data.handleDeleteCounselLog}
            onSendDraftToMessaging={handleAssistantDraftToMessaging}
          />
        );
      case 'messaging':
        return (
          <Messaging
            students={students}
            classes={classes}
            attendance={attendance}
            payments={payments}
            counselLogs={counselLogs}
            kioskAlerts={kioskAlerts}
            homeworkAlerts={homeworkAlerts}
            onDismissAlert={data.handleDismissKioskAlert}
            onClearAlerts={data.handleClearKioskAlerts}
            onDismissHomeworkAlert={data.handleDismissHomeworkAlert}
            onClearHomeworkAlerts={data.handleClearHomeworkAlerts}
          />
        );
      case 'kakao':
        return (
          <KakaoManager
            students={students}
            channels={data.kakaoChannels}
            links={kakaoParentLinks}
            requests={kakaoParentRequests}
            events={kakaoEventLogs}
            onUpdateRequestStatus={data.handleKakaoRequestStatus}
            onSaveChannel={data.handleSaveKakaoChannel}
          />
        );
      case 'kiosk':
        return (
          <Kiosk
            students={students}
            classes={classes}
            kioskPin={kioskPin}
            onSaveAttendance={data.handleSaveAttendance}
            onQueueAlert={data.handleQueueKioskAlert}
            onExitKiosk={goDashboard}
          />
        );
      case 'backup':
        return (
          <Backup
            onImportData={data.handleImportData}
            onResetData={data.handleResetData}
            getAllData={data.getAllData}
            kioskPin={kioskPin}
            onChangeKioskPin={data.handleChangeKioskPin}
          />
        );
      default:
        return <div>페이지를 찾을 수 없습니다.</div>;
    }
  };

  // 데스크탑 사이드바 + 모바일 드로어 공용 네비게이션
  const renderNavSection = (opts: { closeOnNav: boolean }) => {
    const go = (id: TabId) => {
      sessionStorage.removeItem(KIOSK_RELOAD_RESET_KEY);
      setActiveTab(id);
      if (opts.closeOnNav) setIsMobileMenuOpen(false);
    };
    const launchKiosk = () => {
      if (opts.closeOnNav) setIsMobileMenuOpen(false);
      startKioskMode();
    };

    return (
      <>
        <nav style={{ flexGrow: 1 }}>
          {PRIMARY_NAV_GROUPS.map(group => (
            <div key={group.title} className="side-group">
              <div className="side-group-t">{group.title}</div>
              {group.items.map(item => (
                <NavItemButton
                  key={item.id}
                  active={primaryActiveTab === item.id}
                  icon={item.icon}
                  label={item.label}
                  onClick={item.kind === 'kiosk' ? launchKiosk : () => go(item.id)}
                  badge={item.id === 'messaging' ? kioskAlerts.length + homeworkAlerts.length || undefined : undefined}
                  kioskStyle={item.kind === 'kiosk'}
                />
              ))}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <NavItemButton
            active={primaryActiveTab === 'backup'}
            icon={SETTINGS_NAV_ITEM.icon}
            label={SETTINGS_NAV_ITEM.label}
            onClick={() => go(SETTINGS_NAV_ITEM.id)}
          />
        </div>
      </>
    );
  };

  const renderWorkflowShortcuts = () => {
    const tabGroup = FLOW_TAB_GROUPS.find(group => group.ids.includes(activeTab));
    if (tabGroup) {
      return (
        <div className="flow-tabs" role="tablist" aria-label="업무 흐름 탭">
          {tabGroup.tabs.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={`${tabGroup.parentId}-${item.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === item.id}
                className={`flow-tab${activeTab === item.id ? ' active' : ''}`}
                onClick={() => {
                  sessionStorage.removeItem(KIOSK_RELOAD_RESET_KEY);
                  setActiveTab(item.id);
                  setIsMobileMenuOpen(false);
                }}
              >
                <Icon size={15} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      );
    }

    const shortcuts = WORKFLOW_SHORTCUTS[activeTab] ?? [];
    if (shortcuts.length === 0) return null;

    const go = (id: TabId) => {
      sessionStorage.removeItem(KIOSK_RELOAD_RESET_KEY);
      setActiveTab(id);
      setIsMobileMenuOpen(false);
    };

    return (
      <div className="flow-shortcuts" aria-label="관련 업무 바로가기">
        {shortcuts.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={`${activeTab}-${item.id}-${item.label}`}
              type="button"
              className={`flow-chip${activeTab === item.id ? ' active' : ''}`}
              onClick={item.kind === 'kiosk' ? startKioskMode : () => go(item.id)}
            >
              <Icon size={14} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return <FullScreen><IvyIcon size={28} /><div style={{ marginTop: '0.75rem', color: 'var(--color-text-secondary)' }}>데이터를 불러오는 중...</div></FullScreen>;
  }

  if (error) {
    return (
      <FullScreen>
        <div style={{ color: 'var(--color-danger)', fontWeight: 600, marginBottom: '1rem' }}>
          데이터를 불러오지 못했습니다.<br />{error}
        </div>
        <button className="btn btn-primary" onClick={() => void reload()}>다시 시도</button>
        <button className="btn btn-secondary" style={{ marginLeft: '0.5rem' }} onClick={handleLogout}>로그아웃</button>
      </FullScreen>
    );
  }

  if (activeTab === 'kiosk') {
    return renderContent();
  }

  return (
    <div className="app-container">
      {/* ── 데스크탑 사이드바 ── */}
      <aside className="sidebar desktop-sidebar">
        <button className="side-logo" type="button" onClick={goDashboard} aria-label="대시보드로 이동">
          <span className="side-logo-ic">
            <IvyIcon size={22} />
          </span>
          <div className="side-logo-tx">
            <h1>그로잉영어</h1>
            <span>Growing English</span>
          </div>
        </button>

        {renderNavSection({ closeOnNav: false })}
      </aside>

      {/* ── 모바일 상단 헤더 ── */}
      <header className="mobile-header m-header">
        <button className="m-header-logo" type="button" onClick={goDashboard} aria-label="대시보드로 이동">
          <span className="side-logo-ic" style={{ width: 30, height: 30, borderRadius: 9 }}>
            <IvyIcon size={18} />
          </span>
          <span>그로잉영어</span>
        </button>
        <div className="m-header-actions">
          <button
            type="button"
            className="m-header-btn"
            onClick={handleLogout}
            title={session.user.email ?? ''}
          >
            <LogOut size={14} /> 로그아웃
          </button>
          <button
            type="button"
            className="m-header-btn"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="메뉴 열기"
          >
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* ── 모바일 드로어 ── */}
      {isMobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="mobile-menu-drawer" onClick={e => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <button className="m-header-logo" type="button" onClick={goDashboard} aria-label="대시보드로 이동">
                <span className="side-logo-ic" style={{ width: 30, height: 30, borderRadius: 9 }}>
                  <IvyIcon size={18} />
                </span>
                <span style={{ color: '#fff' }}>그로잉영어</span>
              </button>
              <button className="btn-icon-only" style={{ color: '#ffffff' }} onClick={() => setIsMobileMenuOpen(false)}>
                <X size={22} />
              </button>
            </div>

            {renderNavSection({ closeOnNav: true })}
          </div>
        </div>
      )}

      {/* ── 메인 콘텐츠 ── */}
      <main className="main-content">
        <header className="app-topbar">
          <div>
            <h2>{FLOW_TAB_TITLES[activeTab] ?? '그로잉영어'}</h2>
            <p>{FLOW_TAB_DESCRIPTIONS[activeTab] ?? '그로잉영어 교습소의 학생 성장을 기록하고 관리합니다.'}</p>
            {renderWorkflowShortcuts()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              className="btn btn-secondary"
              style={{ gap: '0.4rem' }}
              onClick={startKioskMode}
            >
              키오스크 시작
            </button>
            <button
              className="btn btn-secondary"
              style={{ gap: '0.4rem' }}
              onClick={handleLogout}
              title={session.user.email ?? ''}
            >
              <LogOut size={15} /> 로그아웃
            </button>
          </div>
        </header>

        <div style={{ animation: 'fadeIn 0.25s ease-out' }}>
          {renderContent()}
        </div>
      </main>

      {/* ── 모바일 하단 탭 (m-tabs) ── */}
      <nav className="mobile-bottom-nav m-tabs" aria-label="빠른 이동">
        {mobileQuickNavItems.map(item => {
          const Icon = item.icon;
          const badge = item.id === 'messaging' ? kioskAlerts.length + homeworkAlerts.length : 0;
          return (
            <button
              key={item.id}
              type="button"
              className={`m-tab${primaryActiveTab === item.id ? ' active' : ''}`}
              onClick={() => {
                setActiveTab(item.id);
                setIsMobileMenuOpen(false);
              }}
            >
              <Icon size={20} />
              {badge > 0 && <em>{badge}</em>}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* AI 비서 아이비 — 평가 관리에서는 전용 AI 편집 UI와 겹치므로 숨긴다. */}
      {activeTab !== 'exams' && <Assistant onSendToMessaging={handleAssistantDraftToMessaging} />}
    </div>
  );
}

export default App;
