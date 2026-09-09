import { useMemo, useState } from 'react';
import { CalendarCheck, CalendarClock, CheckCircle2, Clock, Lightbulb, Plus, RefreshCw, Search, X } from 'lucide-react';
import { localToday } from '../lib/dateUtils';
import type { Attendance, Class, MakeupReservation, Student } from '../types';
import { getMakeupSummary, hasMakeupForAbsence, type MakeupNeededItem } from '../lib/makeupUtils';
import { getMakeupRecommendations } from '../lib/operationInsights';

interface MakeupManagerProps {
  students: Student[];
  classes: Class[];
  attendance: Attendance[];
  makeupReservations: MakeupReservation[];
  onSaveMakeupReservation: (reservation: Omit<MakeupReservation, 'id' | 'createdAt' | 'status' | 'completedAt'> & { id?: string; status?: MakeupReservation['status'] }) => void;
  onUpdateMakeupReservation: (id: string, patch: Partial<MakeupReservation>) => void;
  onDeleteMakeupReservation: (id: string) => void;
  onSaveAttendance: (attendanceData: Omit<Attendance, 'id'> & { memo?: string }) => void;
}

type Filter = 'all' | 'needed' | 'scheduled' | 'completed';
type ManagerMode = 'makeup' | 'supplement';

const SUPPLEMENT_MINUTE_OPTIONS = Array.from({ length: 18 }, (_, index) => (index + 1) * 10);

