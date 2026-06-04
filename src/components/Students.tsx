import React, { useMemo, useState } from 'react';
import type { Student, Class, Attendance, Payment, CounselLog, StudentStatus } from '../types';
import { UserPlus, Search, Edit2, Eye, X, PlusCircle, Calendar, User, Phone, UserX, Sparkles } from 'lucide-react';
import { isAttendedStatus } from '../lib/attendanceStatus';
import { getClassScheduleLabel } from '../lib/classSchedules';
import { getStudentClassTuition } from '../lib/classTuition';
import { getStudentTagMap, type StudentTagKey, type StudentTagSeverity } from '../lib/studentTags';
import { getStudentPaymentStats } from '../lib/paymentStats';
import { getCounselBriefing } from '../lib/operationInsights';
import { generateCounselBriefing } from '../lib/assistant';
import { StudentTagBadges } from './StudentTagBadges';
import { StudentTimeline } from './StudentTimeline';
import { StudentReportPreview } from './StudentReportPreview';

// 태그 severity → CSS 클래스 매핑 (index.css는 .danger/.warn/.info 사용)
const TAG_SEV: Record<StudentTagSeverity, string> = { danger: 'danger', warning: 'warn', info: 'info' };

interface StudentsProps {
  students: Student[];
  classes: Class[];
  attendance: Attendance[];
  payments: Payment[];
  counselLogs: CounselLog[];
  onAddStudent: (student: Omit<Student, 'id'>) => void;
  onUpdateStudent: (student: Student) => void;
  onWithdrawStudent: (id: string) => void;
  onPauseStudent: (id: string) => void;
  onRestoreStudent: (id: string) => void;
  onAddCounselLog: (log: Omit<CounselLog, 'id'>) => void;
  onUpdateCounselLog: (log: CounselLog) => void;
}

