import React, { useEffect, useMemo, useState } from 'react';
import type { Attendance, Class, CounselLog, HomeworkAlert, HomeworkStatus, KioskAlert, MessageLog, Payment, Student } from '../types';
import { Bell, Check, CheckSquare, ChevronDown, ChevronUp, Clock, Copy, MessageSquare, Send, Sparkles, Square, Trash2 } from 'lucide-react';
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
  assistantDraft?: {
    id: number;
    content: string;
  } | null;
}

type AlertFilter = 'all' | 'in' | 'out' | 'homework' | 'missing-contact';
type PendingAlertType = 'in' | 'out' | 'homework';
type IncludeKey = 'attendance' | 'homework' | 'makeup' | 'monthlyReport' | 'recentLogs' | 'studentMemo' | 'assistantDraft' | 'queuedAlerts';

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

const logTypeLabel: Record<CounselLog['type'], string> = {
  counsel: '상담',
  progress: '진도',
  test: '평가',
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

const findDraftStudentId = (students: Student[], draft?: string): string => {
  if (!draft) return '';
  const activeMatches = students
    .filter(s => s.status === 'active' && s.name && draft.includes(s.name))
    .sort((a, b) => b.name.length - a.name.length);
  if (activeMatches.length !== 1) return '';
  return activeMatches[0].id;
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
  assistantDraft,
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState(() => findDraftStudentId(students, assistantDraft?.content));
  const [include, setInclude] = useState<Record<IncludeKey, boolean>>({
    attendance: true,
    homework: true,
    makeup: true,
    monthlyReport: false,
    recentLogs: true,
    studentMemo: false,
    assistantDraft: Boolean(assistantDraft?.content),
    queuedAlerts: true,
  });
  const [message, setMessage] = useState(() => assistantDraft?.content ?? '');
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

  const activeStudents = useMemo(
    () => students.filter(s => s.status === 'active').sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [students]
  );

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
  }, [classes, activeStudents]);

  const currentStudent = students.find(s => s.id === selectedStudentId);
  const todayStr = useMemo(() => todayLocal(), []);

  const todayAttendances = useMemo(() => {
    if (!selectedStudentId) return [];
    return attendance.filter(a => a.studentId === selectedStudentId && a.date === todayStr);
  }, [attendance, selectedStudentId, todayStr]);

  const recentLogs = useMemo(() => {
    if (!selectedStudentId) return [];
    return counselLogs
      .filter(log => log.studentId === selectedStudentId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3);
  }, [counselLogs, selectedStudentId]);

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
      const kindLabel = alert.kind === 'in' ? '등원' : '하원';
      return {
        id: `kiosk-${alert.id}`,
        source: 'kiosk',
        sourceId: alert.id,
        type: alert.kind,
        label: kindLabel,
        badgeTone: alert.kind === 'in' ? 'ok' : 'info',
        studentId: alert.studentId,
        name,
        contact: student?.parentContact ?? '',
        date: alert.date,
        time: alert.time,
        message: `${name} 학생 ${alert.time} ${kindLabel}했습니다.`,
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
  }, [kioskAlerts, homeworkAlerts, students]);

  const studentPendingRows = pendingRows.filter(row => row.studentId === selectedStudentId);
  const selectedQueuedRows = studentPendingRows.filter(row => selectedAlertIds.includes(row.id));

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

  const buildComprehensiveNotice = () => {
    if (!currentStudent) return '';
    const lines = [
      `안녕하세요, 그로잉영어입니다.`,
      ``,
      `${currentStudent.name} 학생의 ${formatDate(todayStr)} 수업 내용을 안내드립니다.`,
      ``,
    ];

    if (include.attendance) {
      lines.push(`[출결]`);
      lines.push(`- 수업: ${todaySummary.classNames}`);
      lines.push(`- 상태: ${todaySummary.statuses}`);
      lines.push(`- 등원: ${todaySummary.checkIn}`);
      lines.push(`- 하원: ${todaySummary.checkOut}`);
      lines.push(``);
    }

    if (include.homework) {
      lines.push(`[숙제]`);
      lines.push(`- ${todaySummary.homework}`);
      lines.push(``);
    }

    if (include.makeup && todaySummary.makeup !== '없음') {
      lines.push(`[보강/보충]`);
      lines.push(`- ${todaySummary.makeup}`);
      lines.push(``);
    }

    if (include.monthlyReport && monthlyReport) {
      const diff = monthlyReport.attendance.supplementRateDelta;
      const comparison = diff > 0
        ? `다른 학생 평균보다 ${diff}%p 높습니다.`
        : diff < 0
          ? `다른 학생 평균보다 ${Math.abs(diff)}%p 낮습니다.`
          : '다른 학생 평균과 같습니다.';
      lines.push(`[월말 학습 현황]`);
      lines.push(`- 대상 월: ${reportMonth}`);
      lines.push(`- 출석률: ${monthlyReport.attendance.rate}%`);
      lines.push(`- 보충률: ${monthlyReport.attendance.supplementRate}% (다른 학생 평균 ${monthlyReport.attendance.peerSupplementRate}%, ${comparison})`);
      lines.push(`- 숙제: 완료 ${monthlyReport.homework.done}회, 미흡 ${monthlyReport.homework.incomplete}회, 미제출 ${monthlyReport.homework.undone}회`);
      if (diff > 0) {
        lines.push(`- 보충이 평균보다 많은 편이라 부족한 부분을 가정에서도 함께 확인해 주시면 좋겠습니다.`);
      }
      lines.push(``);
    }

    if (include.recentLogs && recentLogs.length > 0) {
      lines.push(`[최근 기록]`);
      recentLogs.forEach(log => {
        const score = log.score ? ` (${log.score})` : '';
        lines.push(`- ${formatDate(log.date)} ${logTypeLabel[log.type]} · ${log.title}${score}: ${log.content}`);
      });
      lines.push(``);
    }

    if (include.studentMemo && currentStudent.memo.trim()) {
      lines.push(`[참고 메모]`);
      lines.push(currentStudent.memo.trim());
      lines.push(``);
    }

    if (include.queuedAlerts && selectedQueuedRows.length > 0) {
      lines.push(`[오늘 확인할 알림]`);
      selectedQueuedRows.forEach(row => lines.push(`- ${row.message}`));
      lines.push(``);
    }

    if (include.assistantDraft && assistantDraft?.content?.trim()) {
      lines.push(`[추가 안내]`);
      lines.push(assistantDraft.content.trim());
      lines.push(``);
    }

    lines.push(`가정에서도 확인 부탁드립니다. 감사합니다.`);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  };

  const handleGenerate = () => {
    const draft = buildComprehensiveNotice();
    if (!draft) return;
    setMessage(draft);
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

  const toggleInclude = (key: IncludeKey) => {
    setInclude(prev => ({ ...prev, [key]: !prev[key] }));
  };

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
    <div className="gd-root">
      <section className="gd-card" style={{ marginBottom: '1.15rem' }}>
        <div className="gd-card-head">
          <h2 className="gd-card-title">
            <MessageSquare size={18} /> 종합알림장 작성
          </h2>
          <span className="cl-count">출결·숙제·보강·평가·상담 통합</span>
        </div>

        <div className="msg-main">
          <div>
            <label className="msg-label">대상 학생</label>
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
              <div className="msg-today">
                <div><b>수업</b> {todaySummary.classNames}</div>
                <div><b>출결</b> {todaySummary.statuses}</div>
                <div><b>등원</b> {todaySummary.checkIn}</div>
                <div><b>하원</b> {todaySummary.checkOut}</div>
                <div><b>숙제</b> {todaySummary.homework}</div>
                <div><b>보강/보충</b> {todaySummary.makeup}</div>
                {!todaySummary.hasRecord && (
                  <div style={{ gridColumn: 'span 2', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                    오늘 출결 기록이 아직 없습니다.
                  </div>
                )}
              </div>
            )}

            <label className="msg-label" style={{ marginTop: '1rem' }}>포함할 내용</label>
            <div className="msg-tpls">
              {([
                ['attendance', '출결'],
                ['homework', '숙제'],
                ['makeup', '보강/보충'],
                ['monthlyReport', '월말 현황'],
                ['recentLogs', `최근 기록 ${recentLogs.length}`],
                ['studentMemo', '학생 메모'],
                ['queuedAlerts', `대기 알림 ${studentPendingRows.length}`],
                ['assistantDraft', '아이비 초안'],
              ] as Array<[IncludeKey, string]>).map(([key, label]) => (
                <button key={key} className={`msg-tpl ${include[key] ? 'on' : ''}`} onClick={() => toggleInclude(key)}>
                  {include[key] ? <CheckSquare size={14} /> : <Square size={14} />} {label}
                </button>
              ))}
            </div>

            {include.monthlyReport && (
              <div className="msg-params" style={{ marginTop: '0.8rem' }}>
                <label className="msg-label">월말 알림장 기준 월</label>
                <input
                  type="month"
                  className="msg-select"
                  value={reportMonth}
                  onChange={e => setReportMonth(e.target.value)}
                />
                {monthlyReport && (
                  <div className="msg-today" style={{ marginTop: '0.65rem' }}>
                    <div><b>출석률</b> {monthlyReport.attendance.rate}%</div>
                    <div><b>보충률</b> {monthlyReport.attendance.supplementRate}%</div>
                    <div><b>다른 학생 평균</b> {monthlyReport.attendance.peerSupplementRate}%</div>
                    <div><b>차이</b> {monthlyReport.attendance.supplementRateDelta > 0 ? '+' : ''}{monthlyReport.attendance.supplementRateDelta}%p</div>
                  </div>
                )}
              </div>
            )}

            {studentPendingRows.length > 0 && (
              <div className="msg-qlist" style={{ marginTop: '0.9rem' }}>
                {studentPendingRows.map(row => (
                  <div key={row.id} className={`msg-qrow ${selectedAlertIds.includes(row.id) ? 'sel' : ''}`}>
                    <button className="msg-check" onClick={() => toggleAlertSelection(row.id)} aria-label={`${row.label} 선택`}>
                      <span className={`msg-box ${selectedAlertIds.includes(row.id) ? 'on' : ''}`}>
                        {selectedAlertIds.includes(row.id) && <Check size={12} />}
                      </span>
                    </button>
                    <span className={`at-pill ${row.badgeTone}`}>{row.label}</span>
                    <span className="msg-qname">{row.message}</span>
                  </div>
                ))}
              </div>
            )}

            <button className="pay-btn primary" style={{ width: '100%', marginTop: '1rem' }} disabled={!currentStudent} onClick={handleGenerate}>
              <Sparkles size={15} /> 종합알림장 초안 만들기
            </button>
          </div>

          <section className="msg-preview">
            <div className="gd-card-head" style={{ marginBottom: '0.8rem' }}>
              <h2 className="gd-card-title"><Sparkles size={18} /> 미리보기</h2>
            </div>
            <textarea
              className="msg-select message-preview-textarea"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="학생을 선택하고 포함할 내용을 고른 뒤 초안을 만들어 주세요."
              style={{ minHeight: 320, resize: 'vertical', lineHeight: 1.65 }}
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
            {currentStudent && (
              <p className="msg-contact">학부모 연락처: {currentStudent.parentContact || '등록되지 않음'}</p>
            )}
          </section>
        </div>
      </section>

      {pendingRows.length > 0 && (
        <section className="gd-card msg-queue" style={{ marginBottom: '1.15rem' }}>
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
