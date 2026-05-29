import React, { useState } from 'react';
import type { Student, Class } from '../types';
import { Sprout, Home, Lock, Search, CheckCircle, Volume2 } from 'lucide-react';

interface KioskProps {
  students: Student[];
  classes: Class[];
  onSaveAttendance: (attendanceData: { studentId: string; classId: string; date: string; status: 'present'; memo: string }) => void;
  onExitKiosk: () => void;
}

export const Kiosk: React.FC<KioskProps> = ({ students, classes, onSaveAttendance, onExitKiosk }) => {
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [successState, setSuccessState] = useState<{ active: boolean; type: 'in' | 'out'; name: string } | null>(null);

  const activeStudents = students
    .filter(s => s.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  const filteredStudents = activeStudents.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.school.toLowerCase().includes(search.toLowerCase())
  );

  // Web Audio API Chime sound generator (Fully self-contained, works offline!)
  const playSynthesizedChime = (type: 'in' | 'out') => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const now = ctx.currentTime;

      // Xylophone-like chime (C5 -> E5 for check-in, E5 -> C5 for check-out)
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        
        // Add a slight frequency modulator for a bell-like vibe
        const mod = ctx.createOscillator();
        const modGain = ctx.createGain();
        mod.frequency.value = 12;
        modGain.gain.value = 5;
        mod.connect(modGain);
        modGain.connect(osc.frequency);
        
        gainNode.gain.setValueAtTime(0.4, start);
        gainNode.gain.exponentialRampToValueAtTime(0.001, start + duration);
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        mod.start(start);
        osc.start(start);
        
        mod.stop(start + duration);
        osc.stop(start + duration);
      };

      if (type === 'in') {
        // Ding Dong (C5: 523.25Hz -> E5: 659.25Hz)
        playTone(523.25, now, 0.4);
        playTone(659.25, now + 0.15, 0.5);
      } else {
        // Dong Ding (E5: 659.25Hz -> C5: 523.25Hz)
        playTone(659.25, now, 0.4);
        playTone(523.25, now + 0.15, 0.5);
      }
    } catch (e) {
      console.error('Audio synthesis failed:', e);
    }
  };

  // Handle student check-in/out selection
  const handleCheckAction = (type: 'in' | 'out') => {
    if (!selectedStudent) return;

    const todayDateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTimeStr = new Date().toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    // Find class of student for today
    const studentClasses = classes.filter(c => c.studentIds.includes(selectedStudent.id));
    // Default to first class if enrolled in multiple, or placeholder class
    const classId = studentClasses[0]?.id || 'cls_none';

    const actionText = type === 'in' ? '등원' : '하원';
    const memoText = `${actionText}: ${currentTimeStr}`;

    onSaveAttendance({
      studentId: selectedStudent.id,
      classId,
      date: todayDateStr,
      status: 'present',
      memo: memoText,
    });

    // Play chime sound
    playSynthesizedChime(type);

    // Show success overlay
    setSuccessState({
      active: true,
      type,
      name: selectedStudent.name,
    });

    // Reset student selection
    setSelectedStudent(null);

    // Auto close success overlay after 2.5 seconds
    setTimeout(() => {
      setSuccessState(null);
    }, 2500);
  };

  // Exit Kiosk Mode configuration
  const handleExitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === '1234') {
      onExitKiosk();
    } else {
      alert('비밀번호가 올바르지 않습니다. (기본: 1234)');
      setPasscode('');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#0a2318',
        color: '#ffffff',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Top bar */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.25rem 2rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#0c2e20',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ backgroundColor: 'var(--color-accent-mint)', padding: '0.45rem', borderRadius: '8px', color: '#0c2e20' }}>
            <Sprout size={22} />
          </div>
          <div>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(to right, #ffffff, #a3e2c9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              그로잉영어 자율출결단말기
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => playSynthesizedChime('in')}
            style={{
              background: 'none',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#a3b8b0',
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <Volume2 size={14} /> 스피커 테스트
          </button>
          <button
            onClick={() => setShowExitModal(true)}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              color: '#ffffff',
              padding: '0.5rem',
              borderRadius: '50%',
              cursor: 'pointer',
            }}
            title="관리자 화면으로 돌아가기"
          >
            <Lock size={18} />
          </button>
        </div>
      </header>

      {/* Main Student Directory Screen */}
      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', padding: '2rem', overflow: 'hidden' }}>
        {/* Search filter */}
        <div
          style={{
            position: 'relative',
            maxWidth: '500px',
            width: '100%',
            margin: '0 auto 2rem auto',
          }}
        >
          <Search size={22} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255, 255, 255, 0.4)' }} />
          <input
            type="text"
            style={{
              width: '100%',
              padding: '0.85rem 1rem 0.85rem 3rem',
              fontSize: '1.2rem',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              color: '#ffffff',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            placeholder="이름을 입력하여 내 이름 찾기..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Alphabet grid / list */}
        <div
          style={{
            flexGrow: 1,
            overflowY: 'auto',
            paddingRight: '0.5rem',
          }}
        >
          {filteredStudents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '5rem', color: 'rgba(255, 255, 255, 0.4)', fontSize: '1.1rem' }}>
              🔍 검색 결과가 없습니다. 이름을 정확히 확인해 주세요.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '1.25rem',
                maxWidth: '1200px',
                margin: '0 auto',
              }}
            >
              {filteredStudents.map(student => (
                <button
                  key={student.id}
                  onClick={() => setSelectedStudent(student)}
                  style={{
                    backgroundColor: '#0f3223',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: '16px',
                    padding: '1.5rem 1rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    color: '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  }}
                  onMouseDown={e => {
                    e.currentTarget.style.transform = 'scale(0.96)';
                    e.currentTarget.style.backgroundColor = '#13442f';
                  }}
                  onMouseUp={e => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.backgroundColor = '#0f3223';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.backgroundColor = '#0f3223';
                  }}
                >
                  <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffffff' }}>
                    {student.name}
                  </span>
                  <span style={{ fontSize: '0.85rem', color: '#a3b8b0' }}>
                    {student.school || '교습소'} {student.grade.split(' ')[1] || student.grade}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer warning */}
      <footer
        style={{
          padding: '1rem',
          textAlign: 'center',
          backgroundColor: '#081c13',
          fontSize: '0.85rem',
          color: '#849b90',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        🌱 그로잉영어 등교/하교 시 이름을 탭한 후 체크해 주세요. 
      </footer>

      {/* Pop-up modal: Check-in / check-out action */}
      {selectedStudent && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(5, 15, 11, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
        >
          <div
            style={{
              backgroundColor: '#0c2a1d',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '24px',
              padding: '2.5rem',
              maxWidth: '500px',
              width: '90%',
              textAlign: 'center',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            <span style={{ fontSize: '1.1rem', color: 'var(--color-accent-mint)', fontWeight: 700 }}>
              {selectedStudent.school} | {selectedStudent.grade}
            </span>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, margin: '0.5rem 0 2rem 0', color: '#ffffff' }}>
              {selectedStudent.name} 학생
            </h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '2rem' }}>
              <button
                onClick={() => handleCheckAction('in')}
                style={{
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '16px',
                  padding: '2rem 1rem',
                  fontSize: '1.4rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.75rem',
                  boxShadow: '0 6px 15px rgba(16, 185, 129, 0.3)',
                }}
              >
                <Sprout size={36} />
                등원 완료 🌱
              </button>
              <button
                onClick={() => handleCheckAction('out')}
                style={{
                  backgroundColor: '#f59e0b',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '16px',
                  padding: '2rem 1rem',
                  fontSize: '1.4rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.75rem',
                  boxShadow: '0 6px 15px rgba(245, 158, 11, 0.3)',
                }}
              >
                <Home size={36} />
                하원 완료 🏡
              </button>
            </div>

            <button
              onClick={() => setSelectedStudent(null)}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: 'rgba(255, 255, 255, 0.6)',
                padding: '0.65rem 2rem',
                borderRadius: '10px',
                fontSize: '1rem',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              선택 취소 (닫기)
            </button>
          </div>
        </div>
      )}

      {/* Pop-up modal: Admin exit passcode */}
      {showExitModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(5, 15, 11, 0.85)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
          }}
        >
          <div
            style={{
              backgroundColor: '#0c2a1d',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '20px',
              padding: '2rem',
              maxWidth: '380px',
              width: '90%',
            }}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', textAlign: 'center' }}>
              관리자 모드 비밀번호 입력
            </h3>
            <form onSubmit={handleExitSubmit}>
              <div style={{ marginBottom: '1.25rem' }}>
                <input
                  type="password"
                  value={passcode}
                  onChange={e => setPasscode(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    fontSize: '1.5rem',
                    textAlign: 'center',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    backgroundColor: 'rgba(0,0,0,0.2)',
                    color: '#ffffff',
                    outline: 'none',
                    letterSpacing: '0.5em',
                  }}
                  placeholder="••••"
                  autoFocus
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowExitModal(false);
                    setPasscode('');
                  }}
                  style={{
                    padding: '0.55rem',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    backgroundColor: 'transparent',
                    color: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '0.55rem',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: 'var(--color-primary)',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  대시보드 복귀
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success fullscreen overlay screen */}
      {successState && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: successState.type === 'in' ? '#10b981' : '#f59e0b',
            color: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)', textAlign: 'center' }}>
            <CheckCircle size={96} style={{ marginBottom: '1.5rem', color: '#ffffff' }} />
            <h1 style={{ fontSize: '3.5rem', fontWeight: 900, marginBottom: '0.5rem' }}>
              {successState.name}
            </h1>
            <p style={{ fontSize: '2rem', fontWeight: 700, opacity: 0.9 }}>
              {successState.type === 'in' ? '등원 처리가 완료되었습니다! 🌱' : '하원 처리가 완료되었습니다! 🏡'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