export function MakeupManager({
  students,
  classes,
  attendance,
  makeupReservations,
  onSaveMakeupReservation,
  onUpdateMakeupReservation,
  onDeleteMakeupReservation,
  onSaveAttendance,
}: MakeupManagerProps) {
  const [mode, setMode] = useState<ManagerMode>('makeup');
  const [filter, setFilter] = useState<Filter>('needed');
  const [search, setSearch] = useState('');
  const [processingItem, setProcessingItem] = useState<MakeupNeededItem | null>(null);
  const [makeupDate, setMakeupDate] = useState(localToday);
  const [makeupClassId, setMakeupClassId] = useState('');
  const [supplementDate, setSupplementDate] = useState(localToday);
  const [supplementStudentId, setSupplementStudentId] = useState('');
  const [supplementClassId, setSupplementClassId] = useState('');
  const [supplementMinutes, setSupplementMinutes] = useState(30);
  const [toast, setToast] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showNewReservation, setShowNewReservation] = useState(false);
  const [newResStudentId, setNewResStudentId] = useState('');
  const [newResClassId, setNewResClassId] = useState('');
  const [newResDate, setNewResDate] = useState(localToday);
  const [newResTime, setNewResTime] = useState('17:00');
  const [newResReason, setNewResReason] = useState<'supplement' | 'other'>('supplement');
  const [newResMemo, setNewResMemo] = useState('');

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2000);
  };

  const summary = useMemo(
    () => getMakeupSummary(students, classes, attendance),
    [students, classes, attendance],
  );

  const normalizedSearch = search.trim().toLowerCase();
  const activeOnly = true;
  const activeStudents = useMemo(() => students.filter(student => student.status === 'active'), [students]);

  const needed = summary.needed.filter(item => {
    const matchesSearch =
      !normalizedSearch ||
      item.student.name.toLowerCase().includes(normalizedSearch) ||
      (item.class?.name ?? '').toLowerCase().includes(normalizedSearch);
    const matchesStatus = !activeOnly || item.student.status === 'active';
    const hasReservation = makeupReservations.some(record =>
      record.studentId === item.student.id &&
      record.sourceAbsenceDate === item.absentRecord.date &&
      record.status !== 'cancelled'
    );
    return matchesSearch && matchesStatus && !hasReservation;
  });

  // 예약 완료 처리로 생성된 출결(makeup) 기록은 예약 카드로 이미 표시되므로
  // 레거시(출결 기반) 목록에서 제외해 중복 표시를 막는다.
  const reservationCoveredAbsences = useMemo(() => new Set(
    makeupReservations
      .filter(record => record.status !== 'cancelled' && record.sourceAbsenceDate)
      .map(record => `${record.studentId}|${record.sourceAbsenceDate}`)
  ), [makeupReservations]);
  const isCoveredByReservation = (record: Attendance) =>
    Boolean(record.makeupForDate) &&
    reservationCoveredAbsences.has(`${record.studentId}|${record.makeupForDate}`);

  const legacyScheduled = summary.scheduled.filter(item => !isCoveredByReservation(item.makeupRecord));
  const legacyCompleted = summary.completed.filter(item => !isCoveredByReservation(item.makeupRecord));

  const scheduled = legacyScheduled.filter(item => {
    const matchesSearch =
      !normalizedSearch ||
      (item.student?.name ?? '').toLowerCase().includes(normalizedSearch) ||
      (item.class?.name ?? '').toLowerCase().includes(normalizedSearch);
    const matchesStatus = !activeOnly || item.student?.status === 'active';
    return matchesSearch && matchesStatus;
  });

  const reservationRows = makeupReservations
    .map(record => ({
      record,
      student: students.find(student => student.id === record.studentId),
      classInfo: classes.find(cls => cls.id === record.classId),
    }))
    .filter(item => {
      const matchesSearch =
        !normalizedSearch ||
        (item.student?.name ?? '').toLowerCase().includes(normalizedSearch) ||
        (item.classInfo?.name ?? '').toLowerCase().includes(normalizedSearch);
      const matchesStatus = !activeOnly || item.student?.status === 'active';
      return matchesSearch && matchesStatus;
    });

  const scheduledReservations = reservationRows
    .filter(item => item.record.status === 'scheduled')
    .sort((a, b) => `${a.record.scheduledDate} ${a.record.scheduledTime}`.localeCompare(`${b.record.scheduledDate} ${b.record.scheduledTime}`));

  const today = localToday();
  const todayReservations = scheduledReservations.filter(item => item.record.scheduledDate === today);

  const completedReservations = reservationRows
    .filter(item => item.record.status === 'completed')
    .sort((a, b) => `${b.record.completedAt ?? b.record.scheduledDate}`.localeCompare(`${a.record.completedAt ?? a.record.scheduledDate}`));

  const completed = legacyCompleted.filter(item => {
    const matchesSearch =
      !normalizedSearch ||
      (item.student?.name ?? '').toLowerCase().includes(normalizedSearch) ||
      (item.class?.name ?? '').toLowerCase().includes(normalizedSearch);
    const matchesStatus = !activeOnly || item.student?.status === 'active';
    return matchesSearch && matchesStatus;
  });

  const supplementRecords = attendance
    .filter(record => record.status === 'supplement')
    .map(record => ({
      record,
      student: students.find(student => student.id === record.studentId),
      classInfo: classes.find(cls => cls.id === record.classId),
    }))
    .filter(item => {
      const matchesSearch =
        !normalizedSearch ||
        (item.student?.name ?? '').toLowerCase().includes(normalizedSearch) ||
        (item.classInfo?.name ?? '').toLowerCase().includes(normalizedSearch);
      const matchesStatus = !activeOnly || item.student?.status === 'active';
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => b.record.date.localeCompare(a.record.date));

  const supplementClassOptions = classes.filter(cls =>
    !supplementStudentId || cls.studentIds.includes(supplementStudentId)
  );

  const handleCreateSupplement = () => {
    if (!supplementStudentId || !supplementClassId || !supplementDate) {
      setFormError('학생, 반, 날짜를 선택해 주세요.');
      return;
    }
    setFormError(null);
    onSaveAttendance({
      studentId: supplementStudentId,
      classId: supplementClassId,
      date: supplementDate,
      status: 'supplement',
      memo: `보충 ${supplementMinutes}분`,
      homeworkStatus: '',
      supplementMinutes,
    });
  };

  const openProcessModal = (item: MakeupNeededItem) => {
    const [firstRecommendation] = getMakeupRecommendations(item.student, item.absentRecord, classes, attendance);
    setProcessingItem(item);
    setMakeupDate(firstRecommendation?.date ?? localToday());
    setMakeupClassId(firstRecommendation?.classId ?? item.absentRecord.classId ?? item.class?.id ?? '');
  };

  const handleProcess = () => {
    if (!processingItem || !makeupDate || !makeupClassId) return;
    if (hasMakeupForAbsence(attendance, processingItem.student.id, makeupClassId, processingItem.absentRecord.date)) {
      showToast('이미 이 결석일에 연결된 보강 기록이 있습니다.');
      setProcessingItem(null);
      return;
    }
    if (makeupReservations.some(record =>
      record.studentId === processingItem.student.id &&
      record.sourceAbsenceDate === processingItem.absentRecord.date &&
      record.status !== 'cancelled'
    )) {
      showToast('이미 이 결석일에 예약된 보강이 있습니다.');
      setProcessingItem(null);
      return;
    }
    const cls = classes.find(item => item.id === makeupClassId);
    onSaveMakeupReservation({
      studentId: processingItem.student.id,
      classId: makeupClassId,
      scheduledDate: makeupDate,
      scheduledTime: cls?.startTime || '17:00',
      sourceAbsenceDate: processingItem.absentRecord.date,
      reason: 'absence',
      memo: `${processingItem.absentRecord.date} 결석분 보강`,
    });
    showToast('보강 예약을 저장했습니다.');
    setProcessingItem(null);
  };

  // 완료 처리: 보강 당일 출결(makeup) 기록을 만들어 출석 통계·알림장에 반영하고,
  // 예약 상태를 완료로 바꾼다.
  const handleCompleteReservation = (record: MakeupReservation) => {
    onSaveAttendance({
      studentId: record.studentId,
      classId: record.classId,
      date: record.scheduledDate,
      status: 'makeup',
      memo: record.memo || (record.sourceAbsenceDate ? `${record.sourceAbsenceDate} 결석분 보강` : '보강'),
      homeworkStatus: '',
      makeupForDate: record.sourceAbsenceDate,
    });
    onUpdateMakeupReservation(record.id, { status: 'completed' });
    showToast('보강 완료로 기록하고 출결에 반영했습니다.');
  };

  const handleCreateNewReservation = () => {
    if (!newResStudentId || !newResClassId || !newResDate) {
      showToast('학생, 반, 날짜를 선택해 주세요.');
      return;
    }
    const cls = classes.find(c => c.id === newResClassId);
    onSaveMakeupReservation({
      studentId: newResStudentId,
      classId: newResClassId,
      scheduledDate: newResDate,
      scheduledTime: newResTime || cls?.startTime || '17:00',
      reason: newResReason,
      memo: newResMemo,
    });
    showToast('보강 예약을 저장했습니다.');
    setShowNewReservation(false);
    setNewResStudentId('');
    setNewResClassId('');
    setNewResMemo('');
    setFilter('scheduled');
  };

  const filterCounts: Record<Filter, number> = useMemo(() => ({
    needed: needed.length,
    scheduled: scheduled.length + scheduledReservations.length,
    completed: completed.length + completedReservations.length,
    all: needed.length + scheduled.length + scheduledReservations.length + completed.length + completedReservations.length,
  }), [needed, scheduled, scheduledReservations, completed, completedReservations]);

  const FILTERS: [Filter, string][] = [
    ['needed', '보강 필요'],
    ['scheduled', '보강 예정'],
    ['completed', '보강 완료'],
    ['all', '전체'],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      {toast && <div className="gd-toast">{toast}</div>}

      <div className="gd-seg" style={{ alignSelf: 'flex-start' }}>
        <button
          type="button"
          className={`gd-seg-b${mode === 'makeup' ? ' sel info' : ''}`}
          onClick={() => setMode('makeup')}
        >
          보강관리
        </button>
        <button
          type="button"
          className={`gd-seg-b${mode === 'supplement' ? ' sel warn' : ''}`}
          onClick={() => setMode('supplement')}
        >
          보충관리
        </button>
      </div>

      {mode === 'supplement' ? (
        <>
          <div className="gx-banner">
            <div className="gx-banner-l">
              <h3>보충 현황</h3>
              <p>정규 출결과 별도로 보충한 분량을 학생별로 기록합니다.</p>
            </div>
            <div className="gx-badges">
              <span className="at-pill warn">보충 {supplementRecords.length}건</span>
              <span className="at-pill info">총 {supplementRecords.reduce((sum, item) => sum + (item.record.supplementMinutes ?? 0), 0)}분</span>
            </div>
          </div>

          <div className="mk-toolbar">
            <div className="pay-search" style={{ flex: 1, minWidth: 180 }}>
              <Search size={15} />
              <input
                placeholder="학생·반 검색"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <section className="gd-card">
            <h2 className="gd-card-title" style={{ marginBottom: '0.9rem' }}>
              <Plus size={18} /> 보충 기록 추가
            </h2>
            <div className="mk-grid" style={{ alignItems: 'end' }}>
              <div>
                <span>날짜</span>
                <input type="date" className="gd-field" value={supplementDate} onChange={e => setSupplementDate(e.target.value)} />
              </div>
              <div>
                <span>학생</span>
                <select
                  className="gd-field"
                  value={supplementStudentId}
                  onChange={e => {
                    const nextStudentId = e.target.value;
                    setSupplementStudentId(nextStudentId);
                    const nextClass = classes.find(cls => cls.studentIds.includes(nextStudentId));
                    setSupplementClassId(nextClass?.id ?? '');
                  }}
                >
                  <option value="">학생 선택</option>
                  {activeStudents.map(student => (
                    <option key={student.id} value={student.id}>{student.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <span>반</span>
                <select className="gd-field" value={supplementClassId} onChange={e => setSupplementClassId(e.target.value)}>
                  <option value="">반 선택</option>
                  {supplementClassOptions.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <span>분량</span>
                <select className="gd-field" value={supplementMinutes} onChange={e => setSupplementMinutes(Number(e.target.value))}>
                  {SUPPLEMENT_MINUTE_OPTIONS.map(minutes => (
                    <option key={minutes} value={minutes}>{minutes}분</option>
                  ))}
                </select>
              </div>
              <button type="button" className="pay-btn primary" onClick={handleCreateSupplement}>
                저장
              </button>
            </div>
            {formError && <p style={{ color: 'var(--g-danger)', fontSize: '0.85rem', marginTop: '0.5rem' }}>{formError}</p>}
          </section>

          <section className="gd-card">
            <h2 className="gd-card-title" style={{ marginBottom: '0.9rem' }}>
              <Clock size={18} /> 보충 기록
              <span className="cl-count">{supplementRecords.length}</span>
            </h2>
            {supplementRecords.length === 0 ? (
              <div className="gd-empty">
                <Clock size={24} />
                <span>보충 기록이 없습니다.</span>
              </div>
            ) : (
              <div className="mk-cards">
                {supplementRecords.map(item => (
                  <div key={item.record.id} className="mk-card done">
                    <div className="mk-card-head">
                      <div>
                        <b>{item.student?.name ?? '알 수 없는 학생'}</b>
                        <span>{item.classInfo?.name ?? '반 정보 없음'}</span>
                      </div>
                      <span className="at-pill warn">{item.record.supplementMinutes ?? 0}분</span>
                    </div>
                    <div className="mk-grid">
                      <div>
                        <span>보충일</span>
                        <b>{item.record.date}</b>
                      </div>
                      <div>
                        <span>메모</span>
                        <b>{item.record.memo || '—'}</b>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          {/* ── 현황 요약 배너 ── */}
          <div className="gx-banner">
            <div className="gx-banner-l">
              <h3>보강 현황</h3>
              <p>결석 기록과 연결된 보강만 관리합니다.</p>
            </div>
            <div className="gx-badges">
              <span className="at-pill danger">필요 {summary.needed.length}건</span>
              <span className="at-pill warn">예정 {legacyScheduled.length + scheduledReservations.length}건</span>
              <span className="at-pill info">완료 {legacyCompleted.length + completedReservations.length}건</span>
            </div>
          </div>

          {/* ── 보강 예약 직접 추가 ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="pay-btn ghost sm" onClick={() => setShowNewReservation(v => !v)}>
              <Plus size={14} /> 보강 예약 추가
            </button>
          </div>
          {showNewReservation && (
            <section className="gd-card">
              <h2 className="gd-card-title" style={{ marginBottom: '0.9rem' }}>
                <Plus size={18} /> 새 보강 예약
              </h2>
              <div className="mk-grid" style={{ alignItems: 'end' }}>
                <div>
                  <span>학생</span>
                  <select className="gd-field" value={newResStudentId} onChange={e => {
                    setNewResStudentId(e.target.value);
                    const cls = classes.find(c => c.studentIds.includes(e.target.value));
                    if (cls) { setNewResClassId(cls.id); setNewResTime(cls.startTime || '17:00'); }
                  }}>
                    <option value="">학생 선택</option>
                    {activeStudents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <span>반</span>
                  <select className="gd-field" value={newResClassId} onChange={e => {
                    setNewResClassId(e.target.value);
                    const cls = classes.find(c => c.id === e.target.value);
                    if (cls) setNewResTime(cls.startTime || '17:00');
                  }}>
                    <option value="">반 선택</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <span>날짜</span>
                  <input type="date" className="gd-field" value={newResDate} onChange={e => setNewResDate(e.target.value)} />
                </div>
                <div>
                  <span>시간</span>
                  <input type="time" className="gd-field" value={newResTime} onChange={e => setNewResTime(e.target.value)} />
                </div>
                <div>
                  <span>사유</span>
                  <select className="gd-field" value={newResReason} onChange={e => setNewResReason(e.target.value as 'supplement' | 'other')}>
                    <option value="supplement">추가 보충</option>
                    <option value="other">기타</option>
                  </select>
                </div>
                <div>
                  <span>메모</span>
                  <input type="text" className="gd-field" placeholder="메모 (선택)" value={newResMemo} onChange={e => setNewResMemo(e.target.value)} />
                </div>
              </div>
              <div className="mk-actions" style={{ marginTop: '0.8rem' }}>
                <button type="button" className="pay-btn primary sm" onClick={handleCreateNewReservation}>
                  <CalendarCheck size={14} /> 예약 저장
                </button>
                <button type="button" className="pay-btn ghost sm" onClick={() => setShowNewReservation(false)}>
                  <X size={14} /> 취소
                </button>
              </div>
            </section>
          )}

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
            <div className="gd-seg">
              {FILTERS.map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  className={`gd-seg-b${filter === v ? ' sel ok' : ''}`}
                  onClick={() => setFilter(v)}
                >
                  {l}{filterCounts[v] > 0 && <span className="cl-count">{filterCounts[v]}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* ── 오늘 예정 보강 ── */}
          {todayReservations.length > 0 && (
            <section className="gd-card" style={{ borderLeft: '3px solid var(--color-accent-mint)' }}>
              <h2 className="gd-card-title" style={{ marginBottom: '0.9rem' }}>
                <Clock size={18} /> 오늘 예정
                <span className="cl-count">{todayReservations.length}</span>
              </h2>
              <div className="mk-cards">
                {todayReservations.map(item => (
                  <div key={item.record.id} className="mk-card">
                    <div className="mk-card-head">
                      <div>
                        <b>{item.student?.name ?? '알 수 없는 학생'}</b>
                        <span>{item.classInfo?.name ?? '반 정보 없음'}</span>
                      </div>
                      <span className="at-pill warn">{item.record.scheduledTime}</span>
                    </div>
                    <div className="mk-grid">
                      <div>
                        <span>사유</span>
                        <b>{item.record.sourceAbsenceDate ? `${item.record.sourceAbsenceDate} 결석분` : item.record.reason === 'supplement' ? '추가 보충' : '기타'}</b>
                      </div>
                      <div>
                        <span>메모</span>
                        <b>{item.record.memo || '—'}</b>
                      </div>
                    </div>
                    <div className="mk-actions">
                      <button type="button" className="pay-btn primary sm" onClick={() => handleCompleteReservation(item.record)}>
                        <CheckCircle2 size={14} /> 완료 처리
                      </button>
                      <button type="button" className="pay-btn ghost sm" onClick={() => onDeleteMakeupReservation(item.record.id)}>
                        <X size={14} /> 취소
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

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
                      {(() => {
                        const recommendations = getMakeupRecommendations(item.student, item.absentRecord, classes, attendance);
                        if (recommendations.length === 0) return null;
                        return (
                          <div className="mk-recs">
                            <span><Lightbulb size={13} /> 추천 보강 후보</span>
                            {recommendations.map(rec => (
                              <button
                                key={rec.id}
                                type="button"
                                onClick={() => {
                                  setProcessingItem(item);
                                  setMakeupDate(rec.date);
                                  setMakeupClassId(rec.classId);
                                }}
                              >
                                {rec.date} {rec.time} · {rec.className}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                      <button
                        type="button"
                        className="pay-btn primary sm"
                        onClick={() => openProcessModal(item)}
                      >
                        <CalendarCheck size={14} /> 보강 예약
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── 보강 예정 카드 그리드 ── */}
          {(filter === 'all' || filter === 'scheduled') && (
            <section className="gd-card">
              <h2 className="gd-card-title" style={{ marginBottom: '0.9rem' }}>
                <CalendarClock size={18} /> 보강 예정
                <span className="cl-count">{scheduled.length + scheduledReservations.length}</span>
              </h2>
              {scheduled.length + scheduledReservations.length === 0 ? (
                <div className="gd-empty">
                  <CalendarClock size={24} />
                  <span>예정된 보강이 없어요</span>
                </div>
              ) : (
                <div className="mk-cards">
                  {scheduledReservations.map(item => (
                    <div key={item.record.id} className="mk-card">
                      <div className="mk-card-head">
                        <div>
                          <b>{item.student?.name ?? '알 수 없는 학생'}</b>
                          <span>{item.classInfo?.name ?? '반 정보 없음'}</span>
                        </div>
                        <span className="at-pill warn">예약</span>
                      </div>
                      <div className="mk-grid">
                        <div>
                          <span>보강일</span>
                          <b>{item.record.scheduledDate} {item.record.scheduledTime}</b>
                        </div>
                        <div>
                          <span>사유</span>
                          <b>{item.record.sourceAbsenceDate ? `${item.record.sourceAbsenceDate} 결석분` : item.record.reason === 'supplement' ? '추가 보충' : '기타'}</b>
                        </div>
                        <div>
                          <span>메모</span>
                          <b>{item.record.memo || '-'}</b>
                        </div>
                      </div>
                      <div className="mk-actions">
                        <button type="button" className="pay-btn primary sm" onClick={() => handleCompleteReservation(item.record)}>
                          <CheckCircle2 size={14} /> 완료 처리
                        </button>
                        <button type="button" className="pay-btn ghost sm" onClick={() => onDeleteMakeupReservation(item.record.id)}>
                          <X size={14} /> 취소
                        </button>
                      </div>
                    </div>
                  ))}
                  {scheduled.map(item => (
                    <div key={item.id} className="mk-card">
                      <div className="mk-card-head">
                        <div>
                          <b>{item.student?.name ?? '알 수 없는 학생'}</b>
                          <span>{item.class?.name ?? '반 정보 없음'}</span>
                        </div>
                        <span className="at-pill warn">예정</span>
                      </div>
                      <div className="mk-grid">
                        <div>
                          <span>보강 예정일</span>
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

          {/* ── 보강 완료 카드 그리드 ── */}
          {(filter === 'all' || filter === 'completed') && (
            <section className="gd-card">
              <h2 className="gd-card-title" style={{ marginBottom: '0.9rem' }}>
                <CheckCircle2 size={18} /> 보강 완료
                <span className="cl-count">{completed.length + completedReservations.length}</span>
              </h2>
              {completed.length + completedReservations.length === 0 ? (
                <div className="gd-empty">
                  <CalendarCheck size={24} />
                  <span>완료된 보강 기록이 없어요</span>
                </div>
              ) : (
                <div className="mk-cards">
                  {completedReservations.map(item => (
                    <div key={item.record.id} className="mk-card done">
                      <div className="mk-card-head">
                        <div>
                          <b>{item.student?.name ?? '알 수 없는 학생'}</b>
                          <span>{item.classInfo?.name ?? '반 정보 없음'}</span>
                        </div>
                        <span className="at-pill info">완료</span>
                      </div>
                      <div className="mk-grid">
                        <div>
                          <span>보강일</span>
                          <b>{item.record.scheduledDate} {item.record.scheduledTime}</b>
                        </div>
                        <div>
                          <span>사유</span>
                          <b>{item.record.sourceAbsenceDate ? `${item.record.sourceAbsenceDate} 결석분` : item.record.reason === 'supplement' ? '추가 보충' : '기타'}</b>
                        </div>
                      </div>
                    </div>
                  ))}
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

          {/* ── 보강 예약 모달 ── */}
          {processingItem && (
            <div className="modal-overlay" onClick={() => setProcessingItem(null)}>
              <div className="modal-content" style={{ maxWidth: 'min(480px, calc(100vw - 1.5rem))' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3 className="modal-title">보강 예약</h3>
                  <button type="button" className="btn-icon-only" onClick={() => setProcessingItem(null)} aria-label="닫기">
                    <X size={18} />
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '1rem 1.25rem 0.5rem' }}>
                  <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                  <p style={{ margin: 0, fontSize: '0.92rem' }}>
                    <b>{processingItem.student.name}</b> 학생의{' '}
                    <b>{processingItem.absentRecord.date}</b> 결석분을 보강 예약으로 연결합니다.
                  </p>
                </div>

                <div style={{ padding: '0.5rem 1.25rem 1rem' }}>
                  {getMakeupRecommendations(processingItem.student, processingItem.absentRecord, classes, attendance).length > 0 && (
                    <div className="mk-recs" style={{ marginBottom: '0.85rem' }}>
                      <span><Lightbulb size={14} /> 추천 후보</span>
                      <div>
                        {getMakeupRecommendations(processingItem.student, processingItem.absentRecord, classes, attendance).map(rec => (
                          <button
                            key={rec.id}
                            type="button"
                            onClick={() => {
                              setMakeupDate(rec.date);
                              setMakeupClassId(rec.classId);
                            }}
                          >
                            {rec.date} {rec.time}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.83rem', marginBottom: '0.3rem' }}>보강 예약일</label>
                      <input
                        type="date"
                        className="gd-field"
                        value={makeupDate}
                        onChange={e => setMakeupDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.83rem', marginBottom: '0.3rem' }}>보강 반</label>
                      <select
                        className="gd-field"
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
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
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
        </>
      )}
    </div>
  );
}
