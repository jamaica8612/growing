import React, { useState } from 'react';
import type { Student, Class, Attendance, Payment, CounselLog, StudentStatus } from '../types';
import { UserPlus, Search, Edit2, Trash2, Eye, X, PlusCircle, Calendar, User, GraduationCap, Phone } from 'lucide-react';

interface StudentsProps {
  students: Student[];
  classes: Class[];
  attendance: Attendance[];
  payments: Payment[];
  counselLogs: CounselLog[];
  onAddStudent: (student: Omit<Student, 'id'>) => void;
  onUpdateStudent: (student: Student) => void;
  onDeleteStudent: (id: string) => void;
  onAddCounselLog: (log: Omit<CounselLog, 'id'>) => void;
}

export const Students: React.FC<StudentsProps> = ({
  students,
  classes,
  attendance,
  payments,
  counselLogs,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onAddCounselLog,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StudentStatus | 'all'>('active');
  const [gradeFilter, setGradeFilter] = useState('all');

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [activeDetailStudent, setActiveDetailStudent] = useState<Student | null>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'classes' | 'attendance' | 'payments' | 'counsel'>('info');

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

  // Delete handler
  const handleDeleteClick = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`정말로 ${name} 학생을 삭제하시겠습니까?\n삭제 시 출결 및 원비 기록이 유지되지 않을 수 있습니다.`)) {
      onDeleteStudent(id);
      if (activeDetailStudent?.id === id) {
        setIsDetailOpen(false);
      }
    }
  };

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

    return matchesSearch && matchesStatus && matchesGrade;
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
    const attended = records.filter(r => r.status === 'present' || r.status === 'late' || r.status === 'makeup').length;
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

          <button className="btn btn-primary" onClick={handleOpenAdd}>
            <UserPlus size={16} /> 학생 등록
          </button>
        </div>
      </div>

      {/* Students Table */}
      <div className="table-wrapper">
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
                      <div style={{ fontSize: '0.9rem' }}>{student.school || '-'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{student.grade}</div>
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
                      <span className={`badge ${student.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                        {student.status === 'active' ? '재원' : '퇴원'}
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
                        <button
                          className="btn-icon-only text-danger"
                          title="삭제"
                          onClick={e => handleDeleteClick(student.id, student.name, e)}
                        >
                          <Trash2 size={16} style={{ color: 'var(--color-danger)' }} />
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
                    <span className={`badge ${activeDetailStudent.status === 'active' ? 'badge-active' : 'badge-inactive'}`} style={{ fontSize: '0.7rem' }}>
                      {activeDetailStudent.status === 'active' ? '재원생' : '퇴원생'}
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
                              🗓 요일: {cls.days.join(', ')} | 🕒 시간: {cls.startTime} - {cls.endTime}
                            </div>
                          </div>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-primary)' }}>
                            월 {cls.tuitionFee.toLocaleString()}원
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
                                    att.status === 'late' ? 'badge-late' : 'badge-makeup'
                                  }`} style={{ fontSize: '0.65rem' }}>
                                    {att.status === 'present' ? '출석' :
                                     att.status === 'absent' ? '결석' :
                                     att.status === 'late' ? '지각' : '보강'}
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
                            onChange={e => setLogType(e.target.value as any)}
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
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button
                className="btn btn-danger"
                style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
                onClick={(e) => handleDeleteClick(activeDetailStudent.id, activeDetailStudent.name, e)}
              >
                학생 삭제
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
