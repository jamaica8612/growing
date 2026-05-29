import type { Student, Class, Attendance, Payment, CounselLog, PaymentMethod, KioskAlert } from './types';
import {
  initialStudents,
  initialClasses,
  initialAttendance,
  initialPayments,
  initialCounselLogs,
} from './utils/mockData';
import { usePersistentState } from './utils/usePersistentState';
import { useState } from 'react';

// Import Tab Components
import { Dashboard } from './components/Dashboard';
import { Students } from './components/Students';
import { Classes } from './components/Classes';
import { AttendanceManager } from './components/Attendance';
import { Payments } from './components/Payments';
import { CounselLogs } from './components/CounselLogs';
import { Backup } from './components/Backup';
import { Kiosk } from './components/Kiosk';
import { Messaging } from './components/Messaging';
import { AttendanceStats } from './components/AttendanceStats';

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
  type LucideIcon,
} from 'lucide-react';

const DEFAULT_KIOSK_PIN = '1234';

// Single source of truth for the primary navigation, rendered by both the
// desktop sidebar and the mobile drawer to avoid duplicated markup.
const NAV_ITEMS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'students', label: '학생 관리', icon: Users },
  { id: 'classes', label: '반/시간표 관리', icon: BookOpen },
  { id: 'attendance', label: '출결 관리', icon: CalendarCheck },
  { id: 'stats', label: '출결 통계', icon: BarChart3 },
  { id: 'payments', label: '수납 관리', icon: CreditCard },
  { id: 'counsel', label: '상담/진도 일지', icon: MessageSquare },
  { id: 'messaging', label: '알림장 발송', icon: Smartphone },
];

