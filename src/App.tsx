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

// Import Icons
import {
  LayoutDashboard,
  Users,
  BookOpen,
  CalendarCheck,
  CreditCard,
  MessageSquare,
  ShieldCheck,
  Menu,
  X,
  Smartphone,
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
      { id: 'makeup', label: '\uBCF4\uAC15 \uAD00\uB9AC', icon: CalendarCheck },
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
  makeup: '\uBCF4\uAC15 \uAD00\uB9AC',
  stats: '월별 출결 통계 리포트',
  'data-quality': '\uB370\uC774\uD130 \uC810\uAC80',
  payments: '교육비 수납 장부',
  counsel: '상담 및 학습/성적 일지',
  messaging: '알림장 발송 도우미',
  kiosk: '자율 등하원 키오스크',
  backup: 'AI·알림·백업 설정',
};

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

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
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [assistantDraft, setAssistantDraft] = useState<{ id: number; content: string } | null>(null);

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
    kioskPin,
    messageTemplates,
  } = data;

  const handleLogout = () => {
    void supabase.auth.signOut();
  };

  const handleAssistantDraftToMessaging = (content: string) => {
    setAssistantDraft({ id: Date.now(), content });
    setActiveTab('messaging');
    setIsMobileMenuOpen(false);
  };

  const goDashboard = () => {
    setActiveTab('dashboard');
    setIsMobileMenuOpen(false);
  };

  const mobileQuickNavItems: NavItem[] = [
    { id: 'dashboard', label: '홈', icon: LayoutDashboard },
    { id: 'attendance', label: '출결', icon: CalendarCheck },
    { id: 'messaging', label: '알림장', icon: Smartphone },
    { id: 'students', label: '학생', icon: Users },
    { id: 'backup', label: '설정', icon: ShieldCheck },
  ];

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
      case 'attendance':
        return (
          <AttendanceManager
            attendance={attendance}
            students={students}
            classes={classes}
            messageTemplates={messageTemplates}
            onSaveAttendance={data.handleSaveAttendance}
            onQueueHomeworkAlert={data.handleQueueHomeworkAlert}
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
              setActiveTab(tab);
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
            key={assistantDraft?.id ?? 'manual-messaging'}
            students={students}
            classes={classes}
            attendance={attendance}
            kioskAlerts={kioskAlerts}
            homeworkAlerts={homeworkAlerts}
            onDismissAlert={data.handleDismissKioskAlert}
            onClearAlerts={data.handleClearKioskAlerts}
            onDismissHomeworkAlert={data.handleDismissHomeworkAlert}
            onClearHomeworkAlerts={data.handleClearHomeworkAlerts}
            assistantDraft={assistantDraft}
            messageTemplates={messageTemplates}
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
            onExitKiosk={() => setActiveTab('dashboard')}
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
            messageTemplates={messageTemplates}
            onSaveMessageTemplates={data.handleSaveMessageTemplates}
          />
        );
      default:
        return <div>페이지를 찾을 수 없습니다.</div>;
    }
  };

  // 데스크탑 사이드바 + 모바일 드로어 공용 네비게이션
  const renderNavSection = (opts: { closeOnNav: boolean; showKiosk?: boolean }) => {
    const go = (id: string) => {
      setActiveTab(id);
      if (opts.closeOnNav) setIsMobileMenuOpen(false);
    };
    const launchKiosk = () => {
      if (opts.closeOnNav) setIsMobileMenuOpen(false);
      if (window.confirm('자율출결 키오스크 단말기 모드로 전환하시겠습니까? (복귀 시 관리자 PIN이 필요합니다)')) {
        setActiveTab('kiosk');
      }
    };

    return (
      <>
        <nav style={{ flexGrow: 1 }}>
          {NAV_GROUPS.map(group => {
            const items = (opts.showKiosk ?? true)
              ? group.items
              : group.items.filter(item => item.kind !== 'kiosk');
            return (
              <div key={group.title} className="side-group">
                <div className="side-group-t">{group.title}</div>
                {items.map(item => (
                  <NavItemButton
                    key={item.id}
                    active={activeTab === item.id}
                    icon={item.icon}
                    label={item.label}
                    onClick={item.kind === 'kiosk' ? launchKiosk : () => go(item.id)}
                    badge={item.id === 'messaging' ? kioskAlerts.length + homeworkAlerts.length || undefined : undefined}
                    kioskStyle={item.kind === 'kiosk'}
                  />
                ))}
              </div>
            );
          })}
        </nav>

        <div className="side-foot">
          <NavItemButton
            active={activeTab === 'backup'}
            icon={ShieldCheck}
            label="AI·알림·백업 설정"
            onClick={() => go('backup')}
          />
        </div>
      </>
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

        {renderNavSection({ closeOnNav: false, showKiosk: true })}
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

            {renderNavSection({ closeOnNav: true, showKiosk: true })}
          </div>
        </div>
      )}

      {/* ── 메인 콘텐츠 ── */}
      <main className="main-content">
        <header className="app-topbar">
          <div>
            <h2>{TAB_TITLES[activeTab] ?? '그로잉영어'}</h2>
            <p>그로잉영어 교습소의 학생 성장을 기록하고 관리합니다.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
              className={`m-tab${activeTab === item.id ? ' active' : ''}`}
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

      {/* AI 비서 아이비 — 모든 화면 오른쪽 하단 플로팅 위젯 (키오스크 모드 제외) */}
      <Assistant onSendToMessaging={handleAssistantDraftToMessaging} />
    </div>
  );
}

export default App;
