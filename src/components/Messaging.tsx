import React, { useEffect, useMemo, useState } from 'react';
import type { Attendance, Class, CounselLog, HomeworkAlert, HomeworkStatus, KioskAlert, MessageLog, Payment, Student } from '../types';
import { Bell, Check, CheckSquare, ChevronDown, ChevronUp, Clock, Copy, Send, Sparkles, Square, Trash2 } from 'lucide-react';
import { sendAlimtalk } from '../lib/alimtalk';
import { api } from '../lib/api';
import { getStudentReportSummary } from '../lib/reportSummary';

interface MessagingProps {
  students: Student[];
  classes: Class[];
  attendance: Attendance[];
  payments: Payment[];
  counselLogs: CounselLog[];
  kioskAlerts: KioskAlert[];
  homeworkAlerts: HomeworkAlert[];
  onDismissAlert: (id: string) => void;
  onClearAlerts: () => void;
  onDismissHomeworkAlert: (id: string) => void;
  onClearHomeworkAlerts: () => void;
}

type AlertFilter = 'all' | 'in' | 'out' | 'homework' | 'missing-contact';
type PendingAlertType = 'in' | 'out' | 'homework';
type IncludeKey = 'attendance' | 'homework' | 'makeup' | 'supplementRate' | 'todayTest';

interface PendingAlertRow {
  id: string;
  source: 'kiosk' | 'homework';
  sourceId: string;
  type: PendingAlertType;
  label: string;
  badgeTone: 'ok' | 'info' | 'warn' | 'danger';
  studentId: string;
  name: string;
  contact: string;
  date: string;
  time?: string;
  message: string;
  createdAt: number;
}

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatDate = (date: string) => {
  if (!date) return '-';
  const [, month, day] = date.split('-');
  return month && day ? `${Number(month)}월 ${Number(day)}일` : date;
};

const homeworkLabel = (status?: HomeworkStatus) => {
  if (status === 'done') return '완료';
  if (status === 'incomplete') return '일부 미흡';
  if (status === 'undone') return '미제출';
  return '기록 없음';
};

const attendanceStatusLabel = (status?: Attendance['status']) => {
  if (status === 'present') return '출석';
  if (status === 'absent') return '결석';
  if (status === 'makeup') return '보강';
  if (status === 'supplement') return '보충';
  if (status === 'late') return '지각';
  return '미체크';
};

const messageLogTypeLabel: Record<string, string> = {
  check_in: '등원',
  check_out: '하원',
  homework_done: '숙제 완료',
  homework_incomplete: '숙제 미흡',
  homework_undone: '숙제 미제출',
  payment_request: '수납 안내',
  payment_paid: '수납 완료',
  exam_result: '평가 결과',
  custom: '종합알림장',
};

const buildSMSLink = (parentContact: string, message: string): string => {
  if (!parentContact) return '#';
  const cleanPhone = parentContact.replace(/[^0-9]/g, '');
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const encodedBody = encodeURIComponent(message);
  return isIOS ? `sms:${cleanPhone}&body=${encodedBody}` : `sms:${cleanPhone}?body=${encodedBody}`;
};

