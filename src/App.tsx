import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { subscribePushNotifications } from './lib/pushNotifications';
import { createNotificationBus, type CounselNotification, type NotificationBus } from './lib/notificationBus';
import { useAcademyData } from './hooks/useAcademyData';
import { useMakeupReservations } from './hooks/useMakeupReservations';
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
  MOBILE_QUICK_NAV_ITEMS,
  PRIMARY_NAV_GROUPS,
  SCREEN_ACTIONS,
  SETTINGS_NAV_ITEM,
  TAB_DESCRIPTIONS as FLOW_TAB_DESCRIPTIONS,
  TAB_TITLES as FLOW_TAB_TITLES,
  type NavItem as FlowNavItem,
  type TabId,
} from './navigation';

// Import Icons
import {
  Menu,
  Send,
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
  const makeupReservationStore = useMakeupReservations(session.user.id);
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

  // 미처리 상담 요청 수 (카카오 탭 배지)
  const pendingCounselCount = kakaoParentRequests.filter(
    r => r.requestType === 'counsel' && r.status === 'pending'
  ).length;

  // 아이비 상담 알림 버스 — 위젯이 언마운트된 동안 온 알림은 버퍼 후 전달
  const [counselBus] = useState<NotificationBus<CounselNotification>>(() => createNotificationBus<CounselNotification>());
  const studentsRef = useRef(students);
  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  // PWA 푸시 알림 구독 (원장님 로그인 시 한 번)
  useEffect(() => {
    void subscribePushNotifications(session.user.id);
  }, [session.user.id]);

  // Supabase Realtime — 새 상담 요청 감지 → 아이비 알림
  useEffect(() => {
    const channel = supabase
      .channel('counsel-notify')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'growing_parent_requests',
        filter: `owner_id=eq.${session.user.id}`,
      }, (payload) => {
        const rec = payload.new as { request_type: string; message: string; student_id: string };
        if (rec.request_type !== 'counsel') return;
        const student = studentsRef.current.find(s => s.id === rec.student_id);
        counselBus.emit({ studentName: student?.name ?? '학부모', message: rec.message });
        void reload(); // 배지 카운트 즉시 갱신
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session.user.id, reload, counselBus]);

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

  // Render Page Content based on tab Selection
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            students={students}
            classes={classes}
            payments={payments}
            pendingCounselCount={pendingCounselCount}
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
        return <Exams ownerId={session.user.id} classes={classes} students={students} onSendGuideToMessaging={handleAssistantDraftToMessaging} />;
      case 'attendance':
        return (
          <AttendanceManager
            attendance={attendance}
            students={students}
            classes={classes}
            makeupReservations={makeupReservationStore.reservations}
            onSaveMakeupReservation={makeupReservationStore.saveReservation}
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
            makeupReservations={makeupReservationStore.reservations}
            onSaveMakeupReservation={makeupReservationStore.saveReservation}
            onUpdateMakeupReservation={makeupReservationStore.updateReservation}
            onDeleteMakeupReservation={makeupReservationStore.deleteReservation}
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
            attendance={attendance}
            payments={payments}
            classes={classes}
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
            makeupReservations={makeupReservationStore.reservations}
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
            onDeleteRequest={data.handleDeleteKakaoRequest}
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
                  active={activeTab === item.id}
                  icon={item.icon}
                  label={item.label}
                  onClick={item.kind === 'kiosk' ? launchKiosk : () => go(item.id)}
                  badge={
                    item.id === 'messaging' ? kioskAlerts.length + homeworkAlerts.length || undefined
                    : item.id === 'kakao' ? pendingCounselCount || undefined
                    : undefined
                  }
                  kioskStyle={item.kind === 'kiosk'}
                />
              ))}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <NavItemButton
            active={activeTab === 'backup'}
            icon={SETTINGS_NAV_ITEM.icon}
            label={SETTINGS_NAV_ITEM.label}
            onClick={() => go(SETTINGS_NAV_ITEM.id)}
          />
        </div>
      </>
    );
  };

  // 토픽바 맥락 액션 — 서브탭/바로가기 칩 대신 화면 본문 상단 액션 버튼.
  const renderTopbarActions = () => {
    const actions = SCREEN_ACTIONS[activeTab] ?? [];
    const go = (id: TabId) => {
      sessionStorage.removeItem(KIOSK_RELOAD_RESET_KEY);
      setActiveTab(id);
      setIsMobileMenuOpen(false);
    };
    return (
      <>
        {actions.map(action => (
          <button
            key={`${activeTab}-${action.to}-${action.label}`}
            type="button"
            className={`tb-act${action.primary ? ' primary' : ''}`}
            onClick={action.kind === 'kiosk' ? startKioskMode : () => go(action.to)}
          >
            {action.primary ? <Send size={14} /> : null}
            <span>{action.label}</span>
          </button>
        ))}
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

      {/* ── 모바일 '더보기' 전체 메뉴 시트 ── */}
      {isMobileMenuOpen && (
        <div className="sheet-bg" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-grip" />
            <h3>모든 메뉴</h3>
            {PRIMARY_NAV_GROUPS.map(group => (
              <div key={group.title}>
                <div className="sheet-sec">{group.title}</div>
                <div className="sheet-grid">
                  {group.items.map(item => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`sheet-item${activeTab === item.id ? ' on' : ''}`}
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          if (item.kind === 'kiosk') {
                            startKioskMode();
                          } else {
                            sessionStorage.removeItem(KIOSK_RELOAD_RESET_KEY);
                            setActiveTab(item.id);
                          }
                        }}
                      >
                        <span className="si-ic"><Icon size={18} /></span>
                        <b>{item.label}</b>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="sheet-sec">설정</div>
            <div className="sheet-grid">
              <button
                type="button"
                className={`sheet-item${activeTab === 'backup' ? ' on' : ''}`}
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  sessionStorage.removeItem(KIOSK_RELOAD_RESET_KEY);
                  setActiveTab(SETTINGS_NAV_ITEM.id);
                }}
              >
                <span className="si-ic"><SETTINGS_NAV_ITEM.icon size={18} /></span>
                <b>{SETTINGS_NAV_ITEM.label}</b>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 메인 콘텐츠 ── */}
      <main className="main-content">
        <header className="app-topbar">
          <div>
            <h2>{FLOW_TAB_TITLES[activeTab] ?? '그로잉영어'}</h2>
            <p>{FLOW_TAB_DESCRIPTIONS[activeTab] ?? '그로잉영어 교습소의 학생 성장을 기록하고 관리합니다.'}</p>
          </div>
          <div className="topbar-acts">
            {renderTopbarActions()}
            <button
              className="tb-act"
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

      {/* ── 모바일 하단 탭 (m-tabs) — 4개 핵심 + 더보기 ── */}
      <nav className="mobile-bottom-nav m-tabs" aria-label="빠른 이동">
        {mobileQuickNavItems.map(item => {
          const Icon = item.icon;
          const badge = item.id === 'messaging' ? kioskAlerts.length + homeworkAlerts.length
                      : item.id === 'kakao' ? pendingCounselCount
                      : 0;
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
        <button
          type="button"
          className={`m-tab${isMobileMenuOpen ? ' active' : ''}`}
          onClick={() => setIsMobileMenuOpen(true)}
        >
          <Menu size={20} />
          <span>더보기</span>
        </button>
      </nav>

      {/* AI 비서 아이비 — 평가 관리에서는 전용 AI 편집 UI와 겹치므로 숨긴다. */}
      {activeTab !== 'exams' && (
        <Assistant
          onSendToMessaging={handleAssistantDraftToMessaging}
          counselBus={counselBus}
        />
      )}
    </div>
  );
}

export default App;
