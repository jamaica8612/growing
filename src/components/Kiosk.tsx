import React, { useState } from 'react';
import type { Student, Class } from '../types';
import { Sprout, Home, Lock, Search, CheckCircle, Volume2 } from 'lucide-react';

interface KioskProps {
  students: Student[];
  classes: Class[];
  kioskPin: string;
  onSaveAttendance: (attendanceData: { studentId: string; classId: string; date: string; status: 'present'; checkInTime?: string; checkOutTime?: string }) => void;
  onQueueAlert: (studentId: string, kind: 'in' | 'out', date: string, time: string) => void;
  onExitKiosk: () => void;
}

export const Kiosk: React.FC<KioskProps> = ({ students, classes, kioskPin, onSaveAttendance, onQueueAlert, onExitKiosk }) => {
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
      const AudioContext =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
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
    // Default to first class if enrolled in multiple; empty => no class (null in DB)
    const classId = studentClasses[0]?.id || '';

    // 등원/하원 시각을 정식 필드에 기록 (반대쪽 값은 useAcademyData가 유지)
    onSaveAttendance({
      studentId: selectedStudent.id,
      classId,
      date: todayDateStr,
      status: 'present',
      ...(type === 'in' ? { checkInTime: currentTimeStr } : { checkOutTime: currentTimeStr }),
    });

    // Queue a parent check-in/out notification for later sending.
    onQueueAlert(selectedStudent.id, type, todayDateStr, currentTimeStr);

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
    if (passcode === kioskPin) {
      onExitKiosk();
    } else {
      alert('비밀번호가 올바르지 않습니다.');
      setPasscode('');
    }
  };

  return (
    <div className="kk-root" style={{ zIndex: 9999 }}>
      {/* ── 헤더 ── */}
      <header className="kk-head">
        <div className="kk-logo">
          <div className="kk-logo-ic"><Sprout size={20} /></div>
          <span className="kk-logo-tx">그로잉영어 자율출결단말기</span>
        </div>
        <div className="kk-head-btns">
          <button className="kk-spk" onClick={() => playSynthesizedChime('in')}><Volume2 size={14} /> 스피커 테스트</button>
          <button className="kk-lock" onClick={() => setShowExitModal(true)} title="관리자 화면"><Lock size={18} /></button>
        </div>
      </header>

      {/* ── 본문 ── */}
      <div className="kk-body">
        <div className="kk-search">
          <Search size={20} />
          <input placeholder="이름을 입력하여 내 이름 찾기…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="kk-grid">
          {filteredStudents.length === 0 ? (
            <div className="kk-empty">🔍 검색 결과가 없습니다. 이름을 정확히 확인해 주세요.</div>
          ) : (
            filteredStudents.map(student => (
              <button key={student.id} className="kk-card" onClick={() => setSelectedStudent(student)}>
                <span className="kk-card-name">{student.name}</span>
                <span className="kk-card-sub">{student.school || '교습소'} {student.grade.split(' ')[1] || student.grade}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── 푸터 ── */}
      <footer className="kk-foot">🌱 그로잉영어 등원/하원 시 이름을 탭한 후 체크해 주세요.</footer>

      {/* ── 등원/하원 확인 모달 ── */}
      {selectedStudent && (
        <div className="kk-modal-bg">
          <div className="kk-modal">
            <div className="kk-modal-meta">{selectedStudent.school} | {selectedStudent.grade}</div>
            <div className="kk-modal-name">{selectedStudent.name} 학생</div>
            <div className="kk-modal-btns">
              <button className="kk-btn in" onClick={() => handleCheckAction('in')}>
                <Sprout size={32} /> 등원 완료 🌱
              </button>
              <button className="kk-btn out" onClick={() => handleCheckAction('out')}>
                <Home size={32} /> 하원 완료 🏡
              </button>
            </div>
            <button className="kk-cancel" onClick={() => setSelectedStudent(null)}>선택 취소 (닫기)</button>
          </div>
        </div>
      )}

      {/* ── PIN 입력 모달 ── */}
      {showExitModal && (
        <div className="kk-modal-bg" style={{ zIndex: 10001 }}>
          <div className="kk-modal">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: '#fff' }}>관리자 모드 비밀번호 입력</h3>
            <form onSubmit={handleExitSubmit}>
              <input
                type="password"
                value={passcode}
                onChange={e => setPasscode(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', fontSize: '1.5rem', textAlign: 'center', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', backgroundColor: 'rgba(0,0,0,0.2)', color: '#fff', outline: 'none', letterSpacing: '0.5em', marginBottom: '1rem' }}
                placeholder="••••" autoFocus required
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <button type="button" className="kk-cancel" onClick={() => { setShowExitModal(false); setPasscode(''); }}>취소</button>
                <button type="submit" className="kk-btn in" style={{ padding: '0.65rem', fontSize: '0.95rem', flexDirection: 'row', gap: '0.4rem' }}>대시보드 복귀</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 성공 오버레이 ── */}
      {successState && (
        <div className={`kk-success ${successState.type}`} style={{ zIndex: 100000 }}>
          <CheckCircle size={80} />
          <div className="kk-success-name">{successState.name}</div>
          <div className="kk-success-msg">
            {successState.type === 'in' ? '등원 처리가 완료되었습니다! 🌱' : '하원 처리가 완료되었습니다! 🏡'}
          </div>
        </div>
      )}
    </div>
  );
};