export const Messaging: React.FC<MessagingProps> = ({
  students,
  classes,
  attendance,
  payments,
  counselLogs,
  kioskAlerts,
  homeworkAlerts,
  onDismissAlert,
  onClearAlerts,
  onDismissHomeworkAlert,
  onClearHomeworkAlerts,
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [include, setInclude] = useState<Record<IncludeKey, boolean>>({
    attendance: true,
    homework: true,
    makeup: true,
    supplementRate: true,
    todayTest: true,
  });
  const [message, setMessage] = useState('');
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().substring(0, 7));
  const [isSending, setIsSending] = useState(false);
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('all');
  const [selectedAlertIds, setSelectedAlertIds] = useState<string[]>([]);
  const [bulkCopied, setBulkCopied] = useState(false);
  const [messageLogs, setMessageLogs] = useState<MessageLog[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);

  useEffect(() => {
    api.getMessageLogs(50).then(setMessageLogs).catch(() => {});
  }, []);

  const todayStr = useMemo(() => todayLocal(), []);
  const activeStudents = useMemo(
    () => students.filter(s => s.status === 'active').sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [students]
  );
  const currentStudent = students.find(s => s.id === selectedStudentId);

  const studentsByClass = useMemo(() => {
    const groups: Array<{ classId: string; className: string; students: Student[] }> = [];
    for (const cls of classes) {
      const members = activeStudents.filter(s => cls.studentIds.includes(s.id));
      if (members.length > 0) groups.push({ classId: cls.id, className: cls.name, students: members });
    }
    const assignedIds = new Set(classes.flatMap(c => c.studentIds));
    const unassigned = activeStudents.filter(s => !assignedIds.has(s.id));
    if (unassigned.length > 0) groups.push({ classId: '__none__', className: '반 미배정', students: unassigned });
    return groups;
  }, [activeStudents, classes]);

  const todayAttendances = useMemo(() => {
    if (!selectedStudentId) return [];
    return attendance.filter(a => a.studentId === selectedStudentId && a.date === todayStr);
  }, [attendance, selectedStudentId, todayStr]);

  const todayTests = useMemo(() => {
    if (!selectedStudentId) return [];
    return counselLogs
      .filter(log => log.studentId === selectedStudentId && log.type === 'test' && log.date === todayStr)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [counselLogs, selectedStudentId, todayStr]);

  const monthlyReport = useMemo(() => {
    if (!currentStudent) return null;
    return getStudentReportSummary({
      student: currentStudent,
      classes,
      attendance,
      payments,
      counselLogs,
      month: reportMonth,
    });
  }, [attendance, classes, counselLogs, currentStudent, payments, reportMonth]);

  const pendingRows = useMemo<PendingAlertRow[]>(() => {
    const kioskRows: PendingAlertRow[] = kioskAlerts.map(alert => {
      const student = students.find(s => s.id === alert.studentId);
      const name = student?.name ?? '알 수 없음';
      const label = alert.kind === 'in' ? '등원' : '하원';
      return {
        id: `kiosk-${alert.id}`,
        source: 'kiosk',
        sourceId: alert.id,
        type: alert.kind,
        label,
        badgeTone: alert.kind === 'in' ? 'ok' : 'info',
        studentId: alert.studentId,
        name,
        contact: student?.parentContact ?? '',
        date: alert.date,
        time: alert.time,
        message: `${name} 학생 ${alert.time} ${label}했습니다.`,
        createdAt: alert.createdAt,
      };
    });

    const homeworkRows: PendingAlertRow[] = homeworkAlerts.map(alert => {
      const student = students.find(s => s.id === alert.studentId);
      const name = student?.name ?? '알 수 없음';
      const label = `숙제 ${homeworkLabel(alert.homeworkStatus)}`;
      return {
        id: `homework-${alert.id}`,
        source: 'homework',
        sourceId: alert.id,
        type: 'homework',
        label,
        badgeTone: alert.homeworkStatus === 'done' ? 'ok' : alert.homeworkStatus === 'incomplete' ? 'warn' : 'danger',
        studentId: alert.studentId,
        name,
        contact: student?.parentContact ?? '',
        date: alert.date,
        message: `${name} 학생 숙제 상태: ${homeworkLabel(alert.homeworkStatus)}`,
        createdAt: alert.createdAt,
      };
    });

    return [...kioskRows, ...homeworkRows].sort((a, b) => b.createdAt - a.createdAt);
  }, [homeworkAlerts, kioskAlerts, students]);

  const filteredAlertRows = pendingRows.filter(row => {
    if (alertFilter === 'in') return row.type === 'in';
    if (alertFilter === 'out') return row.type === 'out';
    if (alertFilter === 'homework') return row.type === 'homework';
    if (alertFilter === 'missing-contact') return !row.contact;
    return true;
  });
  const visibleAlertIds = filteredAlertRows.map(row => row.id);
  const selectedVisibleAlertIds = selectedAlertIds.filter(id => visibleAlertIds.includes(id));
  const hasAllVisibleSelected = visibleAlertIds.length > 0 && visibleAlertIds.every(id => selectedAlertIds.includes(id));

  const todaySummary = useMemo(() => {
    const classNames = todayAttendances
      .map(a => classes.find(cls => cls.id === a.classId)?.name)
      .filter(Boolean)
      .join(', ');
    const checkIn = todayAttendances.map(a => a.checkInTime).filter(Boolean).join(', ') || '-';
    const checkOut = todayAttendances.map(a => a.checkOutTime).filter(Boolean).join(', ') || '-';
    const statuses = todayAttendances.map(a => attendanceStatusLabel(a.status)).join(', ') || '기록 없음';
    const homework = todayAttendances.map(a => homeworkLabel(a.homeworkStatus)).filter(v => v !== '기록 없음').join(', ') || '기록 없음';
    const makeup = todayAttendances
      .filter(a => a.status === 'makeup' || a.status === 'supplement' || a.supplementMinutes)
      .map(a => {
        if (a.status === 'makeup') return a.makeupForDate ? `보강 (${formatDate(a.makeupForDate)} 결석분)` : '보강';
        if (a.status === 'supplement') return `보충${a.supplementMinutes ? ` ${a.supplementMinutes}분` : ''}`;
        return `보충 ${a.supplementMinutes}분`;
      })
      .join(', ') || '없음';
    return { classNames: classNames || '-', checkIn, checkOut, statuses, homework, makeup, hasRecord: todayAttendances.length > 0 };
  }, [classes, todayAttendances]);

  const includeItems: Array<{ key: IncludeKey; label: string; meta: string }> = [
    { key: 'attendance', label: '출결', meta: todaySummary.statuses },
    { key: 'homework', label: '숙제', meta: todaySummary.homework },
    { key: 'makeup', label: '보강/보충', meta: todaySummary.makeup },
    {
      key: 'supplementRate',
      label: '다른 학생 대비 보충률',
      meta: monthlyReport ? `${monthlyReport.attendance.supplementRate}% / 평균 ${monthlyReport.attendance.peerSupplementRate}%` : '-',
    },
    { key: 'todayTest', label: '그날 시험 결과', meta: todayTests.length ? `${todayTests.length}건` : '없음' },
  ];

  const buildNotice = () => {
    if (!currentStudent) return '';
    const lines = [
      '안녕하세요, 그로잉영어입니다.',
      '',
      `${currentStudent.name} 학생의 ${formatDate(todayStr)} 수업 내용을 안내드립니다.`,
      '',
    ];

    if (include.attendance) {
      lines.push('[출결]');
      lines.push(`- 수업: ${todaySummary.classNames}`);
      lines.push(`- 상태: ${todaySummary.statuses}`);
      lines.push(`- 등원: ${todaySummary.checkIn}`);
      lines.push(`- 하원: ${todaySummary.checkOut}`);
      lines.push('');
    }

    if (include.homework) {
      lines.push('[숙제]');
      lines.push(`- ${todaySummary.homework}`);
      lines.push('');
    }

    if (include.makeup && todaySummary.makeup !== '없음') {
      lines.push('[보강/보충]');
      lines.push(`- ${todaySummary.makeup}`);
      lines.push('');
    }

    if (include.supplementRate && monthlyReport) {
      const diff = monthlyReport.attendance.supplementRateDelta;
      const comparison = diff > 0
        ? `다른 학생 평균보다 ${diff}%p 높습니다.`
        : diff < 0
          ? `다른 학생 평균보다 ${Math.abs(diff)}%p 낮습니다.`
          : '다른 학생 평균과 같습니다.';
      lines.push('[보충률]');
      lines.push(`- ${reportMonth} 보충률: ${monthlyReport.attendance.supplementRate}%`);
      lines.push(`- 다른 학생 평균: ${monthlyReport.attendance.peerSupplementRate}%`);
      lines.push(`- 비교: ${comparison}`);
      if (diff > 0) lines.push('- 부족한 부분이 평균보다 많은 편이라 가정에서도 한 번 더 확인 부탁드립니다.');
      lines.push('');
    }

    if (include.todayTest && todayTests.length > 0) {
      lines.push('[시험 결과]');
      todayTests.forEach(test => {
        const score = test.score ? ` (${test.score})` : '';
        lines.push(`- ${test.title}${score}: ${test.content}`);
      });
      lines.push('');
    }

    lines.push('가정에서도 확인 부탁드립니다. 감사합니다.');
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  };

  const handleGenerate = () => {
    const draft = buildNotice();
    if (draft) setMessage(draft);
  };

  const handleSendComprehensiveAlimtalk = async () => {
    if (!currentStudent || !currentStudent.parentContact || !message.trim()) return;
    setIsSending(true);
    try {
      await sendAlimtalk({
        studentId: currentStudent.id,
        alertType: 'custom',
        recipientPhone: currentStudent.parentContact,
        recipientName: currentStudent.name,
        subject: `그로잉영어 ${currentStudent.name} 학생 종합알림장`,
        message,
        fallbackMessage: message,
      });
      const logs = await api.getMessageLogs(50).catch(() => messageLogs);
      setMessageLogs(logs);
      alert('종합알림장 발송을 요청했어요.');
    } catch (error) {
      alert(error instanceof Error ? error.message : '종합알림장 발송에 실패했어요.');
    } finally {
      setIsSending(false);
    }
  };

  const toggleInclude = (key: IncludeKey) => setInclude(prev => ({ ...prev, [key]: !prev[key] }));

  const toggleAlertSelection = (id: string) => {
    setSelectedAlertIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);
  };

  const toggleAllVisibleAlerts = () => {
    setSelectedAlertIds(ids => {
      if (hasAllVisibleSelected) return ids.filter(id => !visibleAlertIds.includes(id));
      return Array.from(new Set([...ids, ...visibleAlertIds]));
    });
  };

  const handleCopySelectedAlerts = () => {
    const selectedRows = pendingRows.filter(row => selectedAlertIds.includes(row.id));
    if (selectedRows.length === 0) return;
    const text = selectedRows.map(row => `[${row.label}] ${row.message}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setBulkCopied(true);
      setTimeout(() => setBulkCopied(false), 2000);
    });
  };

  const dismissPendingRow = (row: PendingAlertRow) => {
    if (row.source === 'homework') onDismissHomeworkAlert(row.sourceId);
    else onDismissAlert(row.sourceId);
  };

  const handleDismissSelectedAlerts = () => {
    pendingRows.filter(row => selectedAlertIds.includes(row.id)).forEach(dismissPendingRow);
    setSelectedAlertIds([]);
  };

  const handleClearPendingAlerts = () => {
    onClearHomeworkAlerts();
    onClearAlerts();
    setSelectedAlertIds([]);
  };

  return (
    <div className="gd-root msg-pro">
      <section className="msg-hero">
        <div>
          <span className="msg-eyebrow">Parent Notice</span>
          <h2>종합알림장</h2>
          <p>출결, 숙제, 보강/보충, 보충률 비교, 시험 결과만 모아 학부모 안내문을 만듭니다.</p>
        </div>
        <button className="pay-btn primary" disabled={!currentStudent} onClick={handleGenerate}>
          <Sparkles size={15} /> 초안 만들기
        </button>
      </section>

      <div className="msg-compose-grid">
        <section className="gd-card msg-panel">
          <div className="msg-section-title">대상 학생</div>
          <select className="msg-select" value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)}>
            <option value="">학생을 선택하세요</option>
            {studentsByClass.map(group => (
              <optgroup key={group.classId} label={group.className}>
                {group.students.map(student => (
                  <option key={student.id} value={student.id}>
                    {student.name} ({student.grade.split(' ')[1] || student.grade})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {currentStudent && (
            <div className="msg-summary-grid">
              <div><span>출결</span><b>{todaySummary.statuses}</b></div>
              <div><span>숙제</span><b>{todaySummary.homework}</b></div>
              <div><span>보강/보충</span><b>{todaySummary.makeup}</b></div>
              <div><span>시험</span><b>{todayTests.length ? `${todayTests.length}건` : '없음'}</b></div>
            </div>
          )}

          <div className="msg-section-row">
            <div className="msg-section-title">포함 항목</div>
            <input
              type="month"
              className="msg-month"
              value={reportMonth}
              onChange={e => setReportMonth(e.target.value)}
              aria-label="보충률 기준 월"
            />
          </div>

          <div className="msg-include-list">
            {includeItems.map(item => (
              <button key={item.key} className={`msg-include ${include[item.key] ? 'on' : ''}`} onClick={() => toggleInclude(item.key)}>
                <span className="msg-include-icon">{include[item.key] ? <CheckSquare size={16} /> : <Square size={16} />}</span>
                <span><b>{item.label}</b><em>{item.meta}</em></span>
              </button>
            ))}
          </div>
        </section>

        <section className="gd-card msg-preview-pro">
          <div className="msg-section-row">
            <div className="msg-section-title">미리보기</div>
            {currentStudent && <span className="msg-contact">학부모 연락처 {currentStudent.parentContact || '없음'}</span>}
          </div>
          <textarea
            className="msg-draft-box"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="학생을 선택하고 초안을 만들어 주세요."
          />
          <div className="msg-send">
            {currentStudent?.parentContact ? (
              <a href={buildSMSLink(currentStudent.parentContact, message)} className="pay-btn ghost" style={{ textDecoration: 'none', pointerEvents: message.trim() ? 'auto' : 'none', opacity: message.trim() ? 1 : 0.5 }}>
                <Send size={15} /> 문자로 열기
              </a>
            ) : (
              <button className="pay-btn ghost" disabled><Send size={15} /> 연락처 필요</button>
            )}
            <button className="pay-btn primary" onClick={() => void handleSendComprehensiveAlimtalk()} disabled={!currentStudent?.parentContact || !message.trim() || isSending}>
              <Send size={15} /> {isSending ? '발송 요청 중' : '알림톡 보내기'}
            </button>
          </div>
        </section>
      </div>

      {pendingRows.length > 0 && (
        <section className="gd-card msg-queue" style={{ marginTop: '1.15rem' }}>
          <div className="gd-card-head">
            <h2 className="gd-card-title">
              <Bell size={18} /> 알림 대기 재료 <span className="cl-count">{pendingRows.length}건</span>
            </h2>
            <div className="msg-q-actions">
              <button className="pay-btn ghost sm" onClick={handleCopySelectedAlerts} disabled={selectedAlertIds.length === 0}>
                {bulkCopied ? <><Check size={13} /> 선택 복사됨</> : <><Copy size={13} /> 선택 복사</>}
              </button>
              <button className="pay-btn ghost sm" onClick={handleDismissSelectedAlerts} disabled={selectedAlertIds.length === 0}>
                <Check size={13} /> 선택 완료
              </button>
              <button className="pay-btn ghost sm" onClick={handleClearPendingAlerts}>
                <Trash2 size={13} /> 전체 비우기
              </button>
            </div>
          </div>

          <div className="msg-filters">
            {([
              ['all', `전체 ${pendingRows.length}`],
              ['in', `등원 ${pendingRows.filter(row => row.type === 'in').length}`],
              ['out', `하원 ${pendingRows.filter(row => row.type === 'out').length}`],
              ['homework', `숙제 ${pendingRows.filter(row => row.type === 'homework').length}`],
              ['missing-contact', `연락처 없음 ${pendingRows.filter(row => !row.contact).length}`],
            ] as Array<[AlertFilter, string]>).map(([value, label]) => (
              <button key={value} className={`at-chip ${alertFilter === value ? 'on' : ''}`} onClick={() => setAlertFilter(value)}>
                {label}
              </button>
            ))}
            <button className="at-chip" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }} onClick={toggleAllVisibleAlerts} disabled={visibleAlertIds.length === 0}>
              {hasAllVisibleSelected ? <CheckSquare size={13} /> : <Square size={13} />}
              보이는 알림 선택
            </button>
          </div>

          <div className="msg-q-empty" style={{ border: 'none', background: 'none', padding: '0 0 0.6rem', textAlign: 'left' }}>
            현재 {filteredAlertRows.length}건 표시 · {selectedVisibleAlertIds.length}건 선택됨
          </div>

          <div className="msg-qlist">
            {filteredAlertRows.map(row => (
              <div className={`msg-qrow ${selectedAlertIds.includes(row.id) ? 'sel' : ''}`} key={row.id}>
                <button className="msg-check" onClick={() => toggleAlertSelection(row.id)} aria-label={`${row.name} 알림 선택`}>
                  <span className={`msg-box ${selectedAlertIds.includes(row.id) ? 'on' : ''}`}>
                    {selectedAlertIds.includes(row.id) && <Check size={12} />}
                  </span>
                </button>
                <span className={`at-pill ${row.badgeTone}`}>{row.label}</span>
                <span className="msg-qname">{row.name}</span>
                <span className="msg-qtime">{row.time ?? row.date}</span>
                <span className={`msg-qcontact ${row.contact ? '' : 'none'}`}>
                  {row.contact ? row.contact : '연락처 없음'}
                </span>
                <div className="msg-qbtns">
                  <button className="at-act" onClick={() => dismissPendingRow(row)}>완료</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="gd-card" style={{ marginTop: '1.15rem' }}>
        <button className="msg-log-toggle" onClick={() => setLogsOpen(o => !o)}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Clock size={16} /> 알림톡 발송 기록
            {messageLogs.length > 0 && <span className="cl-count">{messageLogs.length}건</span>}
          </span>
          {logsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {logsOpen && (
          messageLogs.length === 0 ? (
            <div className="gd-empty" style={{ padding: '1.5rem 0' }}>
              <span>발송 기록이 없습니다.</span>
            </div>
          ) : (
            <div className="table-wrapper" style={{ marginTop: '0.75rem' }}>
              <table className="custom-table" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th>날짜/시간</th>
                    <th>수신자</th>
                    <th>유형</th>
                    <th>상태</th>
                    <th>내용</th>
                  </tr>
                </thead>
                <tbody>
                  {messageLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
                        {log.createdAt.slice(0, 16).replace('T', ' ')}
                      </td>
                      <td>{log.recipientName ?? log.recipientPhone}</td>
                      <td>{messageLogTypeLabel[log.alertType] ?? log.alertType}</td>
                      <td>
                        <span className={`at-pill ${log.status === 'sent' ? 'ok' : log.status === 'failed' ? 'danger' : 'warn'}`}>
                          {log.status === 'sent' ? '발송' : log.status === 'failed' ? '실패' : '대기'}
                        </span>
                      </td>
                      <td style={{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
                        {log.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
    </div>
  );
};
