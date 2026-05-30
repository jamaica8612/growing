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

// Import Icons
import {
  LayoutDashboard,
  Users,
  BookOpen,
  CalendarCheck,
  CreditCard,
  MessageSquare,
  ShieldCheck,
  Sprout,
  Menu,
  X,
  Smartphone,
  Monitor,
  BarChart3,
  LogOut,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

// Navigation grouped by usage flow so the most-frequent daily tasks sit at the
// top. Rendered by both the desktop sidebar and the mobile drawer. The 'kiosk'
// item launches full-screen mode via a confirm; 'backup' lives in the footer.
type NavItem = { id: string; label: string; icon: LucideIcon; kind?: 'kiosk' };
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: '오늘 업무',
    items: [
      { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
      { id: 'assistant', label: 'AI 비서', icon: Sparkles },
      { id: 'attendance', label: '출결 관리', icon: CalendarCheck },
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
    ],
  },
];

const NAV_GROUP_TITLE_STYLE: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: 'rgba(255, 255, 255, 0.38)',
  padding: '0.75rem 1rem 0.3rem',
};

const TAB_TITLES: Record<string, string> = {
  dashboard: '학원 운영 대시보드',
  assistant: 'AI 학원 비서',
  students: '재원생 주소록 및 관리',
  classes: '학급 개설 및 시간표',
  attendance: '출석 및 보강 관리',
  stats: '월별 출결 통계 리포트',
  payments: '교육비 수납 장부',
  counsel: '상담 및 학습/성적 일지',
  messaging: '알림장 발송 도우미',
  kiosk: '자율 등하원 키오스크',
  backup: '데이터 백업 및 복원',
};

const NAV_ITEM_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  font: 'inherit',
};

function NavItemButton({
  active,
  icon: Icon,
  label,
  onClick,
  style,
  badge,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  style?: React.CSSProperties;
  badge?: number;
}) {
  return (
    <button
      className={`nav-item ${active ? 'active' : ''}`}
      style={{ ...NAV_ITEM_STYLE, ...style }}
      onClick={onClick}
    >
      <Icon size={18} /> {label}
      {badge ? (
        <span
          style={{
            marginLeft: 'auto',
            backgroundColor: 'var(--color-danger)',
            color: '#fff',
            fontSize: '0.7rem',
            fontWeight: 700,
            minWidth: '18px',
            height: '18px',
            borderRadius: '9px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 5px',
          }}
        >
          {badge}
        </span>
      ) : null}
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
    return <FullScreen><Sprout size={28} className="text-primary" /><div style={{ marginTop: '0.75rem' }}>불러오는 중...</div></FullScreen>;
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
    kioskPin,
  } = data;

  const handleLogout = () => {
    void supabase.auth.signOut();
  };

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
      case 'assistant':
        return <Assistant />;
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
            onDeleteStudent={data.handleDeleteStudent}
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
            onSaveAttendance={data.handleSaveAttendance}
          />
        );
      case 'stats':
        return <AttendanceStats students={students} classes={classes} attendance={attendance} />;
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
          />
        );
      case 'counsel':
        return (
          <CounselLogs
            counselLogs={counselLogs}
            students={students}
            onAddCounselLog={data.handleAddCounselLog}
            onDeleteCounselLog={data.handleDeleteCounselLog}
          />
        );
      case 'messaging':
        return (
          <Messaging
            students={students}
            kioskAlerts={kioskAlerts}
            onDismissAlert={data.handleDismissKioskAlert}
            onClearAlerts={data.handleClearKioskAlerts}
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
          />
        );
      default:
        return <div>페이지를 찾을 수 없습니다.</div>;
    }
  };

  // Renders the navigation list shared by the desktop sidebar and mobile drawer.
  const renderNavSection = (opts: { closeOnNav: boolean; kioskAccent: string }) => {
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
          {NAV_GROUPS.map(group => (
            <div key={group.title} style={{ marginBottom: '0.35rem' }}>
              <div style={NAV_GROUP_TITLE_STYLE}>{group.title}</div>
              <ul className="nav-menu">
                {group.items.map(item => (
                  <li key={item.id}>
                    <NavItemButton
                      active={activeTab === item.id}
                      icon={item.icon}
                      label={item.label}
                      onClick={item.kind === 'kiosk' ? launchKiosk : () => go(item.id)}
                      badge={item.id === 'messaging' ? kioskAlerts.length : undefined}
                      style={item.kind === 'kiosk' ? { color: opts.kioskAccent, fontWeight: 'bold' } : undefined}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <NavItemButton
            active={activeTab === 'backup'}
            icon={ShieldCheck}
            label="안전 백업 설정"
            onClick={() => go('backup')}
          />
        </div>
      </>
    );
  };

  if (loading) {
    return <FullScreen><Sprout size={28} className="text-primary" /><div style={{ marginTop: '0.75rem' }}>데이터를 불러오는 중...</div></FullScreen>;
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
      {/* Sidebar Navigation (Desktop only) */}
      <aside className="sidebar desktop-sidebar">
        <div className="logo-container">
          <div className="logo-icon">
            <Sprout size={24} />
          </div>
          <div>
            <h1 className="logo-text">그로잉영어</h1>
            <span className="logo-sub">Growing English</span>
          </div>
        </div>

        {renderNavSection({ closeOnNav: false, kioskAccent: 'var(--color-primary-dark)' })}
      </aside>

      {/* Mobile Top Header (Mobile only) */}
      <header className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="logo-icon" style={{ padding: '0.35rem', borderRadius: '6px' }}>
            <Sprout size={18} />
          </div>
          <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>그로잉영어</span>
        </div>
        <button className="menu-toggle-btn" onClick={() => setIsMobileMenuOpen(true)}>
          <Menu size={24} />
        </button>
      </header>

      {/* Mobile Menu Drawer Overlay */}
      {isMobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="mobile-menu-drawer" onClick={e => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sprout size={20} className="text-primary" />
                <span style={{ fontWeight: 800, fontSize: '1.2rem', color: '#ffffff' }}>그로잉영어</span>
              </div>
              <button className="btn-icon-only" style={{ color: '#ffffff' }} onClick={() => setIsMobileMenuOpen(false)}>
                <X size={22} />
              </button>
            </div>

            {renderNavSection({ closeOnNav: true, kioskAccent: '#a3e2c9' })}
          </div>
        </div>
      )}

      {/* Main Panel Content */}
      <main className="main-content">
        <header className="header">
          <div>
            <h2 className="page-title">{TAB_TITLES[activeTab] ?? '그로잉영어'}</h2>
            <p className="page-subtitle">그로잉영어 교습소의 학생 성장을 기록하고 관리합니다.</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#eaf6f0', padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-accent-mint-light)' }}>
              <span style={{ width: '8px', height: '8px', backgroundColor: 'var(--color-success)', borderRadius: '50%', display: 'inline-block' }}></span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }} title={session.user.email ?? ''}>
                클라우드 동기화 중
              </span>
            </div>
            <button className="btn btn-secondary" style={{ gap: '0.4rem' }} onClick={handleLogout} title={session.user.email ?? ''}>
              <LogOut size={15} /> 로그아웃
            </button>
          </div>
        </header>

        {/* Dynamic page component */}
        <div style={{ animation: 'fadeIn 0.25s ease-out' }}>
          {renderContent()}
        </div>
      </main>
    </div>
  );
}

export default App;
