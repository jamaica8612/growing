import React, { useState } from 'react';
import type { Student, Class, Attendance, AttendanceStatus, HomeworkStatus } from '../types';
import { Calendar, Clock, Save, MessageSquare, Send, Check } from 'lucide-react';

interface AttendanceProps {
  attendance: Attendance[];
  students: Student[];
  classes: Class[];
  onSaveAttendance: (attendanceData: Omit<Attendance, 'id'> & { memo?: string }) => void;
}

export const AttendanceManager: React.FC<AttendanceProps> = ({
  attendance,
  students,
  classes,
  onSaveAttendance,
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [attendanceMemos, setAttendanceMemos] = useState<{ [key: string]: string }>({});
  const [copiedStatusKey, setCopiedStatusKey] = useState<string | null>(null);

  // Compile Homework Message Template
  const getHomeworkMessage = (studentName: string, status: HomeworkStatus): string => {
    const prefix = `안녕하세요, 그로잉영어입니다. 🌱\n\n오늘 ${studentName} 학생은 `;
    if (status === 'done') {
      return prefix + `부여된 영어 숙제와 단어 암기 준비를 아주 성실하게 잘 완료하고 수업에 참여하였습니다. 대견한 모습에 가정에서도 많은 칭찬과 격려 부탁드립니다. 감사합니다.`;
    } else if (status === 'incomplete') {
      return prefix + `영어 숙제 및 단어 준비가 다소 부족(일부 미완료)한 상태로 등원하였습니다. 교습소에서 개별 보완 지도를 실시하였으나, 가정에서도 학습 습관이 유지되도록 남은 과제를 챙겨주시기를 부탁드립니다.`;
    } else if (status === 'undone') {
      return prefix + `영어 숙제 및 단어 암기 준비가 전혀 되어있지 않았습니다. 학업 연속성을 위해 과제 수행이 필수적이오니, 가정에서도 숙제를 반드시 완료해서 보낼 수 있도록 각별한 지도 협조를 부탁드립니다.`;
    }
    return '';
  };

  // Copy Homework status notification for KakaoTalk
  const handleCopyHomeworkMessage = (studentName: string, status: HomeworkStatus, key: string) => {
    const msg = getHomeworkMessage(studentName, status);
    if (!msg) return;
    navigator.clipboard.writeText(msg).then(() => {
      setCopiedStatusKey(key);
      setTimeout(() => setCopiedStatusKey(null), 2000);
    });
  };

  // Open SMS client directly for mobile
  const getSMSLink = (parentContact: string, studentName: string, status: HomeworkStatus): string => {
    const msg = getHomeworkMessage(studentName, status);
    if (!msg || !parentContact) return '#';
    const cleanPhone = parentContact.replace(/[^0-9]/g, '');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const encodedBody = encodeURIComponent(msg);
    return isIOS ? `sms:${cleanPhone}&body=${encodedBody}` : `sms:${cleanPhone}?body=${encodedBody}`;
  };

  // Handle homework update
  const handleHomeworkChange = (studentId: string, classId: string, homeworkStatus: HomeworkStatus) => {
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    const status = record?.status || 'present'; // Default to present if homework is checked
    const memo = record?.memo || '';
    onSaveAttendance({
      studentId,
      classId,
      date: selectedDate,
      status,
      memo,
      homeworkStatus,
    });
  };
  
  // Month filter for monthly report (defaults to current month YYYY-MM)
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().substring(0, 7));

  // Find attendance record for a student on a specific date for a class
  const getAttendanceRecord = (studentId: string, classId: string, date: string): Attendance | undefined => {
    return attendance.find(
      a => a.studentId === studentId && a.classId === classId && a.date === date
    );
  };

  // Handle status update
  const handleStatusChange = (studentId: string, classId: string, status: AttendanceStatus) => {
    const currentMemo = attendanceMemos[`${studentId}-${classId}`] || '';
    onSaveAttendance({
      studentId,
      classId,
      date: selectedDate,
      status,
      memo: currentMemo,
    });
  };

  // Handle memo input change
  const handleMemoChange = (studentId: string, classId: string, memo: string) => {
    setAttendanceMemos(prev => ({
      ...prev,
      [`${studentId}-${classId}`]: memo,
    }));
  };

  // Save memo manually
  const handleSaveMemo = (studentId: string, classId: string) => {
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    const memoText = attendanceMemos[`${studentId}-${classId}`] || '';
    
    if (record) {
      onSaveAttendance({
        studentId,
        classId,
        date: selectedDate,
        status: record.status,
        memo: memoText,
      });
      alert('비고 메모가 저장되었습니다.');
    } else {
      alert('먼저 출석 상태(출석, 결석 등)를 선택해 주세요.');
    }
  };

  // Filter students belonging to the selected class
  const getTargetStudents = (): { student: Student; class: Class }[] => {
    const list: { student: Student; class: Class }[] = [];
    
    classes.forEach(cls => {
      if (selectedClassId === 'all' || cls.id === selectedClassId) {
        cls.studentIds.forEach(sid => {
          const student = students.find(s => s.id === sid);
          if (student && student.status === 'active') {
            list.push({ student, class: cls });
          }
        });
      }
    });

    return list;
  };

  const targetList = getTargetStudents();

  // Monthly Report Calculations
  const getMonthlyReportData = () => {
    const reportData: {
      [studentId: string]: {
        name: string;
        school: string;
        grade: string;
        present: number;
        absent: number;
        late: number;
        makeup: number;
        total: number;
      };
    } = {};

    // Initialize active students
    students.filter(s => s.status === 'active').forEach(s => {
      reportData[s.id] = {
        name: s.name,
        school: s.school,
        grade: s.grade,
        present: 0,
        absent: 0,
        late: 0,
        makeup: 0,
        total: 0,
      };
    });

    // Filter attendance by selected month
    attendance
      .filter(a => a.date.startsWith(reportMonth))
      .forEach(a => {
        if (reportData[a.studentId]) {
          reportData[a.studentId][a.status]++;
          reportData[a.studentId].total++;
        }
      });

    return Object.values(reportData);
  };

  const monthlyReport = getMonthlyReportData();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Attendance Check Board */}
      <div className="card">
        <h3 className="card-title">
          <Calendar size={20} className="text-primary" /> 일자별 출결 기록
        </h3>

        {/* Date and Class Selector Header */}
        <div className="filter-bar" style={{ backgroundColor: '#fafbfc', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>출결 기준 날짜</label>
              <input
                type="date"
                className="form-control"
                style={{ width: '180px' }}
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>클래스 필터</label>
              <select
                className="form-control"
                style={{ width: '220px' }}
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
              >
                <option value="all">전체 클래스보기</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', textAlign: 'right' }}>
            💡 상태 버튼을 누르면 즉시 자동 저장됩니다.
          </div>
        </div>

        {/* Attendance Sheet */}
        <div className="table-wrapper">
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '90px' }}>이름</th>
                <th style={{ width: '150px' }}>반 / 학교 / 학년</th>
                <th style={{ width: '220px' }}>출결 체크</th>
                <th style={{ width: '180px' }}>숙제 체크</th>
                <th style={{ width: '120px', textAlign: 'center' }}>학부모 알림</th>
                <th>비고 (메모 입력)</th>
                <th style={{ width: '50px', textAlign: 'center' }}>저장</th>
              </tr>
            </thead>
            <tbody>
              {targetList.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-secondary)' }}>
                    🌱 이 조건으로 활성화된 원생이 없습니다. [반/시간표 관리]에서 수강 학생을 지정해 주세요.
                  </td>
                </tr>
              ) : (
                targetList.map(({ student, class: cls }) => {
                  const record = getAttendanceRecord(student.id, cls.id, selectedDate);
                  const currentStatus = record?.status;
                  const currentHomework = record?.homeworkStatus || '';
                  const memoKey = `${student.id}-${cls.id}`;
                  
                  // Initialize local memo state if there's a record but not yet in temporary input state
                  if (record?.memo && attendanceMemos[memoKey] === undefined) {
                    attendanceMemos[memoKey] = record.memo;
                  }

                  return (
                    <tr key={`${student.id}-${cls.id}`}>
                      <td style={{ fontWeight: 700, color: 'var(--color-primary-dark)' }}>{student.name}</td>
                      <td style={{ fontSize: '0.8rem', lineHeight: '1.35' }}>
                        <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{cls.name}</div>
                        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                          {student.school || '교습소'} • {student.grade.split(' ')[1] || student.grade}
                        </div>
                      </td>
                      <td>
                        <div className="quick-att-buttons">
                          <button
                            className={`btn-att-select ${currentStatus === 'present' ? 'active-present' : ''}`}
                            onClick={() => handleStatusChange(student.id, cls.id, 'present')}
                          >
                            출석
                          </button>
                          <button
                            className={`btn-att-select ${currentStatus === 'absent' ? 'active-absent' : ''}`}
                            onClick={() => handleStatusChange(student.id, cls.id, 'absent')}
                          >
                            결석
                          </button>
                          <button
                            className={`btn-att-select ${currentStatus === 'late' ? 'active-late' : ''}`}
                            onClick={() => handleStatusChange(student.id, cls.id, 'late')}
                          >
                            지각
                          </button>
                          <button
                            className={`btn-att-select ${currentStatus === 'makeup' ? 'active-makeup' : ''}`}
                            onClick={() => handleStatusChange(student.id, cls.id, 'makeup')}
                          >
                            보강
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="quick-att-buttons">
                          <button
                            className={`btn-att-select ${currentHomework === 'done' ? 'active-present' : ''}`}
                            onClick={() => handleHomeworkChange(student.id, cls.id, 'done')}
                          >
                            완료
                          </button>
                          <button
                            className={`btn-att-select ${currentHomework === 'incomplete' ? 'active-late' : ''}`}
                            onClick={() => handleHomeworkChange(student.id, cls.id, 'incomplete')}
                          >
                            미흡
                          </button>
                          <button
                            className={`btn-att-select ${currentHomework === 'undone' ? 'active-absent' : ''}`}
                            onClick={() => handleHomeworkChange(student.id, cls.id, 'undone')}
                          >
                            안함
                          </button>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {currentHomework ? (
                          <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', gap: '0.2rem', minWidth: 'auto', margin: 0, display: 'inline-flex', alignItems: 'center' }}
                              onClick={() => handleCopyHomeworkMessage(student.name, currentHomework, memoKey)}
                              title="카톡 메시지 본문 복사"
                            >
                              {copiedStatusKey === memoKey ? (
                                <Check size={12} className="text-success" />
                              ) : (
                                <MessageSquare size={12} className="text-secondary" />
                              )}
                              카톡
                            </button>
                            {student.parentContact ? (
                              <a
                                href={getSMSLink(student.parentContact, student.name, currentHomework)}
                                className="btn btn-primary"
                                style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', gap: '0.2rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minWidth: 'auto', margin: 0 }}
                                title="학부모에게 문자(SMS) 즉시 전송"
                              >
                                <Send size={12} />
                                문자
                              </a>
                            ) : (
                              <button
                                className="btn btn-primary"
                                disabled
                                style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', gap: '0.2rem', opacity: 0.5, minWidth: 'auto', margin: 0, display: 'inline-flex', alignItems: 'center' }}
                                title="연락처 없음"
                              >
                                <Send size={12} />
                                문자
                              </button>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>체크 대기</span>
                        )}
                      </td>
                      <td>
                        <input
                          type="text"
                          className="form-control"
                          style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                          placeholder="특이사항 메모 입력 (예: 감기 조퇴...)"
                          value={attendanceMemos[memoKey] || ''}
                          onChange={e => handleMemoChange(student.id, cls.id, e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn-icon-only"
                          title="메모 저장"
                          onClick={() => handleSaveMemo(student.id, cls.id)}
                        >
                          <Save size={16} className="text-primary" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Attendance Report Sheet */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h3 className="card-title" style={{ marginBottom: 0 }}>
            <Clock size={20} className="text-primary" /> 월간 출결 통계 및 리포트
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>조회 연월:</span>
            <input
              type="month"
              className="form-control"
              style={{ width: '160px', padding: '0.35rem 0.65rem' }}
              value={reportMonth}
              onChange={e => setReportMonth(e.target.value)}
            />
          </div>
        </div>

        <div className="table-wrapper">
          <table className="custom-table" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th>학생 이름</th>
                <th>학교 / 학년</th>
                <th style={{ textAlign: 'center', color: 'var(--color-success)' }}>출석 (Present)</th>
                <th style={{ textAlign: 'center', color: 'var(--color-warning)' }}>지각 (Late)</th>
                <th style={{ textAlign: 'center', color: 'var(--color-danger)' }}>결석 (Absent)</th>
                <th style={{ textAlign: 'center', color: 'var(--color-info)' }}>보강 (Makeup)</th>
                <th style={{ textAlign: 'center', fontWeight: 700 }}>출결 진행률</th>
              </tr>
            </thead>
            <tbody>
              {monthlyReport.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                    등록된 재원생이 없습니다.
                  </td>
                </tr>
              ) : (
                monthlyReport.map(row => {
                  const attended = row.present + row.late + row.makeup;
                  const rate = row.total > 0 ? Math.round((attended / row.total) * 100) : 100;
                  return (
                    <tr key={row.name}>
                      <td style={{ fontWeight: 700 }}>{row.name}</td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{row.school} {row.grade.split(' ')[1] || row.grade}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--color-success)' }}>{row.present}회</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--color-warning)' }}>{row.late}회</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--color-danger)' }}>{row.absent}회</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--color-info)' }}>{row.makeup}회</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                          <span style={{ fontWeight: 700 }}>{rate}%</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>({row.total}일 중 {attended}일)</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