const TAB_TITLES: Record<string, string> = {
  dashboard: '학원 운영 대시보드',
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

function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // On a truly fresh install (no students/classes yet) we seed the sample
  // data; an existing install restores exactly what's stored and must not get
  // mock attendance/payments/logs re-injected.
  const freshInstall = !(
    localStorage.getItem('growing_students') && localStorage.getItem('growing_classes')
  );

  // Core States — each one auto-persists to localStorage on change.
  const [kioskPin, setKioskPin] = usePersistentState<string>('growing_kiosk_pin', DEFAULT_KIOSK_PIN);
  const [students, setStudents] = usePersistentState<Student[]>('growing_students', initialStudents);
  const [classes, setClasses] = usePersistentState<Class[]>('growing_classes', initialClasses);
  const [attendance, setAttendance] = usePersistentState<Attendance[]>(
    'growing_attendance',
    freshInstall ? initialAttendance : []
  );
  const [payments, setPayments] = usePersistentState<Payment[]>(
    'growing_payments',
    freshInstall ? initialPayments : []
  );
  const [counselLogs, setCounselLogs] = usePersistentState<CounselLog[]>(
    'growing_logs',
    freshInstall ? initialCounselLogs : []
  );
  // Kiosk check-in/out events awaiting a parent notification (queue only).
  const [kioskAlerts, setKioskAlerts] = usePersistentState<KioskAlert[]>('growing_kiosk_alerts', []);

  // --- Student Operations ---
  const handleAddStudent = (studentData: Omit<Student, 'id'>) => {
    const newStudent: Student = { ...studentData, id: `std_${Date.now()}` };
    setStudents(prev => [...prev, newStudent]);
  };

  const handleUpdateStudent = (updatedStudent: Student) => {
    setStudents(prev => prev.map(s => (s.id === updatedStudent.id ? updatedStudent : s)));
  };

  const handleDeleteStudent = (id: string) => {
    setStudents(prev => prev.filter(s => s.id !== id));

    // Clean up student references across every related collection.
    setClasses(prev => prev.map(c => ({ ...c, studentIds: c.studentIds.filter(sid => sid !== id) })));
    setAttendance(prev => prev.filter(a => a.studentId !== id));
    setPayments(prev => prev.filter(p => p.studentId !== id));
    setCounselLogs(prev => prev.filter(l => l.studentId !== id));
  };

  // --- Class Operations ---
  const handleAddClass = (classData: Omit<Class, 'id'>) => {
    const newClass: Class = { ...classData, id: `cls_${Date.now()}` };
    setClasses(prev => [...prev, newClass]);
  };

  const handleUpdateClass = (updatedClass: Class) => {
    setClasses(prev => prev.map(c => (c.id === updatedClass.id ? updatedClass : c)));
  };

  const handleDeleteClass = (id: string) => {
    setClasses(prev => prev.filter(c => c.id !== id));
    // Remove attendance references for this class
    setAttendance(prev => prev.filter(a => a.classId !== id));
  };

  // --- Attendance Operations ---
  const handleSaveAttendance = (attendanceData: Omit<Attendance, 'id'> & { memo?: string }) => {
    setAttendance(prev => {
      const existingIndex = prev.findIndex(
        a =>
          a.studentId === attendanceData.studentId &&
          a.classId === attendanceData.classId &&
          a.date === attendanceData.date
      );

      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          status: attendanceData.status,
          memo: attendanceData.memo !== undefined ? attendanceData.memo : updated[existingIndex].memo,
          homeworkStatus:
            attendanceData.homeworkStatus !== undefined
              ? attendanceData.homeworkStatus
              : updated[existingIndex].homeworkStatus,
        };
        return updated;
      }

      const newAttendance: Attendance = {
        ...attendanceData,
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        memo: attendanceData.memo || '',
        homeworkStatus: attendanceData.homeworkStatus || '',
      };
      return [...prev, newAttendance];
    });
  };

  // --- Payment Operations ---
  const handleGenerateMonthlyBills = (month: string) => {
    const newPayments: Payment[] = [];
    const activeStudents = students.filter(s => s.status === 'active');

    activeStudents.forEach(student => {
      // Find classes student attends
      const studentClasses = classes.filter(c => c.studentIds.includes(student.id));
      if (studentClasses.length === 0) return;

      // Sum tuition fee
      const totalTuition = studentClasses.reduce((sum, c) => sum + c.tuitionFee, 0);

      // Check if bill already exists for this student & month
      const billExists = payments.some(p => p.studentId === student.id && p.billingMonth === month);

      if (!billExists && totalTuition > 0) {
        newPayments.push({
          id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          studentId: student.id,
          billingMonth: month,
          amount: totalTuition,
          status: 'unpaid',
        });
      }
    });

    if (newPayments.length === 0) {
      alert('생성할 대상 학생이 없거나 이미 해당 월의 모든 청구서가 등록되어 있습니다.');
      return;
    }

    setPayments(prev => [...prev, ...newPayments]);
    alert(`성공적으로 ${newPayments.length}건의 청구서를 일괄 발행하였습니다!`);
  };

  const handleRecordPayment = (paymentId: string, paymentDate: string, method: PaymentMethod) => {
    setPayments(prev =>
      prev.map(p =>
        p.id === paymentId ? { ...p, status: 'paid' as const, paymentDate, paymentMethod: method } : p
      )
    );
  };

  const handleCancelPayment = (paymentId: string) => {
    setPayments(prev =>
      prev.map(p =>
        p.id === paymentId
          ? { ...p, status: 'unpaid' as const, paymentDate: undefined, paymentMethod: undefined }
          : p
      )
    );
  };

  const handleDeletePayment = (paymentId: string) => {
    setPayments(prev => prev.filter(p => p.id !== paymentId));
  };

  const handleAddManualPayment = (paymentData: Omit<Payment, 'id'>) => {
    const newPayment: Payment = {
      ...paymentData,
      id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };
    setPayments(prev => [...prev, newPayment]);
  };

  // --- Counsel Log Operations ---
  const handleAddCounselLog = (logData: Omit<CounselLog, 'id'>) => {
    const newLog: CounselLog = { ...logData, id: `log_${Date.now()}` };
    setCounselLogs(prev => [...prev, newLog]);
  };

  const handleUpdateCounselLog = (updatedLog: CounselLog) => {
    setCounselLogs(prev => prev.map(l => (l.id === updatedLog.id ? updatedLog : l)));
  };

  const handleDeleteCounselLog = (id: string) => {
    setCounselLogs(prev => prev.filter(l => l.id !== id));
  };

  // --- Backup & Restore Operations ---
  const handleImportData = (data: {
    students: Student[];
    classes: Class[];
    attendance: Attendance[];
    payments: Payment[];
    counselLogs: CounselLog[];
  }) => {
    setStudents(data.students);
    setClasses(data.classes);
    setAttendance(data.attendance);
    setPayments(data.payments);
    setCounselLogs(data.counselLogs);
  };

  const handleResetData = () => {
    setStudents(initialStudents);
    setClasses(initialClasses);
    setAttendance(initialAttendance);
    setPayments(initialPayments);
    setCounselLogs(initialCounselLogs);
  };

  const handleChangeKioskPin = (newPin: string) => {
    setKioskPin(newPin);
  };

  // --- Kiosk Alert Queue ---
  const handleQueueKioskAlert = (studentId: string, kind: 'in' | 'out', date: string, time: string) => {
    const alert: KioskAlert = {
      id: `ka_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      studentId,
      kind,
      date,
      time,
      createdAt: Date.now(),
    };
    setKioskAlerts(prev => [...prev, alert]);
  };

  const handleDismissKioskAlert = (id: string) => {
    setKioskAlerts(prev => prev.filter(a => a.id !== id));
  };

  const handleClearKioskAlerts = () => {
    setKioskAlerts([]);
  };

  const getAllData = () => ({ students, classes, attendance, payments, counselLogs });

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
            onSaveAttendance={handleSaveAttendance}
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
            onAddStudent={handleAddStudent}
            onUpdateStudent={handleUpdateStudent}
            onDeleteStudent={handleDeleteStudent}
            onAddCounselLog={handleAddCounselLog}
            onUpdateCounselLog={handleUpdateCounselLog}
          />
        );
      case 'classes':
        return (
          <Classes
            classes={classes}
            students={students}
            onAddClass={handleAddClass}
            onUpdateClass={handleUpdateClass}
            onDeleteClass={handleDeleteClass}
          />
        );
      case 'attendance':
        return (
          <AttendanceManager
            attendance={attendance}
            students={students}
            classes={classes}
            onSaveAttendance={handleSaveAttendance}
          />
        );
      case 'payments':
        return (
          <Payments
            payments={payments}
            students={students}
            classes={classes}
            onGenerateMonthlyBills={handleGenerateMonthlyBills}
            onRecordPayment={handleRecordPayment}
            onCancelPayment={handleCancelPayment}
            onDeletePayment={handleDeletePayment}
            onAddManualPayment={handleAddManualPayment}
          />
        );
      case 'counsel':
        return (
          <CounselLogs
            counselLogs={counselLogs}
            students={students}
            onAddCounselLog={handleAddCounselLog}
            onDeleteCounselLog={handleDeleteCounselLog}
          />
        );
      case 'stats':
        return <AttendanceStats students={students} classes={classes} attendance={attendance} />;
      case 'messaging':
        return (
          <Messaging
            students={students}
            kioskAlerts={kioskAlerts}
            onDismissAlert={handleDismissKioskAlert}
            onClearAlerts={handleClearKioskAlerts}
          />
        );
      case 'kiosk':
        return (
          <Kiosk
            students={students}
            classes={classes}
            kioskPin={kioskPin}
            onSaveAttendance={handleSaveAttendance}
            onQueueAlert={handleQueueKioskAlert}
            onExitKiosk={() => setActiveTab('dashboard')}
          />
        );
      case 'backup':
        return (
          <Backup
            onImportData={handleImportData}
            onResetData={handleResetData}
            getAllData={getAllData}
            kioskPin={kioskPin}
            onChangeKioskPin={handleChangeKioskPin}
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
          <ul className="nav-menu">
            {NAV_ITEMS.map(item => (
              <li key={item.id}>
                <NavItemButton
                  active={activeTab === item.id}
                  icon={item.icon}
                  label={item.label}
                  onClick={() => go(item.id)}
                  badge={item.id === 'messaging' ? kioskAlerts.length : undefined}
                />
              </li>
            ))}
            <li>
              <NavItemButton
                active={activeTab === 'kiosk'}
                icon={Monitor}
                label="키오스크 모드"
                onClick={launchKiosk}
                style={{ color: opts.kioskAccent, fontWeight: 'bold' }}
              />
            </li>
          </ul>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#eaf6f0', padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-accent-mint-light)' }}>
            <span style={{ width: '8px', height: '8px', backgroundColor: 'var(--color-success)', borderRadius: '50%', display: 'inline-block' }}></span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>로컬 보안 접속 중</span>
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
