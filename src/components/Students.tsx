import React, { useState } from 'react';
import type { Student, Class, Attendance, Payment, CounselLog, StudentStatus } from '../types';
import { UserPlus, Search, Edit2, Eye, X, PlusCircle, Calendar, User, GraduationCap, Phone, UserX } from 'lucide-react';
import { isAttendedStatus, normalizeAttendanceStatus } from '../lib/attendanceStatus';
import { getClassScheduleLabel } from '../lib/classSchedules';
import { getStudentClassTuition } from '../lib/classTuition';

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
  const [gradeFilter, setGradeFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [unpaidOnly, setUnpaidOnly] = useState(false);

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [activeDetailStudent, setActiveDetailStudent] = useState<Student | null>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'classes' | 'attendance' | 'payments' | 'counsel' | 'analysis' | 'report'>('info');

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

  // Monthly Report States
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reportComment, setReportComment] = useState('');

  // Load the saved comment into the editable field whenever the selected
  // student or month changes. Done during render (not in an effect) so the
  // field is correct on first paint and in-progress edits aren't clobbered by
  // unrelated counsel-log updates.
  const reportSyncKey = `${activeDetailStudent?.id ?? ''}|${reportMonth}`;
  const [syncedReportKey, setSyncedReportKey] = useState(reportSyncKey);
  if (reportSyncKey !== syncedReportKey) {
    setSyncedReportKey(reportSyncKey);
    const existingLog = activeDetailStudent
      ? counselLogs.find(
          log =>
            log.studentId === activeDetailStudent.id &&
            log.type === 'progress' &&
            log.title.includes(`${reportMonth} 월간 학습 리포트`)
        )
      : undefined;
    setReportComment(existingLog?.content ?? '');
  }

  const handleSaveReportComment = () => {
    if (!activeDetailStudent) return;
    if (!reportComment.trim()) {
      alert('종합 의견 내용을 입력해 주세요.');
      return;
    }
    const existingLog = counselLogs.find(
      log =>
        log.studentId === activeDetailStudent.id &&
        log.type === 'progress' &&
        log.title.includes(`${reportMonth} 월간 학습 리포트`)
    );

    if (existingLog) {
      onUpdateCounselLog({
        ...existingLog,
        content: reportComment.trim(),
        date: new Date().toISOString().split('T')[0],
      });
    } else {
      onAddCounselLog({
        studentId: activeDetailStudent.id,
        date: new Date().toISOString().split('T')[0],
        title: `🌱 ${reportMonth} 월간 학습 리포트 종합 의견`,
        content: reportComment.trim(),
        type: 'progress',
      });
    }
    alert('원장님 의견이 안전하게 저장되었습니다.');
  };

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
    if (!formName.trim()) return;

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

    if (editingStudent) {
      onUpdateStudent({ ...studentData, id: editingStudent.id });
    } else {
      onAddStudent(studentData);
    }
    setIsFormOpen(false);
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
    if (!activeDetailStudent || !logTitle.trim() || !logContent.trim()) return;

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

    return matchesSearch && matchesStatus && matchesGrade && matchesClass && matchesUnpaid;
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
    <div>
      {/* Header action */}
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="form-control"
            placeholder="학생 이름, 학교, 연락처로 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-options">
          <select
            className="form-control"
            style={{ width: '130px' }}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StudentStatus | 'all')}
          >
            <option value="active">재원생</option>
            <option value="paused">휴원생</option>
            <option value="inactive">퇴원생</option>
            <option value="all">전체 상태</option>
          </select>

          <select
            className="form-control"
            style={{ width: '140px' }}
            value={gradeFilter}
            onChange={e => setGradeFilter(e.target.value)}
          >
            <option value="all">전체 학년</option>
            {grades.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          <select
            className="form-control"
            style={{ width: '150px' }}
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
          >
            <option value="all">전체 반</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <button
            className={`btn ${unpaidOnly ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setUnpaidOnly(v => !v)}
            title="이번 달 교육비가 미납된 학생만 보기"
          >
            미납자만 {unpaidOnly ? '✓' : ''}
          </button>

          <button className="btn btn-primary" onClick={handleOpenAdd}>
            <UserPlus size={16} /> 학생 등록
          </button>
        </div>
      </div>

      {/* Students Table */}
      <div className="table-wrapper mobile-card-desktop">
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
                return (
                  <tr
                    key={student.id}
                    onClick={() => handleOpenDetail(student)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                      {student.name}
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
                <button type="button" className="btn btn-secondary" onClick={() => setIsFormOpen(false)}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingStudent ? '수정 완료' : '등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Student Detailed Profile */}
      {isDetailOpen && activeDetailStudent && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '750px' }}>
            <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ backgroundColor: 'var(--color-bg-base)', padding: '0.5rem', borderRadius: '50%' }}>
                  <User size={28} className="text-primary" />
                </div>
                <div>
                  <h3 className="modal-title" style={{ fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {activeDetailStudent.name}
                    <span className={`badge ${activeDetailStudent.status === 'active' ? 'badge-active' : activeDetailStudent.status === 'paused' ? 'badge-warning' : 'badge-inactive'}`} style={{ fontSize: '0.7rem' }}>
                      {activeDetailStudent.status === 'active' ? '재원생' : activeDetailStudent.status === 'paused' ? '휴원생' : '퇴원생'}
                    </span>
                  </h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '0.15rem' }}>
                    {activeDetailStudent.school} • {activeDetailStudent.grade}
                  </div>
                </div>
              </div>
              <button className="btn-icon-only" onClick={() => setIsDetailOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ paddingTop: '1rem' }}>
              {/* Tab Header Navigation */}
               <div className="tabs-header">
                <button className={`tab-btn ${detailTab === 'info' ? 'active' : ''}`} onClick={() => setDetailTab('info')}>
                  기본 정보
                </button>
                <button className={`tab-btn ${detailTab === 'classes' ? 'active' : ''}`} onClick={() => setDetailTab('classes')}>
                  수강 중인 반
                </button>
                <button className={`tab-btn ${detailTab === 'attendance' ? 'active' : ''}`} onClick={() => setDetailTab('attendance')}>
                  출결 이력
                </button>
                <button className={`tab-btn ${detailTab === 'payments' ? 'active' : ''}`} onClick={() => setDetailTab('payments')}>
                  원비 수납
                </button>
                <button className={`tab-btn ${detailTab === 'counsel' ? 'active' : ''}`} onClick={() => setDetailTab('counsel')}>
                  상담/성적 일지
                </button>
                <button className={`tab-btn ${detailTab === 'analysis' ? 'active' : ''}`} onClick={() => setDetailTab('analysis')}>
                  성적 분석
                </button>
                <button className={`tab-btn ${detailTab === 'report' ? 'active' : ''}`} onClick={() => setDetailTab('report')}>
                  월간 리포트
                </button>
              </div>

              {/* Tab 1: Info */}
              {detailTab === 'info' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="grid-container cols-2" style={{ gap: '1rem' }}>
                    <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-md)', backgroundColor: '#fafbfc', border: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem', fontWeight: 600 }}>
                        <GraduationCap size={16} /> 학교 및 학년
                      </div>
                      <div style={{ fontWeight: 700 }}>{activeDetailStudent.school || '기록 없음'} | {activeDetailStudent.grade}</div>
                    </div>
                    <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-md)', backgroundColor: '#fafbfc', border: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem', fontWeight: 600 }}>
                        <Calendar size={16} /> 등록일자
                      </div>
                      <div style={{ fontWeight: 700 }}>{activeDetailStudent.registrationDate}</div>
                    </div>
                  </div>

                  <div className="grid-container cols-2" style={{ gap: '1rem' }}>
                    <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-md)', backgroundColor: '#fafbfc', border: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem', fontWeight: 600 }}>
                        <Phone size={16} /> 학생 본인 연락처
                      </div>
                      <div style={{ fontWeight: 700 }}>{activeDetailStudent.contact || '연락처 없음'}</div>
                    </div>
                    <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-md)', backgroundColor: '#fafbfc', border: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem', fontWeight: 600 }}>
                        <Phone size={16} /> 학부모 연락처
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--color-primary-dark)' }}>{activeDetailStudent.parentContact || '연락처 없음'}</div>
                    </div>
                  </div>

                  <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: '#f0f7f3', border: '1px solid var(--color-accent-mint-light)' }}>
                    <h5 style={{ fontWeight: 700, color: 'var(--color-primary-dark)', marginBottom: '0.5rem' }}>메모 및 교습 가이드</h5>
                    <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>
                      {activeDetailStudent.memo || '저장된 특이사항 메모가 없습니다.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Tab 2: Classes */}
              {detailTab === 'classes' && (
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--color-primary-dark)' }}>배정된 수업 목록</h4>
                  {getStudentClasses(activeDetailStudent.id).length === 0 ? (
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', padding: '2rem 0', textAlign: 'center' }}>
                      수강 중인 반이 없습니다. [반/시간표 관리]에서 반에 배정해 주세요.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {getStudentClasses(activeDetailStudent.id).map(cls => (
                        <div key={cls.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: '#fafbfc' }}>
                          <div>
                            <span style={{ fontWeight: 700, color: 'var(--color-primary-dark)' }}>{cls.name}</span>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.2rem' }}>
                              🕒 시간표: {getClassScheduleLabel(cls)}
                            </div>
                          </div>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-primary)' }}>
                            월 {getStudentClassTuition(cls, activeDetailStudent.id).toLocaleString()}원
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Attendance */}
              {detailTab === 'attendance' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>출결 기록</h4>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary-light)' }}>
                      평균 출석률: {calculateAttendanceRate(activeDetailStudent.id)}%
                    </span>
                  </div>

                  {getStudentAttendance(activeDetailStudent.id).length === 0 ? (
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', padding: '2rem 0', textAlign: 'center' }}>
                      출결 기록이 없습니다.
                    </p>
                  ) : (
                    <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                      <table className="custom-table" style={{ fontSize: '0.85rem' }}>
                        <thead>
                          <tr>
                            <th>날짜</th>
                            <th>수업</th>
                            <th>상태</th>
                            <th>비고</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...getStudentAttendance(activeDetailStudent.id)].reverse().map(att => {
                            const cls = classes.find(c => c.id === att.classId);
                            return (
                              <tr key={att.id}>
                                <td>{att.date}</td>
                                <td>{cls?.name || '삭제된 수업'}</td>
                                <td>
                                  <span className={`badge ${
                                    att.status === 'present' ? 'badge-present' :
                                    att.status === 'absent' ? 'badge-absent' :
                                    normalizeAttendanceStatus(att.status) === 'makeup' ? 'badge-makeup' : 'badge-present'
                                  }`} style={{ fontSize: '0.65rem' }}>
                                    {att.status === 'present' ? '출석' :
                                     att.status === 'absent' ? '결석' :
                                     normalizeAttendanceStatus(att.status) === 'makeup' ? '보강' : '출석'}
                                  </span>
                                </td>
                                <td>{att.memo || '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 4: Payments */}
              {detailTab === 'payments' && (
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--color-primary-dark)' }}>청구 및 납부 이력</h4>
                  {getStudentPayments(activeDetailStudent.id).length === 0 ? (
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', padding: '2rem 0', textAlign: 'center' }}>
                      청구/납부 기록이 없습니다.
                    </p>
                  ) : (
                    <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                      <table className="custom-table" style={{ fontSize: '0.85rem' }}>
                        <thead>
                          <tr>
                            <th>청구월</th>
                            <th>금액</th>
                            <th>납부 여부</th>
                            <th>납부일자</th>
                            <th>결제 수단</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...getStudentPayments(activeDetailStudent.id)].reverse().map(pay => (
                            <tr key={pay.id}>
                              <td style={{ fontWeight: 600 }}>{pay.billingMonth}</td>
                              <td>{pay.amount.toLocaleString()}원</td>
                              <td>
                                <span className={`badge ${pay.status === 'paid' ? 'badge-paid' : 'badge-unpaid'}`} style={{ fontSize: '0.65rem' }}>
                                  {pay.status === 'paid' ? '완납' : '미납'}
                                </span>
                              </td>
                              <td>{pay.paymentDate || '-'}</td>
                              <td>
                                {pay.paymentMethod === 'card' ? '카드' :
                                 pay.paymentMethod === 'cash' ? '현금' :
                                 pay.paymentMethod === 'transfer' ? '계좌이체' : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 5: Counsel & Test Logs */}
              {detailTab === 'counsel' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>상담 및 진도/평가 기록</h4>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', gap: '0.25rem' }}
                      onClick={() => setShowLogForm(!showLogForm)}
                    >
                      <PlusCircle size={14} /> 일지 작성
                    </button>
                  </div>

                  {/* Inline Add Log Form */}
                  {showLogForm && (
                    <form onSubmit={handleAddLogSubmit} style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid var(--color-accent-mint-light)', borderRadius: 'var(--radius-md)', backgroundColor: '#fafcfb' }}>
                      <div className="form-row">
                        <div className="form-group">
                          <label>유형</label>
                          <select
                            className="form-control"
                            value={logType}
                            onChange={e => setLogType(e.target.value as 'counsel' | 'progress' | 'test')}
                          >
                            <option value="counsel">상담 일지</option>
                            <option value="progress">수업/진도 일지</option>
                            <option value="test">테스트 성적</option>
                          </select>
                        </div>
                        {logType === 'test' && (
                          <div className="form-group">
                            <label>점수/결과</label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="예: 95/100, Pass 등"
                              value={logScore}
                              onChange={e => setLogScore(e.target.value)}
                              required={logType === 'test'}
                            />
                          </div>
                        )}
                      </div>

                      <div className="form-group">
                        <label>제목</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="예: 전화상담 - 가정 학습 지도 협조"
                          value={logTitle}
                          onChange={e => setLogTitle(e.target.value)}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>세부 내용</label>
                        <textarea
                          className="form-control"
                          rows={3}
                          placeholder="상담 결과 또는 수업 성취도를 상세히 입력하세요..."
                          value={logContent}
                          onChange={e => setLogContent(e.target.value)}
                          required
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button type="button" className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => setShowLogForm(false)}>
                          취소
                        </button>
                        <button type="submit" className="btn btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>
                          저장
                        </button>
                      </div>
                    </form>
                  )}

                  {getStudentCounselLogs(activeDetailStudent.id).length === 0 ? (
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', padding: '2rem 0', textAlign: 'center' }}>
                      기록된 상담 및 진도 일지가 없습니다.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '350px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                      {[...getStudentCounselLogs(activeDetailStudent.id)].reverse().map(log => (
                        <div
                          key={log.id}
                          style={{
                            padding: '1rem',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            backgroundColor: log.type === 'counsel' ? '#fffdfa' : log.type === 'test' ? '#fafdfc' : '#fafbfc',
                            borderLeft: `4px solid ${log.type === 'counsel' ? 'var(--color-warning)' : log.type === 'test' ? 'var(--color-accent-mint)' : 'var(--color-info)'}`
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: '3px', color: 'white', backgroundColor: log.type === 'counsel' ? 'var(--color-warning)' : log.type === 'test' ? 'var(--color-accent-mint)' : 'var(--color-info)' }}>
                                {log.type === 'counsel' ? '상담' : log.type === 'test' ? '테스트' : '진도'}
                              </span>
                              <span style={{ fontWeight: 700, color: 'var(--color-primary-dark)' }}>{log.title}</span>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{log.date}</span>
                          </div>

                          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>
                            {log.content}
                          </p>

                          {log.score && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-accent-mint)' }}>
                              🎯 테스트 결과: {log.score}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 6: Score Analysis Graph */}
              {detailTab === 'analysis' && (
                <div>
                  <h4 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--color-primary-dark)' }}>
                    📈 성적 추이 분석
                  </h4>
                  {(() => {
                    const parseScoreValue = (scoreStr?: string): number => {
                      if (!scoreStr) return 0;
                      const match = scoreStr.match(/^(\d+)/);
                      return match ? parseInt(match[1], 10) : 0;
                    };

                    const studentTestLogs = counselLogs
                      .filter(log => log.studentId === activeDetailStudent.id && log.type === 'test')
                      .sort((a, b) => a.date.localeCompare(b.date));

                    if (studentTestLogs.length === 0) {
                      return (
                        <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: '#fafbfc' }}>
                          <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🎯</span>
                          기록된 테스트 성적이 없습니다.<br />
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', display: 'block' }}>
                            [상담/성적 일지] 탭에서 우측 상단 '일지 작성' 버튼을 선택해 테스트 유형의 성적을 추가해 주세요.
                          </span>
                        </div>
                      );
                    }

                    const width = 650;
                    const height = 250;
                    const padding = { top: 35, bottom: 45, left: 50, right: 30 };
                    const chartWidth = width - padding.left - padding.right;
                    const chartHeight = height - padding.top - padding.bottom;

                    const points = studentTestLogs.map((log, index) => {
                      const score = parseScoreValue(log.score);
                      const x = padding.left + (studentTestLogs.length === 1 ? chartWidth / 2 : (index / (studentTestLogs.length - 1)) * chartWidth);
                      const y = padding.top + chartHeight - (score / 100) * chartHeight;
                      return { x, y, score, date: log.date, title: log.title };
                    });

                    const pointsString = points.map(p => `${p.x},${p.y}`).join(' ');
                    
                    let areaPath = '';
                    if (points.length > 0) {
                      const startX = points[0].x;
                      const endX = points[points.length - 1].x;
                      const zeroY = padding.top + chartHeight;
                      areaPath = `M ${startX},${zeroY} ` + points.map(p => `L ${p.x},${p.y}`).join(' ') + ` L ${endX},${zeroY} Z`;
                    }

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ 
                          border: '1px solid var(--color-border)', 
                          borderRadius: 'var(--radius-md)', 
                          padding: '1rem 0.5rem', 
                          backgroundColor: '#ffffff',
                          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.01)',
                          overflowX: 'auto'
                        }}>
                          <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ minWidth: '550px' }}>
                            <defs>
                              <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.2" />
                                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>

                            {/* Horizontal Grid lines */}
                            {[0, 20, 40, 60, 80, 100].map(val => {
                              const y = padding.top + chartHeight - (val / 100) * chartHeight;
                              return (
                                <g key={val}>
                                  <line 
                                    x1={padding.left} 
                                    y1={y} 
                                    x2={width - padding.right} 
                                    y2={y} 
                                    stroke="#e9ecef" 
                                    strokeDasharray="4 4" 
                                  />
                                  <text 
                                    x={padding.left - 12} 
                                    y={y + 4} 
                                    textAnchor="end" 
                                    fontSize="11" 
                                    fontWeight="600"
                                    fill="var(--color-text-muted)"
                                  >
                                    {val}
                                  </text>
                                </g>
                              );
                            })}

                            {/* Gradient Fill under the line */}
                            {points.length > 1 && (
                              <path d={areaPath} fill="url(#chart-grad)" />
                            )}

                            {/* Main Trend Line */}
                            {points.length > 1 && (
                              <polyline 
                                points={pointsString} 
                                fill="none" 
                                stroke="var(--color-primary)" 
                                strokeWidth="3.5" 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                              />
                            )}

                            {/* Grid / Dots & Tooltips */}
                            {points.map((p, i) => (
                              <g key={i}>
                                <line 
                                  x1={p.x} 
                                  y1={p.y} 
                                  x2={p.x} 
                                  y2={padding.top + chartHeight} 
                                  stroke="#ced4da" 
                                  strokeDasharray="2 2" 
                                />
                                <circle cx={p.x} cy={p.y} r="8" fill="var(--color-primary)" opacity="0.15" />
                                <circle 
                                  cx={p.x} 
                                  cy={p.y} 
                                  r="4.5" 
                                  fill="#ffffff" 
                                  stroke="var(--color-primary)" 
                                  strokeWidth="3.5" 
                                />
                                <text 
                                  x={p.x} 
                                  y={p.y - 12} 
                                  textAnchor="middle" 
                                  fontSize="12" 
                                  fontWeight="800" 
                                  fill="var(--color-primary-dark)"
                                >
                                  {p.score}점
                                </text>
                                <text 
                                  x={p.x} 
                                  y={padding.top + chartHeight + 20} 
                                  textAnchor="middle" 
                                  fontSize="10" 
                                  fontWeight="600"
                                  fill="var(--color-text-muted)"
                                >
                                  {p.date.substring(5)}
                                </text>
                              </g>
                            ))}
                          </svg>
                        </div>

                        <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                          <table className="custom-table" style={{ fontSize: '0.85rem' }}>
                            <thead>
                              <tr>
                                <th>날짜</th>
                                <th>테스트 명</th>
                                <th>점수</th>
                                <th>세부 평가 의견</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...studentTestLogs].reverse().map(log => (
                                <tr key={log.id}>
                                  <td style={{ whiteSpace: 'nowrap' }}>{log.date}</td>
                                  <td style={{ fontWeight: 700 }}>{log.title}</td>
                                  <td style={{ fontWeight: 800, color: 'var(--color-primary)' }}>{log.score}</td>
                                  <td style={{ color: 'var(--color-text-secondary)', whiteSpace: 'normal' }}>{log.content}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Tab 7: Monthly Progress Report */}
              {detailTab === 'report' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-primary-dark)', margin: 0 }}>
                      📋 월간 학습 성장 보고서
                    </h4>
                    
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="month"
                        value={reportMonth}
                        onChange={e => setReportMonth(e.target.value)}
                        className="form-control"
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', width: '130px', height: 'auto', margin: 0 }}
                      />
                      <button
                        onClick={handleSaveReportComment}
                        className="btn btn-primary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', gap: '0.25rem' }}
                      >
                        의견 저장
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="btn btn-secondary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', gap: '0.25rem' }}
                      >
                        📄 PDF / 인쇄
                      </button>
                    </div>
                  </div>

                  {(() => {
                    const parseScoreValue = (scoreStr?: string): number => {
                      if (!scoreStr) return 0;
                      const match = scoreStr.match(/^(\d+)/);
                      return match ? parseInt(match[1], 10) : 0;
                    };

                    const monthAttendance = attendance.filter(a => 
                      a.studentId === activeDetailStudent.id && 
                      a.date.startsWith(reportMonth)
                    );
                    const totalDays = monthAttendance.length;
                    const normalizedAttendance = monthAttendance.map(a => normalizeAttendanceStatus(a.status));
                    const presentDays = normalizedAttendance.filter(status => status === 'present').length;
                    const makeupDays = normalizedAttendance.filter(status => status === 'makeup').length;
                    const absentDays = normalizedAttendance.filter(status => status === 'absent').length;
                    const attendedDays = presentDays + makeupDays;
                    const attendanceRate = totalDays > 0 ? Math.round((attendedDays / totalDays) * 100) : 100;

                    const monthTests = counselLogs.filter(log => 
                      log.studentId === activeDetailStudent.id && 
                      log.type === 'test' && 
                      log.date.startsWith(reportMonth)
                    );
                    const testScores = monthTests.map(t => parseScoreValue(t.score));
                    const avgScore = testScores.length > 0 ? Math.round(testScores.reduce((a, b) => a + b, 0) / testScores.length) : null;

                    const studentClasses = classes.filter(c => c.studentIds.includes(activeDetailStudent.id));
                    const classNames = studentClasses.map(c => c.name).join(', ') || '배정 반 없음';

                    const [yearPart, monthPart] = reportMonth.split('-');

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {/* Comment Input Box */}
                        <div style={{ 
                          padding: '1rem', 
                          border: '1px solid var(--color-accent-mint-light)', 
                          borderRadius: 'var(--radius-md)', 
                          backgroundColor: '#f6faf8' 
                        }}>
                          <label style={{ fontWeight: 700, color: 'var(--color-primary-dark)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
                            ✍️ 원장님 종합 평가 코멘트
                          </label>
                          <textarea
                            className="form-control"
                            rows={3}
                            placeholder="이번 달 학습 진도 이해도, 수업 자세, 과제 성취도 및 단어 암기 상태 등을 상세하게 남겨주세요."
                            value={reportComment}
                            onChange={e => setReportComment(e.target.value)}
                            style={{ backgroundColor: '#ffffff', fontSize: '0.9rem', lineHeight: '1.5' }}
                          />
                        </div>

                        {/* Report Print Preview Card Sheet */}
                        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                            👀 리포트 인쇄물 미리보기 (Grey 테두리는 화면용이며 출력 시 A4 여백에 깔끔하게 맞춤)
                          </span>
                          
                          <div className="print-report-card" style={{
                            backgroundColor: '#ffffff',
                            color: '#333333',
                            border: '1px solid var(--color-border)',
                            borderRadius: '8px',
                            padding: '2rem 1.75rem',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1.5rem',
                          }}>
                            {/* Sheet Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--color-primary)', paddingBottom: '0.75rem' }}>
                              <div>
                                <span style={{ 
                                  backgroundColor: 'var(--color-primary)', 
                                  color: '#ffffff', 
                                  fontSize: '0.7rem', 
                                  fontWeight: 800, 
                                  padding: '0.15rem 0.5rem', 
                                  borderRadius: '4px',
                                  letterSpacing: '0.05em'
                                }}>
                                  GROWING ENGLISH
                                </span>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 900, margin: '0.2rem 0 0 0', color: 'var(--color-primary-dark)' }}>
                                  월간 학습 성장 보고서
                                </h2>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <div style={{ color: 'var(--color-primary)', backgroundColor: '#eaf6f0', padding: '0.35rem', borderRadius: '50%' }}>
                                  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                                  </svg>
                                </div>
                                <div style={{ textAlign: 'left' }}>
                                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-primary-dark)', lineHeight: '1.1' }}>그로잉영어</div>
                                  <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Growing English</span>
                                </div>
                              </div>
                            </div>

                            {/* Student Metadata Table */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', backgroundColor: '#f8f9fa', padding: '0.85rem', borderRadius: '6px', border: '1px solid #e9ecef', fontSize: '0.85rem' }}>
                              <div>
                                <span style={{ color: 'var(--color-text-muted)' }}>원생명:</span>{' '}
                                <strong style={{ fontSize: '0.95rem' }}>{activeDetailStudent.name}</strong>{' '}
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>({activeDetailStudent.school} / {activeDetailStudent.grade})</span>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <span style={{ color: 'var(--color-text-muted)' }}>대상월:</span>{' '}
                                <strong>{yearPart}년 {monthPart}월</strong>
                              </div>
                              <div style={{ gridColumn: 'span 2', borderTop: '1px solid #e9ecef', paddingTop: '0.35rem', marginTop: '0.35rem' }}>
                                <span style={{ color: 'var(--color-text-muted)' }}>수강반:</span>{' '}
                                <strong>{classNames}</strong>
                              </div>
                            </div>

                            {/* Section 1: Attendance */}
                            <div>
                              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary-dark)', borderLeft: '3px solid var(--color-primary)', paddingLeft: '0.5rem', marginBottom: '0.6rem' }}>
                                1. 출결 관리 현황
                              </h3>
                              
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '0.25rem 0' }}>
                                <div style={{ flexGrow: 1 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                                    <span>출석 진행률</span>
                                    <span style={{ color: 'var(--color-primary)' }}>{attendanceRate}%</span>
                                  </div>
                                  <div style={{ height: '10px', backgroundColor: '#e9ecef', borderRadius: '5px', overflow: 'hidden' }}>
                                    <div style={{ width: `${attendanceRate}%`, height: '100%', backgroundColor: 'var(--color-primary)', borderRadius: '5px' }} />
                                  </div>
                                </div>
                                <div style={{ 
                                  backgroundColor: '#f1fbf7', 
                                  border: '1px solid var(--color-accent-mint-light)', 
                                  borderRadius: '6px', 
                                  padding: '0.4rem 0.75rem', 
                                  textAlign: 'center',
                                  whiteSpace: 'nowrap'
                                }}>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>총 등원 대상</div>
                                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-primary)', lineHeight: '1.1' }}>{totalDays}회</div>
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginTop: '0.6rem', textAlign: 'center' }}>
                                <div style={{ padding: '0.4rem', backgroundColor: '#f8f9fa', borderRadius: '4px', fontSize: '0.75rem' }}>
                                  <div style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>출석</div>
                                  <strong style={{ color: 'var(--color-success)' }}>{presentDays}회</strong>
                                </div>
                                <div style={{ padding: '0.4rem', backgroundColor: '#f8f9fa', borderRadius: '4px', fontSize: '0.75rem' }}>
                                  <div style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>결석</div>
                                  <strong style={{ color: 'var(--color-danger)' }}>{absentDays}회</strong>
                                </div>
                                <div style={{ padding: '0.4rem', backgroundColor: '#f8f9fa', borderRadius: '4px', fontSize: '0.75rem' }}>
                                  <div style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>보강</div>
                                  <strong style={{ color: 'var(--color-info)' }}>{makeupDays}회</strong>
                                </div>
                              </div>
                            </div>

                            {/* Section 2: Assessment */}
                            <div>
                              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary-dark)', borderLeft: '3px solid var(--color-primary)', paddingLeft: '0.5rem', marginBottom: '0.6rem' }}>
                                2. 학습 평가 성취도
                              </h3>
                              
                              {monthTests.length === 0 ? (
                                <div style={{ padding: '1.25rem', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                  해당 월에 등록된 테스트 성적 기록이 없습니다.
                                </div>
                              ) : (
                                <div style={{ border: '1px solid #e9ecef', borderRadius: '6px', overflow: 'hidden' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                      <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '1px solid #e9ecef', textAlign: 'left' }}>
                                        <th style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-muted)' }}>평가일자</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-muted)' }}>평가 영역 및 단원</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-muted)', textAlign: 'right' }}>취득 점수</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {monthTests.map(test => (
                                        <tr key={test.id} style={{ borderBottom: '1px solid #f1f3f5' }}>
                                          <td style={{ padding: '0.5rem 0.75rem' }}>{test.date}</td>
                                          <td style={{ padding: '0.5rem 0.75rem', fontWeight: 700 }}>{test.title}</td>
                                          <td style={{ padding: '0.5rem 0.75rem', fontWeight: 800, color: 'var(--color-primary)', textAlign: 'right' }}>{test.score}</td>
                                        </tr>
                                      ))}
                                      {avgScore !== null && (
                                        <tr style={{ backgroundColor: '#fcfdfd', fontWeight: 800, borderTop: '1px solid #e9ecef' }}>
                                          <td colSpan={2} style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>평가 평균 성적:</td>
                                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--color-primary)', textAlign: 'right', fontSize: '0.9rem' }}>{avgScore}점 / 100점</td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>

                            {/* Section 3: Teacher's Review */}
                            <div>
                              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary-dark)', borderLeft: '3px solid var(--color-primary)', paddingLeft: '0.5rem', marginBottom: '0.6rem' }}>
                                3. 지도교사 종합 평가 의견
                              </h3>
                              <div style={{ 
                                border: '1px dashed var(--color-primary-light)', 
                                borderRadius: '6px', 
                                padding: '1rem', 
                                backgroundColor: '#fcfefe',
                                fontSize: '0.85rem',
                                lineHeight: '1.5',
                                color: '#495057',
                                whiteSpace: 'pre-wrap',
                                minHeight: '100px'
                              }}>
                                {reportComment.trim() || '의견이 아직 입력되지 않았습니다. 원장 의견란에 코멘트를 입력 후 저장해 주세요.'}
                              </div>
                            </div>

                            {/* Signature Footer */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', borderTop: '1px solid #e9ecef', paddingTop: '1rem' }}>
                              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                                본 보고서는 그로잉영어 프로그램의 출결 및 학업 평가 시스템을 기반으로 산출된 공식 리포트입니다.
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary-dark)' }}>
                                  그로잉영어 원장 <span style={{ fontFamily: 'serif', fontSize: '1.1rem', border: '1.5px solid #dc3545', color: '#dc3545', padding: '0.1rem 0.3rem', borderRadius: '50%', transform: 'rotate(-10deg)', display: 'inline-block', marginLeft: '0.35rem', fontWeight: 'bold' }}>🌱 인</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button
                className="btn btn-danger"
                style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
                onClick={(e) => handleWithdrawClick(activeDetailStudent, e)}
                disabled={activeDetailStudent.status === 'inactive'}
              >
                퇴원 처리
              </button>
              <button className="btn btn-primary" style={{ padding: '0.45rem 1rem' }} onClick={() => setIsDetailOpen(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