export const Students: React.FC<StudentsProps> = ({
  students,
  classes,
  attendance,
  payments,
  counselLogs,
  onAddStudent,
  onUpdateStudent,
  onWithdrawStudent,
  onPauseStudent,
  onRestoreStudent,
  onAddCounselLog,
  onUpdateCounselLog,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StudentStatus | 'all'>('active');
  const [gradeFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState<StudentTagKey | 'all' | 'has-tags'>('all');
  const [unpaidOnly, setUnpaidOnly] = useState(false);

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);

  const [, setIsDetailOpen] = useState(false);
  const [activeDetailStudent, setActiveDetailStudent] = useState<Student | null>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'classes' | 'attendance' | 'payments' | 'counsel' | 'timeline' | 'analysis' | 'report' | 'report-old'>('info');

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formSchool, setFormSchool] = useState('');
  const [formGrade, setFormGrade] = useState('초등 1학년');
  const [formContact, setFormContact] = useState('');
  const [formParentContact, setFormParentContact] = useState('');
  const [formStatus, setFormStatus] = useState<StudentStatus>('active');
  const [formMemo, setFormMemo] = useState('');

  // Counsel Log Form inside Details Modal
  const [showLogForm, setShowLogForm] = useState(false);
  const [logTitle, setLogTitle] = useState('');
  const [logContent, setLogContent] = useState('');
  const [logType, setLogType] = useState<'counsel' | 'progress' | 'test'>('counsel');
  const [logScore, setLogScore] = useState('');
  const [aiBriefings, setAiBriefings] = useState<Record<string, string>>({});
  const [aiBriefingLoadingId, setAiBriefingLoadingId] = useState<string | null>(null);
  const [aiBriefingError, setAiBriefingError] = useState<{ studentId: string; message: string } | null>(null);


  // Grades list
  const grades = [
    '초등 1학년', '초등 2학년', '초등 3학년', '초등 4학년', '초등 5학년', '초등 6학년',
    '중등 1학년', '중등 2학년', '중등 3학년', '고등 1학년', '고등 2학년', '고등 3학년', '일반'
  ];

  // Open Form for Adding
  const handleOpenAdd = () => {
    setEditingStudent(null);
    setFormName('');
    setFormSchool('');
    setFormGrade('초등 1학년');
    setFormContact('');
    setFormParentContact('');
    setFormStatus('active');
    setFormMemo('');
    setIsFormOpen(true);
  };

  // Open Form for Editing
  const handleOpenEdit = (student: Student, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingStudent(student);
    setFormName(student.name);
    setFormSchool(student.school);
    setFormGrade(student.grade);
    setFormContact(student.contact);
    setFormParentContact(student.parentContact);
    setFormStatus(student.status);
    setFormMemo(student.memo);
    setIsFormOpen(true);
  };

  // Submit Add or Edit
  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || isSubmittingForm) return;

    setIsSubmittingForm(true);
    const studentData = {
      name: formName.trim(),
      school: formSchool.trim(),
      grade: formGrade,
      contact: formContact.trim(),
      parentContact: formParentContact.trim(),
      registrationDate: editingStudent ? editingStudent.registrationDate : new Date().toISOString().split('T')[0],
      status: formStatus,
      memo: formMemo.trim(),
    };

    try {
      if (editingStudent) {
        onUpdateStudent({ ...studentData, id: editingStudent.id });
      } else {
        onAddStudent(studentData);
      }
    } finally {
      setIsFormOpen(false);
      setIsSubmittingForm(false);
    }
  };

  // Open Detail Modal
  const handleOpenDetail = (student: Student) => {
    setActiveDetailStudent(student);
    setDetailTab('info');
    setShowLogForm(false);
    setIsDetailOpen(true);
  };

  // Submit Counsel Log inside detail modal
  const handleAddLogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDetailStudent || !logTitle.trim() || !logContent.trim() || isSubmittingLog) return;

    setIsSubmittingLog(true);
    try {
      onAddCounselLog({
        studentId: activeDetailStudent.id,
        date: new Date().toISOString().split('T')[0],
        title: logTitle.trim(),
        content: logContent.trim(),
        type: logType,
        score: logType === 'test' ? logScore.trim() : undefined,
      });

      setLogTitle('');
      setLogContent('');
      setLogScore('');
      setShowLogForm(false);
    } finally {
      setIsSubmittingLog(false);
    }
  };

  const handleGenerateAiBriefing = async (student: Student) => {
    const briefing = getCounselBriefing(student, classes, attendance, payments, counselLogs);
    const recentLogs = briefing.recentLogs
      .map(log => `- ${log.date} ${log.title}: ${log.content}${log.score ? ` (${log.score})` : ''}`)
      .join('\n') || '- 최근 상담/진도/시험 기록 없음';
    const prompt = [
      `${student.name} 학생 상담 전 30초 요약을 작성해줘.`,
      '자동 저장이나 DB 변경은 하지 말고, 원장님이 상담 전에 읽을 요약만 작성해.',
      '형식은 다음 4개 섹션으로 짧게:',
      '1. 한줄 결론',
      '2. 최근 변화',
      '3. 상담 때 물어볼 질문 3개',
      '4. 학부모에게 조심스럽게 말할 표현',
      '',
      `규칙 기반 포인트: ${briefing.focus.join(' / ') || '특별한 위험 신호 없음'}`,
      `최근 출석률: ${briefing.stats.attendanceRate}%`,
      `최근 결석: ${briefing.stats.absentCount}회`,
      `숙제 이슈: ${briefing.stats.homeworkIssueCount}회`,
      `이번 달 미납: ${briefing.stats.unpaidAmount.toLocaleString()}원`,
      `학생 메모: ${student.memo || '없음'}`,
      '최근 기록:',
      recentLogs,
    ].join('\n');

    setAiBriefingError(null);
    setAiBriefingLoadingId(student.id);
    try {
      const reply = await generateCounselBriefing(prompt);
      setAiBriefings(prev => ({ ...prev, [student.id]: reply }));
    } catch (error) {
      setAiBriefingError({
        studentId: student.id,
        message: error instanceof Error ? error.message : 'AI 요약 생성에 실패했습니다.',
      });
    } finally {
      setAiBriefingLoadingId(null);
    }
  };

  // Withdraw handler: keep historical records, but remove the student from active operations.
  const handleWithdrawClick = (student: Student, e: React.MouseEvent) => {
    e.stopPropagation();
    if (student.status === 'inactive') {
      alert('이미 퇴원 처리된 학생입니다.');
      return;
    }
    if (window.confirm(`${student.name} 학생을 퇴원 처리하시겠습니까?\n출결·수납·상담 기록은 보존되고, 현재 반 배정과 이후 출석/청구 대상에서만 제외됩니다.`)) {
      onWithdrawStudent(student.id);
      if (activeDetailStudent?.id === student.id) {
        setActiveDetailStudent({ ...activeDetailStudent, status: 'inactive' });
        setIsDetailOpen(false);
      }
    }
  };

  const handlePauseClick = (student: Student, e: React.MouseEvent) => {
    e.stopPropagation();
    if (student.status !== 'active') return;
    if (window.confirm(`${student.name} 학생을 휴원 처리하시겠습니까?\n반 배정은 유지되고, 휴원 기간 동안 수강료 청구만 중단됩니다.`)) {
      onPauseStudent(student.id);
      if (activeDetailStudent?.id === student.id)
        setActiveDetailStudent({ ...activeDetailStudent, status: 'paused' });
    }
  };

  const handleRestoreClick = (student: Student, e: React.MouseEvent) => {
    e.stopPropagation();
    if (student.status !== 'paused') return;
    if (window.confirm(`${student.name} 학생을 복귀 처리하시겠습니까?\n다시 재원생으로 전환하고 다음 달부터 수강료가 청구됩니다.`)) {
      onRestoreStudent(student.id);
      if (activeDetailStudent?.id === student.id)
        setActiveDetailStudent({ ...activeDetailStudent, status: 'active' });
    }
  };

  // Students belonging to the selected class (when a class filter is active).
  const filterClassMemberIds =
    classFilter === 'all'
      ? null
      : new Set(classes.find(c => c.id === classFilter)?.studentIds ?? []);

  // Students with an unpaid bill in the current billing month.
  const currentBillingMonth = new Date().toISOString().substring(0, 7);
  const unpaidStudentIds = new Set(
    payments.filter(p => p.billingMonth === currentBillingMonth && p.status === 'unpaid').map(p => p.studentId)
  );
  const studentTagMap = useMemo(
    () => getStudentTagMap(students, classes, attendance, payments, counselLogs),
    [students, classes, attendance, payments, counselLogs]
  );
  // 레퍼런스 칩 필터 바 (growing-students.jsx TAG_FILTERS)
  const tagFilterOptions: { value: StudentTagKey | 'all' | 'has-tags'; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'has-tags', label: '주의 태그' },
    { value: 'unpaid', label: '미납' },
    { value: 'frequent-absence', label: '결석 잦음' },
    { value: 'homework-followup', label: '숙제 미흡' },
    { value: 'needs-counsel', label: '상담 필요' },
    { value: 'report-missing', label: '리포트 미작성' },
  ];

  // Filter students
  const filteredStudents = students.filter(student => {
    const matchesSearch =
      student.name.toLowerCase().includes(search.toLowerCase()) ||
      student.school.toLowerCase().includes(search.toLowerCase()) ||
      student.grade.toLowerCase().includes(search.toLowerCase()) ||
      student.contact.includes(search) ||
      student.parentContact.includes(search);

    const matchesStatus = statusFilter === 'all' || student.status === statusFilter;
    const matchesGrade = gradeFilter === 'all' || student.grade === gradeFilter;
    const matchesClass = !filterClassMemberIds || filterClassMemberIds.has(student.id);
    const matchesUnpaid = !unpaidOnly || unpaidStudentIds.has(student.id);
    const tags = studentTagMap.get(student.id) ?? [];
    const matchesTags =
      tagFilter === 'all' ||
      (tagFilter === 'has-tags' && tags.length > 0) ||
      tags.some(tag => tag.key === tagFilter);

    return matchesSearch && matchesStatus && matchesGrade && matchesClass && matchesUnpaid && matchesTags;
  });

  // Calculations for Student Details
  const getStudentClasses = (studentId: string) => {
    return classes.filter(c => c.studentIds.includes(studentId));
  };

  const getStudentAttendance = (studentId: string) => {
    return attendance.filter(a => a.studentId === studentId);
  };

  const getStudentPayments = (studentId: string) => {
    return payments.filter(p => p.studentId === studentId);
  };

  const getStudentCounselLogs = (studentId: string) => {
    return counselLogs.filter(c => c.studentId === studentId);
  };

  const calculateAttendanceRate = (studentId: string) => {
    const records = getStudentAttendance(studentId);
    if (records.length === 0) return 0;
    const attended = records.filter(r => isAttendedStatus(r.status)).length;
    return Math.round((attended / records.length) * 100);
  };

  return (
    <div className="gd-root">
      {/* ── 상단 툴바: 컴팩트 상태/반 필터 + 학생 등록 ── */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
        <select className="form-control" style={{ width: '116px', padding: '0.4rem 0.65rem', fontSize: '0.82rem' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value as StudentStatus | 'all')}>
          <option value="active">재원생</option>
          <option value="paused">휴원생</option>
          <option value="inactive">퇴원생</option>
          <option value="all">전체 상태</option>
        </select>
        <select className="form-control" style={{ width: '128px', padding: '0.4rem 0.65rem', fontSize: '0.82rem' }} value={classFilter} onChange={e => setClassFilter(e.target.value)}>
          <option value="all">전체 반</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className={`at-chip ${unpaidOnly ? 'on' : ''}`} onClick={() => setUnpaidOnly(v => !v)}>미납자만</button>
        <button className="pay-btn primary" style={{ marginLeft: 'auto' }} onClick={handleOpenAdd}><UserPlus size={15} /> 학생 등록</button>
      </div>

      {/* ── 마스터-디테일 레이아웃 ── */}
      <div className={`st-shell${activeDetailStudent ? ' has-detail' : ''}`}>
        {/* 좌: 학생 목록 */}
        <div className="gd-card st-card-list">
          <div className="st-list-pane">
            {/* 검색 */}
            <div className="st-listbar">
              <div className="pay-search">
                <Search size={15} />
                <input placeholder="학생 이름·학교 검색…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            {/* 주의 태그 칩 필터 */}
            <div className="st-chips">
              {tagFilterOptions.map(o => (
                <button
                  key={o.value}
                  className={`at-chip ${tagFilter === o.value ? 'on' : ''}`}
                  onClick={() => setTagFilter(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="st-list">
              {filteredStudents.length === 0 ? (
                <div className="gd-empty">
                  <User size={26} />
                  <span>조건에 맞는 학생이 없어요</span>
                </div>
              ) : (
              filteredStudents.map(student => {
                const attRate = calculateAttendanceRate(student.id);
                const tags = studentTagMap.get(student.id) ?? [];
                const isSelected = activeDetailStudent?.id === student.id;
                return (
                  <button key={student.id} className={`st-item ${isSelected ? 'on' : ''}`} onClick={() => handleOpenDetail(student)}>
                    <div className="st-avatar">{student.name[0]}</div>
                    <div className="st-item-body">
                      <div className="st-item-top">
                        <span className="st-item-name">{student.name}</span>
                        <span className="st-item-grade">{student.grade.split(' ')[1] || student.grade}</span>
                      </div>
                      <div className="st-item-sub">{student.school}</div>
                      {tags.length > 0 && (
                        <div className="st-mini-tags">
                          {tags.slice(0, 3).map(tag => (
                            <span key={tag.key} className={`st-dot ${TAG_SEV[tag.severity]}`} title={`${tag.label} · ${tag.reason}`} />
                          ))}
                          {tags.length > 3 && <span className="st-more">+{tags.length - 3}</span>}
                        </div>
                      )}
                    </div>
                    <div className="st-item-rate">
                      <b>{attRate}%</b>
                      <span>출석</span>
                    </div>
                  </button>
                );
              })
              )}
            </div>
          </div>
        </div>

        {/* 우: 상세 패널 */}
        <div className="gd-card st-card-detail">
          {!activeDetailStudent ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem', color: 'var(--color-text-muted)', gap: '0.5rem' }}>
              <User size={32} style={{ opacity: 0.3 }} />
              <span style={{ fontSize: '0.9rem' }}>왼쪽 목록에서 학생을 선택하세요</span>
            </div>
          ) : (
            <div className="st-detail">
              {/* 모바일 뒤로가기 버튼 */}
              <button className="st-back-mobile" onClick={() => setActiveDetailStudent(null)}>
                ← 목록으로
              </button>
              {/* 상세 헤더 */}
              <div className="st-dhead">
                <div className="st-dhead-top">
                  <div className="st-davatar">{activeDetailStudent.name[0]}</div>
                  <div className="st-dhead-id">
                    <div className="st-dname">
                      {activeDetailStudent.name}
                      <span className={`st-status ${activeDetailStudent.status}`}>
                        {activeDetailStudent.status === 'active' ? '재원' : activeDetailStudent.status === 'paused' ? '휴원' : '퇴원'}
                      </span>
                    </div>
                    <div className="st-dmeta">{activeDetailStudent.school} · {activeDetailStudent.grade}</div>
                    <div className="st-contacts">
                      {activeDetailStudent.contact && <span><Phone size={12} /> {activeDetailStudent.contact}</span>}
                      {activeDetailStudent.parentContact && <span><Phone size={12} /> 학부모 {activeDetailStudent.parentContact}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                      <button className="pay-btn ghost sm" onClick={e => handleOpenEdit(activeDetailStudent, e)}><Edit2 size={13} /> 수정</button>
                      {activeDetailStudent.status === 'active' && <button className="pay-btn ghost sm" style={{ color: 'var(--color-warning)' }} onClick={e => handlePauseClick(activeDetailStudent, e)}>휴원 처리</button>}
                      {activeDetailStudent.status === 'paused' && <button className="pay-btn ghost sm" style={{ color: 'var(--color-accent-mint)' }} onClick={e => handleRestoreClick(activeDetailStudent, e)}>복귀 처리</button>}
                      <button className="pay-btn ghost sm" style={{ color: 'var(--color-danger)' }} disabled={activeDetailStudent.status === 'inactive'} onClick={e => handleWithdrawClick(activeDetailStudent, e)}><UserX size={13} /> 퇴원</button>
                    </div>
                  </div>
                  <div className="st-drate">
                    <div className="st-drate-v">{calculateAttendanceRate(activeDetailStudent.id)}<em>%</em></div>
                    <span className="st-drate-l">평균 출석</span>
                  </div>
                </div>
                {/* 주의 태그 (사유 호버) */}
                <div className="st-tags">
                  {(() => {
                    const detailTags = studentTagMap.get(activeDetailStudent.id) ?? [];
                    if (detailTags.length === 0) return <span className="st-tag none">주의 태그 없음</span>;
                    return detailTags.map(tag => (
                      <span key={tag.key} className={`st-tag ${TAG_SEV[tag.severity]}`} title={tag.reason}>{tag.label}</span>
                    ));
                  })()}
                </div>
              </div>

              {/* 탭 */}
              <div className="st-tabs">
                {(['timeline', 'info', 'attendance', 'counsel', 'report'] as const).map((tab, i) => (
                  <button key={tab} className={`st-tab ${detailTab === tab ? 'on' : ''}`} onClick={() => setDetailTab(tab)}>
                    {['타임라인', '기본 정보', '출결·수납', '상담 일지', '리포트'][i]}
                  </button>
                ))}
              </div>

              {/* 탭 콘텐츠 */}
              <div className="st-tabbody">
                {/* 타임라인 */}
                {detailTab === 'timeline' && (
                  <StudentTimeline student={activeDetailStudent} classes={classes} attendance={attendance} payments={payments} counselLogs={counselLogs} />
                )}

                {/* 기본 정보 */}
                {detailTab === 'info' && (
                  <div className="st-info">
                    <div className="st-info-grid">
                      <div className="st-info-cell"><span>학교 / 학년</span><b>{activeDetailStudent.school || '—'} / {activeDetailStudent.grade}</b></div>
                      <div className="st-info-cell"><span>등록일자</span><b>{activeDetailStudent.registrationDate}</b></div>
                      <div className="st-info-cell"><span>학생 연락처</span><b>{activeDetailStudent.contact || '—'}</b></div>
                      <div className="st-info-cell"><span>학부모 연락처</span><b>{activeDetailStudent.parentContact || '—'}</b></div>
                    </div>
                    {activeDetailStudent.memo && (
                      <div className="st-memo"><h4>메모</h4><p>{activeDetailStudent.memo}</p></div>
                    )}
                    <div className="st-classes">
                      <h4>수강 중인 반</h4>
                      {getStudentClasses(activeDetailStudent.id).length === 0 ? (
                        <p className="st-empty-line">배정된 반이 없습니다.</p>
                      ) : (
                        getStudentClasses(activeDetailStudent.id).map(cls => (
                          <div key={cls.id} className="st-class-row">
                            <span className="gd-class-bar" style={{ background: cls.color }} />
                            <span className="st-class-name">{cls.name}</span>
                            <span className="st-class-sched">{getClassScheduleLabel(cls)}</span>
                            <span style={{ marginLeft: 'auto', fontSize: '0.85rem', fontWeight: 700 }}>{getStudentClassTuition(cls, activeDetailStudent.id).toLocaleString()}원</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* 출결·수납 */}
                {detailTab === 'attendance' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                      <h4 className="st-info h4" style={{ fontWeight: 800, color: 'var(--color-primary-dark)', marginBottom: '0.6rem' }}>출결 기록</h4>
                      {getStudentAttendance(activeDetailStudent.id).length === 0 ? (
                        <p className="st-empty-line">출결 기록이 없습니다.</p>
                      ) : (
                        <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                          <table className="custom-table" style={{ fontSize: '0.82rem' }}>
                            <thead><tr><th>날짜</th><th>수업</th><th>상태</th></tr></thead>
                            <tbody>
                              {[...getStudentAttendance(activeDetailStudent.id)].reverse().map(att => (
                                <tr key={att.id}>
                                  <td>{att.date}</td>
                                  <td>{classes.find(c => c.id === att.classId)?.name || '—'}</td>
                                  <td><span className={`at-pill ${att.status === 'present' ? 'ok' : att.status === 'absent' ? 'danger' : att.status === 'supplement' ? 'warn' : 'info'}`}>{att.status === 'present' ? '출석' : att.status === 'absent' ? '결석' : att.status === 'supplement' ? '보충' : '보강'}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* 수납 통계 카드 */}
                    {getStudentPayments(activeDetailStudent.id).length > 0 && (() => {
                      const stats = getStudentPaymentStats(activeDetailStudent.id, payments);
                      return (
                        <div className="st-payment-stats">
                          <div className="stat-card">
                            <span className="stat-label">누적 청구액</span>
                            <span className="stat-value">{stats.totalBilled.toLocaleString()}원</span>
                          </div>
                          <div className="stat-card">
                            <span className="stat-label">누적 수납액</span>
                            <span className="stat-value" style={{ color: 'var(--color-accent-mint)' }}>
                              {stats.totalPaid.toLocaleString()}원
                            </span>
                          </div>
                          <div className="stat-card">
                            <span className="stat-label">미납액</span>
                            <span className="stat-value" style={{ color: 'var(--color-danger)' }}>
                              {stats.unpaidAmount.toLocaleString()}원
                            </span>
                          </div>
                          <div className="stat-card">
                            <span className="stat-label">수납률</span>
                            <span className="stat-value">{stats.rate}%</span>
                          </div>
                        </div>
                      );
                    })()}

                    <div>
                      <h4 style={{ fontWeight: 800, color: 'var(--color-primary-dark)', marginBottom: '0.6rem', fontSize: '0.92rem' }}>수납 이력</h4>
                      {getStudentPayments(activeDetailStudent.id).length === 0 ? (
                        <p className="st-empty-line">납부 기록이 없습니다.</p>
                      ) : (
                        <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                          <table className="custom-table" style={{ fontSize: '0.82rem' }}>
                            <thead><tr><th>청구월</th><th>금액</th><th>상태</th><th>납부일</th></tr></thead>
                            <tbody>
                              {[...getStudentPayments(activeDetailStudent.id)].reverse().map(pay => (
                                <tr key={pay.id}>
                                  <td style={{ fontWeight: 600 }}>{pay.billingMonth}</td>
                                  <td>{pay.amount.toLocaleString()}원</td>
                                  <td><span className={`pay-badge ${pay.status}`}>{pay.status === 'paid' ? '완납' : '미납'}</span></td>
                                  <td>{pay.paymentDate || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 상담 일지 */}
                {detailTab === 'counsel' && (
                  <div>
                    {(() => {
                      const briefing = getCounselBriefing(activeDetailStudent, classes, attendance, payments, counselLogs);
                      return (
                        <section className="st-briefing">
                          <div className="st-briefing-head">
                            <div>
                              <span>상담 전 30초 요약</span>
                              <h4>{briefing.headline}</h4>
                            </div>
                            <button
                              type="button"
                              className="ai-mark-btn"
                              disabled={aiBriefingLoadingId === activeDetailStudent.id}
                              onClick={() => void handleGenerateAiBriefing(activeDetailStudent)}
                              title="아이비가 상담 요약을 자연어로 정리합니다"
                            >
                              <Sparkles size={14} />
                              {aiBriefingLoadingId === activeDetailStudent.id ? 'AI 작성 중' : 'AI 요약'}
                            </button>
                          </div>
                          <div className="st-briefing-stats">
                            <div><span>최근 출석률</span><b>{briefing.stats.attendanceRate || 0}%</b></div>
                            <div><span>결석</span><b>{briefing.stats.absentCount}회</b></div>
                            <div><span>숙제 이슈</span><b>{briefing.stats.homeworkIssueCount}회</b></div>
                            <div><span>이번 달 미납</span><b>{briefing.stats.unpaidAmount.toLocaleString()}원</b></div>
                          </div>
                          <div className="st-briefing-grid">
                            <div>
                              <strong>오늘 볼 포인트</strong>
                              {briefing.focus.length === 0 ? (
                                <p>특별한 위험 신호는 없습니다.</p>
                              ) : (
                                <ul>{briefing.focus.map(item => <li key={item}>{item}</li>)}</ul>
                              )}
                            </div>
                            <div>
                              <strong>바로 물어볼 질문</strong>
                              <ul>{briefing.questions.map(item => <li key={item}>{item}</li>)}</ul>
                            </div>
                          </div>
                          {briefing.recentLogs.length > 0 && (
                            <div className="st-briefing-logs">
                              <strong>최근 기록</strong>
                              {briefing.recentLogs.map(log => (
                                <span key={log.id}>{log.date} · {log.title}{log.score ? ` · ${log.score}` : ''}</span>
                              ))}
                            </div>
                          )}
                          {aiBriefingError?.studentId === activeDetailStudent.id && (
                            <div className="st-ai-briefing error">{aiBriefingError.message}</div>
                          )}
                          {aiBriefings[activeDetailStudent.id] && (
                            <div className="st-ai-briefing">
                              <div className="st-ai-briefing-title">
                                <Sparkles size={14} /> 아이비 상담 요약
                              </div>
                              <p>{aiBriefings[activeDetailStudent.id]}</p>
                            </div>
                          )}
                        </section>
                      );
                    })()}
                    <div className="st-counsel-head">
                      <h4 style={{ fontWeight: 800, color: 'var(--color-primary-dark)', fontSize: '0.92rem' }}>상담 · 진도 일지</h4>
                      <button className="at-act" onClick={() => setShowLogForm(!showLogForm)}><PlusCircle size={13} /> 일지 작성</button>
                    </div>
                    {showLogForm && (
                      <form onSubmit={handleAddLogSubmit} style={{ marginBottom: '1rem', padding: '0.85rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: '#fafcfb' }}>
                        <div className="form-row">
                          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                            <label>유형</label>
                            <select className="form-control" value={logType} onChange={e => setLogType(e.target.value as 'counsel' | 'progress' | 'test')}>
                              <option value="counsel">상담 일지</option>
                              <option value="progress">수업/진도 일지</option>
                              <option value="test">테스트 성적</option>
                            </select>
                          </div>
                          {logType === 'test' && (
                            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                              <label>점수/결과</label>
                              <input type="text" className="form-control" placeholder="예: 95/100" value={logScore} onChange={e => setLogScore(e.target.value)} required />
                            </div>
                          )}
                        </div>
                        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                          <label>제목</label>
                          <input type="text" className="form-control" placeholder="예: 전화상담 - 가정 학습 지도" value={logTitle} onChange={e => setLogTitle(e.target.value)} required />
                        </div>
                        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                          <label>내용</label>
                          <textarea className="form-control" rows={3} value={logContent} onChange={e => setLogContent(e.target.value)} required />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                          <button type="button" className="at-act" onClick={() => setShowLogForm(false)} disabled={isSubmittingLog}>취소</button>
                          <button type="submit" className="at-act primary" disabled={isSubmittingLog}>저장</button>
                        </div>
                      </form>
                    )}
                    {getStudentCounselLogs(activeDetailStudent.id).length === 0 ? (
                      <p className="st-empty-line">기록된 상담/진도 일지가 없습니다.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '400px', overflowY: 'auto' }}>
                        {[...getStudentCounselLogs(activeDetailStudent.id)].reverse().map(log => (
                          <div key={log.id} className="st-log">
                            <div className="st-log-head">
                              <span className={`st-log-type ${log.type}`}>{log.type === 'counsel' ? '상담' : log.type === 'test' ? '테스트' : '진도'}</span>
                              <span className="st-log-title">{log.title}</span>
                              <span className="st-log-date">{log.date}</span>
                            </div>
                            <p className="st-log-content">{log.content}</p>
                            {log.score && <span className="st-log-score">🎯 {log.score}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 월간 학습 리포트 */}
                {detailTab === 'report' && (
                  <StudentReportPreview
                    student={activeDetailStudent}
                    classes={classes}
                    attendance={attendance}
                    payments={payments}
                    counselLogs={counselLogs}
                    onAddCounselLog={onAddCounselLog}
                    onUpdateCounselLog={onUpdateCounselLog}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 기존 테이블 (사용 안 함 — 아래는 숨김 처리) */}
      <div className="table-wrapper mobile-card-desktop" style={{ display: 'none' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>학교 / 학년</th>
              <th>학부모 연락처</th>
              <th>등록일</th>
              <th>출석률</th>
              <th>상태</th>
              <th style={{ textAlign: 'right' }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-secondary)' }}>
                  🌱 조건에 맞는 학생이 없습니다. 학생을 새로 등록해 보세요.
                </td>
              </tr>
            ) : (
              filteredStudents.map(student => {
                const attRate = calculateAttendanceRate(student.id);
                const tags = studentTagMap.get(student.id) ?? [];
                return (
                  <tr
                    key={student.id}
                    onClick={() => handleOpenDetail(student)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                      {student.name}
                      <div style={{ marginTop: '0.35rem' }}>
                        <StudentTagBadges tags={tags} maxVisible={3} />
                      </div>
                    </td>
                    <td>
                      {student.school || '-'} ({student.grade})
                    </td>
                    <td>{student.parentContact || '-'}</td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{student.registrationDate}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{attRate}%</span>
                        <div style={{ width: '60px', height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${attRate}%`, height: '100%', backgroundColor: attRate > 80 ? 'var(--color-success)' : attRate > 50 ? 'var(--color-warning)' : 'var(--color-danger)' }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${student.status === 'active' ? 'badge-active' : student.status === 'paused' ? 'badge-warning' : 'badge-inactive'}`}>
                        {student.status === 'active' ? '재원' : student.status === 'paused' ? '휴원' : '퇴원'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.25rem' }}>
                        <button
                          className="btn-icon-only"
                          title="상세 보기"
                          onClick={() => handleOpenDetail(student)}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          className="btn-icon-only"
                          title="수정"
                          onClick={e => handleOpenEdit(student, e)}
                        >
                          <Edit2 size={16} />
                        </button>
                        {student.status === 'active' && (
                          <button
                            className="btn-icon-only"
                            title="휴원 처리"
                            onClick={e => handlePauseClick(student, e)}
                            style={{ color: 'var(--color-warning)' }}
                          >
                            <Calendar size={16} />
                          </button>
                        )}
                        {student.status === 'paused' && (
                          <button
                            className="btn-icon-only"
                            title="복귀 처리"
                            onClick={e => handleRestoreClick(student, e)}
                            style={{ color: 'var(--color-success)' }}
                          >
                            <UserPlus size={16} />
                          </button>
                        )}
                        <button
                          className="btn-icon-only text-danger"
                          title="퇴원 처리"
                          onClick={e => handleWithdrawClick(student, e)}
                          disabled={student.status === 'inactive'}
                        >
                          <UserX size={16} style={{ color: 'var(--color-danger)' }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list">
        {filteredStudents.length === 0 ? (
          <div className="mobile-empty-card">
            🌱 조건에 맞는 학생이 없습니다. 학생을 새로 등록해 보세요.
          </div>
        ) : (
          filteredStudents.map(student => {
            const attRate = calculateAttendanceRate(student.id);
            const tags = studentTagMap.get(student.id) ?? [];
            return (
              <div key={`${student.id}-mobile`} className="mobile-data-card" onClick={() => handleOpenDetail(student)}>
                <div className="mobile-data-card-header">
                  <div>
                    <strong>{student.name}</strong>
                    <span>{student.school || '-'} · {student.grade}</span>
                  </div>
                  <span className={`badge ${student.status === 'active' ? 'badge-active' : student.status === 'paused' ? 'badge-warning' : 'badge-inactive'}`}>
                    {student.status === 'active' ? '재원' : student.status === 'paused' ? '휴원' : '퇴원'}
                  </span>
                </div>

                <div className="mobile-data-grid">
                  <div>
                    <span>학부모 연락처</span>
                    <strong>{student.parentContact || '-'}</strong>
                  </div>
                  <div>
                    <span>등록일</span>
                    <strong>{student.registrationDate || '-'}</strong>
                  </div>
                  <div>
                    <span>출석률</span>
                    <strong>{attRate}%</strong>
                  </div>
                </div>

                <div className="mobile-progress">
                  <div style={{ width: `${attRate}%`, backgroundColor: attRate > 80 ? 'var(--color-success)' : attRate > 50 ? 'var(--color-warning)' : 'var(--color-danger)' }} />
                </div>

                <StudentTagBadges tags={tags} maxVisible={3} />

                <div className="mobile-card-actions" onClick={e => e.stopPropagation()}>
                  <button className="btn btn-secondary" onClick={() => handleOpenDetail(student)}>
                    <Eye size={14} /> 상세
                  </button>
                  <button className="btn btn-secondary" onClick={e => handleOpenEdit(student, e)}>
                    <Edit2 size={14} /> 수정
                  </button>
                  {student.status === 'active' && (
                    <button className="btn btn-secondary" onClick={e => handlePauseClick(student, e)} style={{ color: 'var(--color-warning)' }}>
                      <Calendar size={14} /> 휴원
                    </button>
                  )}
                  {student.status === 'paused' && (
                    <button className="btn btn-secondary" onClick={e => handleRestoreClick(student, e)} style={{ color: 'var(--color-success)' }}>
                      <UserPlus size={14} /> 복귀
                    </button>
                  )}
                  <button className="btn btn-danger" onClick={e => handleWithdrawClick(student, e)} disabled={student.status === 'inactive'}>
                    <UserX size={14} /> 퇴원 처리
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Add/Edit Student */}
      {isFormOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">
                {editingStudent ? `${editingStudent.name} 학생 정보 수정` : '새 학생 등록'}
              </h3>
              <button className="btn-icon-only" onClick={() => setIsFormOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmitForm}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>학생 이름 *</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>재원 상태</label>
                    <select
                      className="form-control"
                      value={formStatus}
                      onChange={e => setFormStatus(e.target.value as StudentStatus)}
                    >
                      <option value="active">재원</option>
                      <option value="paused">휴원</option>
                      <option value="inactive">퇴원</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>학교 이름</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="예: 그린초등학교"
                      value={formSchool}
                      onChange={e => setFormSchool(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>학년</label>
                    <select
                      className="form-control"
                      value={formGrade}
                      onChange={e => setFormGrade(e.target.value)}
                    >
                      {grades.map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>학생 연락처</label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="010-0000-0000"
                      value={formContact}
                      onChange={e => setFormContact(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>학부모 연락처</label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="010-0000-0000"
                      value={formParentContact}
                      onChange={e => setFormParentContact(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>메모 및 특이사항</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="성격, 학업 수준, 상담 시 주의점 등..."
                    value={formMemo}
                    onChange={e => setFormMemo(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsFormOpen(false)} disabled={isSubmittingForm}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmittingForm}>
                  {editingStudent ? '수정 완료' : '등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
