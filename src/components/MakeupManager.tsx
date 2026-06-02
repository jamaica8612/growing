import { useMemo, useState } from 'react';
import { CalendarCheck, CheckCircle2, RefreshCw, Search, X } from 'lucide-react';
import type { Attendance, Class, Student } from '../types';
import { getMakeupSummary, hasMakeupForAbsence, type MakeupNeededItem } from '../lib/makeupUtils';

interface MakeupManagerProps {
  students: Student[];
  classes: Class[];
  attendance: Attendance[];
  onSaveAttendance: (attendanceData: Omit<Attendance, 'id'> & { memo?: string }) => void;
}

type Filter = 'all' | 'needed' | 'completed';

export function MakeupManager({ students, classes, attendance, onSaveAttendance }: MakeupManagerProps) {
  const [filter, setFilter] = useState<Filter>('needed');
  const [search, setSearch] = useState('');
  const [processingItem, setProcessingItem] = useState<MakeupNeededItem | null>(null);
  const [makeupDate, setMakeupDate] = useState(new Date().toISOString().split('T')[0]);
  const [makeupClassId, setMakeupClassId] = useState('');

  const summary = useMemo(
    () => getMakeupSummary(students, classes, attendance),
    [students, classes, attendance],
  );

  const normalizedSearch = search.trim().toLowerCase();
  const activeOnly = true;

  const needed = summary.needed.filter(item => {
    const matchesSearch =
      !normalizedSearch ||
      item.student.name.toLowerCase().includes(normalizedSearch) ||
      (item.class?.name ?? '').toLowerCase().includes(normalizedSearch);
    const matchesStatus = !activeOnly || item.student.status === 'active';
    return matchesSearch && matchesStatus;
  });

  const completed = summary.completed.filter(item => {
    const matchesSearch =
      !normalizedSearch ||
      (item.student?.name ?? '').toLowerCase().includes(normalizedSearch) ||
      (item.class?.name ?? '').toLowerCase().includes(normalizedSearch);
    const matchesStatus = !activeOnly || item.student?.status === 'active';
    return matchesSearch && matchesStatus;
  });

  const openProcessModal = (item: MakeupNeededItem) => {
    setProcessingItem(item);
    setMakeupDate(new Date().toISOString().split('T')[0]);
    setMakeupClassId(item.absentRecord.classId || item.class?.id || '');
  };

  const handleProcess = () => {
    if (!processingItem || !makeupDate) return;
    if (hasMakeupForAbsence(attendance, processingItem.student.id, processingItem.absentRecord.date)) {
      alert('이미 이 결석일에 연결된 보강 기록이 있습니다.');
      setProcessingItem(null);
      return;
    }
    onSaveAttendance({
      studentId: processingItem.student.id,
      classId: makeupClassId,
      date: makeupDate,
      status: 'makeup',
      memo: `${processingItem.absentRecord.date} 결석분 보강`,
      homeworkStatus: '',
      makeupForDate: processingItem.absentRecord.date,
    });
    setProcessingItem(null);
  };

  const FILTERS: [Filter, string][] = [
    ['needed', '보강 필요'],
    ['completed', '보강 완료'],
    ['all', '전체'],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      {/* ── 현황 요약 배너 ── */}
      <div className="mk-summary">
        <div>
          <h3>보강 현황</h3>
          <p>결석 기록과 연결된 보강만 관리합니다.</p>
        </div>
        <div className="mk-badges">
          <span className="at-pill danger">필요 {summary.needed.length}건</span>
          <span className="at-pill info">완료 {summary.completed.length}건</span>
        </div>
      </div>

      {/* ── 툴바: 검색 + 상태 세그먼트 ── */}
      <div className="mk-toolbar">
        <div className="pay-search" style={{ flex: 1, minWidth: 180 }}>
          <Search size={15} />
          <input
            placeholder="학생·반 검색…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="gd-seg mk-seg">
          {FILTERS.map(([v, l]) => (
            <button
              key={v}
              type="button"
              className={`gd-seg-b${filter === v ? ' sel ok' : ''}`}
              onClick={() => setFilter(v)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── 보강 필요 카드 그리드 ── */}
      {(filter === 'all' || filter === 'needed') && (
        <section className="gd-card">
          <h2 className="gd-card-title" style={{ marginBottom: '0.9rem' }}>
            <RefreshCw size={18} /> 보강 필요
            <span className="cl-count">{needed.length}</span>
          </h2>
          {needed.length === 0 ? (
            <div className="gd-empty">
              <CheckCircle2 size={26} />
              <span>보강이 필요한 결석 기록이 없어요</span>
            </div>
          ) : (
            <div className="mk-cards">
              {needed.map(item => (
                <div key={item.id} className="mk-card need">
                  <div className="mk-card-head">
                    <div>
                      <b>{item.student.name}</b>
                      <span>{item.class?.name ?? '반 정보 없음'}</span>
                    </div>
                    <span className="at-pill danger">보강 필요</span>
                  </div>
                  <div className="mk-grid">
                    <div>
                      <span>원래 결석일</span>
                      <b>{item.absentRecord.date}</b>
                    </div>
                    <div>
                      <span>메모</span>
                      <b>{item.absentRecord.memo || '—'}</b>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="pay-btn primary sm mk-btn"
                    onClick={() => openProcessModal(item)}
                  >
                    <CalendarCheck size={14} /> 보강 처리
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── 보강 완료 카드 그리드 ── */}
      {(filter === 'all' || filter === 'completed') && (
        <section className="gd-card">
          <h2 className="gd-card-title" style={{ marginBottom: '0.9rem' }}>
            <CheckCircle2 size={18} /> 보강 완료
            <span className="cl-count">{completed.length}</span>
          </h2>
          {completed.length === 0 ? (
            <div className="gd-empty">
              <CalendarCheck size={24} />
              <span>완료된 보강 기록이 없어요</span>
            </div>
          ) : (
            <div className="mk-cards">
              {completed.map(item => (
                <div key={item.id} className="mk-card done">
                  <div className="mk-card-head">
                    <div>
                      <b>{item.student?.name ?? '알 수 없는 학생'}</b>
                      <span>{item.class?.name ?? '반 정보 없음'}</span>
                    </div>
                    <span className="at-pill info">완료</span>
                  </div>
                  <div className="mk-grid">
                    <div>
                      <span>보강일</span>
                      <b>{item.makeupRecord.date}</b>
                    </div>
                    <div>
                      <span>원래 결석일</span>
                      <b>{item.makeupRecord.makeupForDate}</b>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── 보강 처리 모달 ── */}
      {processingItem && (
        <div className="mk-modal-bg" onClick={() => setProcessingItem(null)}>
          <div className="mk-modal" onClick={e => e.stopPropagation()}>
            <div className="mk-modal-head">
              <h3>보강 처리</h3>
              <button type="button" onClick={() => setProcessingItem(null)} aria-label="닫기">
                <X size={18} />
              </button>
            </div>

            <div className="mk-modal-info">
              <CheckCircle2 size={18} />
              <p>
                <b>{processingItem.student.name}</b> 학생의{' '}
                <b>{processingItem.absentRecord.date}</b> 결석분을 보강 기록으로 연결합니다.
              </p>
            </div>

            <label className="msg-label">보강 날짜</label>
            <input
              type="date"
              className="msg-select"
              value={makeupDate}
              onChange={e => setMakeupDate(e.target.value)}
            />

            <label className="msg-label">보강 반</label>
            <select
              className="msg-select"
              value={makeupClassId}
              onChange={e => setMakeupClassId(e.target.value)}
            >
              {classes
                .filter(
                  cls =>
                    cls.studentIds.includes(processingItem.student.id) ||
                    cls.id === processingItem.absentRecord.classId,
                )
                .map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
            </select>

            <div className="mk-modal-btns">
              <button type="button" className="pay-btn ghost" onClick={() => setProcessingItem(null)}>
                취소
              </button>
              <button type="button" className="pay-btn primary" onClick={handleProcess}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
