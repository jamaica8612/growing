import { useState, useEffect } from 'react';
import type { Student, Class, Attendance, Payment, CounselLog, PaymentMethod } from './types';
import {
  initialStudents,
  initialClasses,
  initialAttendance,
  initialPayments,
  initialCounselLogs,
} from './utils/mockData';

// Import Tab Components
import { Dashboard } from './components/Dashboard';
import { Students } from './components/Students';
import { Classes } from './components/Classes';
import { AttendanceManager } from './components/Attendance';
import { Payments } from './components/Payments';
import { CounselLogs } from './components/CounselLogs';
import { Backup } from './components/Backup';

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
} from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Core States
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [counselLogs, setCounselLogs] = useState<CounselLog[]>([]);

  // 1. Initial Data Loading from LocalStorage or MockData
  useEffect(() => {
    const storedStudents = localStorage.getItem('growing_students');
    const storedClasses = localStorage.getItem('growing_classes');
    const storedAttendance = localStorage.getItem('growing_attendance');
    const storedPayments = localStorage.getItem('growing_payments');
    const storedLogs = localStorage.getItem('growing_logs');

    if (storedStudents && storedClasses) {
      setStudents(JSON.parse(storedStudents));
      setClasses(JSON.parse(storedClasses));
      setAttendance(storedAttendance ? JSON.parse(storedAttendance) : []);
      setPayments(storedPayments ? JSON.parse(storedPayments) : []);
      setCounselLogs(storedLogs ? JSON.parse(storedLogs) : []);
    } else {
      // First time load: pre-fill with Mock Data
      setStudents(initialStudents);
      setClasses(initialClasses);
      setAttendance(initialAttendance);
      setPayments(initialPayments);
      setCounselLogs(initialCounselLogs);

      // Save to localStorage immediately
      localStorage.setItem('growing_students', JSON.stringify(initialStudents));
      localStorage.setItem('growing_classes', JSON.stringify(initialClasses));
      localStorage.setItem('growing_attendance', JSON.stringify(initialAttendance));
      localStorage.setItem('growing_payments', JSON.stringify(initialPayments));
      localStorage.setItem('growing_logs', JSON.stringify(initialCounselLogs));
    }
  }, []);

  // 2. LocalStorage Persistence Sync
  const saveToLocal = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  // --- Student Operations ---
  const handleAddStudent = (studentData: Omit<Student, 'id'>) => {
    const newStudent: Student = {
      ...studentData,
      id: `std_${Date.now()}`,
    };
    const updated = [...students, newStudent];
    setStudents(updated);
    saveToLocal('growing_students', updated);
  };

  const handleUpdateStudent = (updatedStudent: Student) => {
    const updated = students.map(s => (s.id === updatedStudent.id ? updatedStudent : s));
    setStudents(updated);
    saveToLocal('growing_students', updated);
  };

  const handleDeleteStudent = (id: string) => {
    const updatedStudents = students.filter(s => s.id !== id);
    setStudents(updatedStudents);
    saveToLocal('growing_students', updatedStudents);

    // Clean up student from classes
    const updatedClasses = classes.map(c => ({
      ...c,
      studentIds: c.studentIds.filter(sid => sid !== id),
    }));
    setClasses(updatedClasses);
    saveToLocal('growing_classes', updatedClasses);
    
    // Clean up attendance, payments, logs
    const updatedAttendance = attendance.filter(a => a.studentId !== id);
    setAttendance(updatedAttendance);
    saveToLocal('growing_attendance', updatedAttendance);

    const updatedPayments = payments.filter(p => p.studentId !== id);
    setPayments(updatedPayments);
    saveToLocal('growing_payments', updatedPayments);

    const updatedLogs = counselLogs.filter(l => l.studentId !== id);
    setCounselLogs(updatedLogs);
    saveToLocal('growing_logs', updatedLogs);
  };

  // --- Class Operations ---
  const handleAddClass = (classData: Omit<Class, 'id'>) => {
    const newClass: Class = {
      ...classData,
      id: `cls_${Date.now()}`,
    };
    const updated = [...classes, newClass];
    setClasses(updated);
    saveToLocal('growing_classes', updated);
  };

  const handleUpdateClass = (updatedClass: Class) => {
    const updated = classes.map(c => (c.id === updatedClass.id ? updatedClass : c));
    setClasses(updated);
    saveToLocal('growing_classes', updated);
  };

  const handleDeleteClass = (id: string) => {
    const updated = classes.filter(c => c.id !== id);
    setClasses(updated);
    saveToLocal('growing_classes', updated);

    // Remove attendance references for this class
    const updatedAttendance = attendance.filter(a => a.classId !== id);
    setAttendance(updatedAttendance);
    saveToLocal('growing_attendance', updatedAttendance);
  };

  // --- Attendance Operations ---
  const handleSaveAttendance = (attendanceData: Omit<Attendance, 'id'> & { memo?: string }) => {
    const existingIndex = attendance.findIndex(
      a =>
        a.studentId === attendanceData.studentId &&
        a.classId === attendanceData.classId &&
        a.date === attendanceData.date
    );

    let updated: Attendance[];
    if (existingIndex > -1) {
      updated = [...attendance];
      updated[existingIndex] = {
        ...updated[existingIndex],
        status: attendanceData.status,
        memo: attendanceData.memo !== undefined ? attendanceData.memo : updated[existingIndex].memo,
      };
    } else {
      const newAttendance: Attendance = {
        ...attendanceData,
        id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        memo: attendanceData.memo || '',
      };
      updated = [...attendance, newAttendance];
    }

    setAttendance(updated);
    saveToLocal('growing_attendance', updated);
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
      const billExists = payments.some(
        p => p.studentId === student.id && p.billingMonth === month
      );

      if (!billExists && totalTuition > 0) {
        newPayments.push({
          id: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
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

    const updated = [...payments, ...newPayments];
    setPayments(updated);
    saveToLocal('growing_payments', updated);
    alert(`성공적으로 ${newPayments.length}건의 청구서를 일괄 발행하였습니다!`);
  };

  const handleRecordPayment = (paymentId: string, paymentDate: string, method: PaymentMethod) => {
    const updated = payments.map(p =>
      p.id === paymentId ? { ...p, status: 'paid' as const, paymentDate, paymentMethod: method } : p
    );
    setPayments(updated);
    saveToLocal('growing_payments', updated);
  };

  const handleCancelPayment = (paymentId: string) => {
    const updated = payments.map(p =>
      p.id === paymentId
        ? { ...p, status: 'unpaid' as const, paymentDate: undefined, paymentMethod: undefined }
        : p
    );
    setPayments(updated);
    saveToLocal('growing_payments', updated);
  };

  const handleDeletePayment = (paymentId: string) => {
    const updated = payments.filter(p => p.id !== paymentId);
    setPayments(updated);
    saveToLocal('growing_payments', updated);
  };

  const handleAddManualPayment = (paymentData: Omit<Payment, 'id'>) => {
    const newPayment: Payment = {
      ...paymentData,
      id: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    };
    const updated = [...payments, newPayment];
    setPayments(updated);
    saveToLocal('growing_payments', updated);
  };

  // --- Counsel Log Operations ---
  const handleAddCounselLog = (logData: Omit<CounselLog, 'id'>) => {
    const newLog: CounselLog = {
      ...logData,
      id: `log_${Date.now()}`,
    };
    const updated = [...counselLogs, newLog];
    setCounselLogs(updated);
    saveToLocal('growing_logs', updated);
  };

  const handleDeleteCounselLog = (id: string) => {
    const updated = counselLogs.filter(l => l.id !== id);
    setCounselLogs(updated);
    saveToLocal('growing_logs', updated);
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

    saveToLocal('growing_students', data.students);
    saveToLocal('growing_classes', data.classes);
    saveToLocal('growing_attendance', data.attendance);
    saveToLocal('growing_payments', data.payments);
    saveToLocal('growing_logs', data.counselLogs);
  };

  const handleResetData = () => {
    setStudents(initialStudents);
    setClasses(initialClasses);
    setAttendance(initialAttendance);
    setPayments(initialPayments);
    setCounselLogs(initialCounselLogs);

    saveToLocal('growing_students', initialStudents);
    saveToLocal('growing_classes', initialClasses);
    saveToLocal('growing_attendance', initialAttendance);
    saveToLocal('growing_payments', initialPayments);
    saveToLocal('growing_logs', initialCounselLogs);
  };

  const getAllData = () => {
    return {
      students,
      classes,
      attendance,
      payments,
      counselLogs,
    };
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
      case 'backup':
        return (
          <Backup
            onImportData={handleImportData}
            onResetData={handleResetData}
            getAllData={getAllData}
          />
        );
      default:
        return <div>페이지를 찾을 수 없습니다.</div>;
    }
  };

  // Get human readable tab title
  const getTabTitle = () => {
    switch (activeTab) {
      case 'dashboard': return '학원 운영 대시보드';
      case 'students': return '재원생 주소록 및 관리';
      case 'classes': return '학급 개설 및 시간표';
      case 'attendance': return '출석 및 보강 관리';
      case 'payments': return '교육비 수납 장부';
      case 'counsel': return '상담 및 학습/성적 일지';
      case 'backup': return '데이터 백업 및 복원';
      default: return '그로잉영어';
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon">
            <Sprout size={24} />
          </div>
          <div>
            <h1 className="logo-text">그로잉영어</h1>
            <span className="logo-sub">Growing English</span>
          </div>
        </div>

        <nav style={{ flexGrow: 1 }}>
          <ul className="nav-menu">
            <li>
              <button
                className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', font: 'inherit' }}
                onClick={() => setActiveTab('dashboard')}
              >
                <LayoutDashboard size={18} /> 대시보드
              </button>
            </li>
            <li>
              <button
                className={`nav-item ${activeTab === 'students' ? 'active' : ''}`}
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', font: 'inherit' }}
                onClick={() => setActiveTab('students')}
              >
                <Users size={18} /> 학생 관리
              </button>
            </li>
            <li>
              <button
                className={`nav-item ${activeTab === 'classes' ? 'active' : ''}`}
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', font: 'inherit' }}
                onClick={() => setActiveTab('classes')}
              >
                <BookOpen size={18} /> 반/시간표 관리
              </button>
            </li>
            <li>
              <button
                className={`nav-item ${activeTab === 'attendance' ? 'active' : ''}`}
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', font: 'inherit' }}
                onClick={() => setActiveTab('attendance')}
              >
                <CalendarCheck size={18} /> 출결 관리
              </button>
            </li>
            <li>
              <button
                className={`nav-item ${activeTab === 'payments' ? 'active' : ''}`}
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', font: 'inherit' }}
                onClick={() => setActiveTab('payments')}
              >
                <CreditCard size={18} /> 수납 관리
              </button>
            </li>
            <li>
              <button
                className={`nav-item ${activeTab === 'counsel' ? 'active' : ''}`}
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', font: 'inherit' }}
                onClick={() => setActiveTab('counsel')}
              >
                <MessageSquare size={18} /> 상담/진도 일지
              </button>
            </li>
          </ul>
        </nav>

        <div className="sidebar-footer">
          <button
            className={`nav-item ${activeTab === 'backup' ? 'active' : ''}`}
            style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', font: 'inherit' }}
            onClick={() => setActiveTab('backup')}
          >
            <ShieldCheck size={18} /> 안전 백업 설정
          </button>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="main-content">
        <header className="header">
          <div>
            <h2 className="page-title">{getTabTitle()}</h2>
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
