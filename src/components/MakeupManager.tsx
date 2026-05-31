import { useMemo, useState } from 'react';
import { CalendarCheck, CheckCircle2, Search, X } from 'lucide-react';
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
  const [activeOnly, setActiveOnly] = useState(true);
  const [processingItem, setProcessingItem] = useState<MakeupNeededItem | null>(null);
  const [makeupDate, setMakeupDate] = useState(new Date().toISOString().split('T')[0]);
  const [makeupClassId, setMakeupClassId] = useState('');

  const summary = useMemo(() => getMakeupSummary(students, classes, attendance), [students, classes, attendance]);
  const normalizedSearch = search.trim().toLowerCase();

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

  const renderNeeded = () => (
    <div className="grid-container cols-2" style={{ gap: '1rem' }}>
      {needed.length === 0 ? (
        <div className="mobile-empty-card" style={{ gridColumn: '1 / -1' }}>보강이 필요한 결석 기록이 없습니다.</div>
      ) : (
        needed.map(item => (
          <div key={item.id} className="mobile-data-card" style={{ cursor: 'default' }}>
            <div className="mobile-data-card-header">
              <div>
                <strong>{item.student.name}</strong>
                <span>{item.class?.name ?? '반 정보 없음'}</span>
              </div>
              <span className="badge badge-absent">보강 필요</span>
            </div>
            <div className="mobile-data-grid">
              <div>
                <span>원래 결석일</span>
                <strong>{item.absentRecord.date}</strong>
              </div>
              <div>
                <span>메모</span>
                <strong>{item.absentRecord.memo || '-'}</strong>
              </div>
            </div>
            <div className="mobile-card-actions">
              <button type="button" className="btn btn-primary" onClick={() => openProcessModal(item)}>
                <CalendarCheck size={15} /> 보강 처리
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );

  const renderCompleted = () => (
    <div className="grid-container cols-2" style={{ gap: '1rem' }}>
      {completed.length === 0 ? (
        <div className="mobile-empty-card" style={{ gridColumn: '1 / -1' }}>완료된 보강 기록이 없습니다.</div>
      ) : (
        completed.map(item => (
          <div key={item.id} className="mobile-data-card" style={{ cursor: 'default' }}>
            <div className="mobile-data-card-header">
              <div>
                <strong>{item.student?.name ?? '알 수 없는 학생'}</strong>
                <span>{item.class?.name ?? '반 정보 없음'}</span>
              </div>
              <span className="badge badge-makeup">완료</span>
            </div>
            <div className="mobile-data-grid">
              <div>
                <span>보강일</span>
                <strong>{item.makeupRecord.date}</strong>
              </div>
              <div>
                <span>원래 결석일</span>
                <strong>{item.makeupRecord.makeupForDate}</strong>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="grid-container cols-3" style={{ gap: '1rem' }}>
        <div className="metric-card danger">
          <div className="metric-label">보강 필요</div>
          <div className="metric-value">{summary.needed.length}건</div>
        </div>
        <div className="metric-card accent-mint">
          <div className="metric-label">보강 완료</div>
          <div className="metric-value">{summary.completed.length}건</div>
        </div>
        <div className="metric-card warning">
          <div className="metric-label">처리 방식</div>
          <div className="metric-value" style={{ fontSize: '1.05rem' }}>출결 저장</div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-input-wrapper">
          <Search size={18} className="search-icon" />
          <input
            className="form-control"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="학생명 또는 반 이름 검색"
          />
        </div>
        <div className="filter-options">
          {(['all', 'needed', 'completed'] as Filter[]).map(item => (
            <button
              key={item}
              type="button"
              className={`btn ${filter === item ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(item)}
            >
              {item === 'all' ? '전체' : item === 'needed' ? '보강 필요' : '보강 완료'}
            </button>
          ))}
          <button type="button" className={`btn ${activeOnly ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveOnly(value => !value)}>
            재원생만 {activeOnly ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {(filter === 'all' || filter === 'needed') && renderNeeded()}
      {(filter === 'all' || filter === 'completed') && renderCompleted()}

      {processingItem ? (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3 className="modal-title">보강 처리</h3>
              <button type="button" className="btn-icon-only" onClick={() => setProcessingItem(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="card" style={{ boxShadow: 'none', marginBottom: '1rem' }}>
                <CheckCircle2 size={20} color="var(--color-primary)" />
                <p style={{ margin: '0.5rem 0 0', color: 'var(--color-text-secondary)' }}>
                  {processingItem.student.name} 학생의 {processingItem.absentRecord.date} 결석분을 보강 기록으로 연결합니다.
                </p>
              </div>
              <div className="form-group">
                <label>보강 날짜</label>
                <input type="date" className="form-control" value={makeupDate} onChange={event => setMakeupDate(event.target.value)} />
              </div>
              <div className="form-group">
                <label>보강 반</label>
                <select className="form-control" value={makeupClassId} onChange={event => setMakeupClassId(event.target.value)}>
                  {classes
                    .filter(cls => cls.studentIds.includes(processingItem.student.id) || cls.id === processingItem.absentRecord.classId)
                    .map(cls => (
                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setProcessingItem(null)}>취소</button>
              <button type="button" className="btn btn-primary" onClick={handleProcess}>저장</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
