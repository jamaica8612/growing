import React, { useState, useMemo, useEffect } from 'react';
import type { Student, Class, Attendance, KioskAlert, HomeworkAlert, HomeworkStatus, MessageLog } from '../types';
import { MessageSquare, Copy, Check, Send, Bell, Trash2, Sparkles, Smartphone, CheckSquare, Square, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { type MessageTemplates, renderTemplate } from '../lib/messageTemplates';
import { sendAlimtalk, type AlimtalkAlertType } from '../lib/alimtalk';
import { api } from '../lib/api';

interface MessagingProps {
  students: Student[];
  classes: Class[];
  attendance: Attendance[];
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
  messageTemplates: MessageTemplates;
}

type TemplateType = 'in' | 'out' | 'homework' | 'makeup' | 'test' | 'custom' | 'daily';
type AlertFilter = 'all' | 'in' | 'out' | 'homework' | 'missing-contact';
type PendingAlertType = 'in' | 'out' | 'homework';

interface PendingAlertRow {
  id: string;
  source: 'kiosk' | 'homework';
  sourceId: string;
  type: PendingAlertType;
  label: string;
  badgeClass: string;
  alertType: AlimtalkAlertType;
  studentId: string;
  name: string;
  contact: string;
  date: string;
  time?: string;
  message: string;
  createdAt: number;
}

// Shared check-in / check-out message body, reused by both the manual
// composer and the kiosk auto-queue so the wording stays in one place.
// Wording comes from the owner-editable templates (settings).
const buildCheckMessage = (templates: MessageTemplates, studentName: string, kind: 'in' | 'out', time: string) =>
  renderTemplate(kind === 'in' ? templates.checkIn : templates.checkOut, { 학생명: studentName, 시간: time });

const HOMEWORK_TEMPLATE_KEY: Record<Exclude<HomeworkStatus, ''>, keyof MessageTemplates> = {
  done: 'homeworkDone',
  incomplete: 'homeworkIncomplete',
  undone: 'homeworkUndone',
};

const HOMEWORK_LABEL: Record<Exclude<HomeworkStatus, ''>, string> = {
  done: '완료',
  incomplete: '미흡',
  undone: '안함',
};

// Map the existing badge class names to the new `at-pill` colour variants
// without touching the data-layer `badgeClass` field.
const MSG_LOG_TYPE_LABEL: Record<string, string> = {
  check_in: '등원',
  check_out: '하원',
  homework_done: '숙제완료',
  homework_incomplete: '숙제미흡',
  homework_undone: '숙제미제출',
  payment_request: '수납 안내',
  payment_paid: '수납 완료',
  custom: '직접 작성',
};

const PILL_VARIANT: Record<string, string> = {
  'badge-present': 'ok',
  'badge-makeup': 'info',
  'badge-late': 'warn',
  'badge-absent': 'danger',
};

const buildHomeworkMessage = (templates: MessageTemplates, studentName: string, status: Exclude<HomeworkStatus, ''>) =>
  renderTemplate(templates[HOMEWORK_TEMPLATE_KEY[status]], { 학생명: studentName });

// Build an SMS deep link prefilled with the message, tailored for iOS / Android.
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
  kioskAlerts,
  homeworkAlerts,
  onDismissAlert,
  onClearAlerts,
  onDismissHomeworkAlert,
  onClearHomeworkAlerts,
  assistantDraft,
  messageTemplates,
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => findDraftStudentId(students, assistantDraft?.content));
  const [copiedAlertId, setCopiedAlertId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>(() => assistantDraft?.content ? 'custom' : 'in');
  const [customMessage, setCustomMessage] = useState(() => assistantDraft?.content ?? '');
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('all');
  const [selectedAlertIds, setSelectedAlertIds] = useState<string[]>([]);
  const [bulkCopied, setBulkCopied] = useState(false);
  const [sendingAlimtalkId, setSendingAlimtalkId] = useState<string | null>(null);

  // Dynamic parameters for templates (defaults computed once on mount)
  const [paramTime, setParamTime] = useState(() =>
    new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
  const [paramDate, setParamDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [paramTestName, setParamTestName] = useState('단어 단원 평가');
  const [paramScore, setParamScore] = useState('95/100');

  const [isCopied, setIsCopied] = useState(false);
  const [messageLogs, setMessageLogs] = useState<MessageLog[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);

  useEffect(() => {
    api.getMessageLogs(50).then(setMessageLogs).catch(() => {});
  }, []);

  // Find active students
  const activeStudents = students
    .filter(s => s.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  // Today's date string (YYYY-MM-DD, local time)
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // Today's attendance records for the selected student
  const todayAttendances = useMemo(() => {
    if (!selectedStudentId) return [];
    return attendance.filter(a => a.studentId === selectedStudentId && a.date === todayStr);
  }, [attendance, selectedStudentId, todayStr]);

  // Summary of today's 4 key pieces of info
  const todaySummary = useMemo(() => {
    const first = todayAttendances[0];
    const checkIn = todayAttendances.map(a => a.checkInTime).filter(Boolean).join(', ') || '-';
    const checkOut = todayAttendances.map(a => a.checkOutTime).filter(Boolean).join(', ') || '-';

    const hwStatus = first?.homeworkStatus;
    const hwLabel = hwStatus === 'done' ? '완료 ✅' : hwStatus === 'incomplete' ? '미흡 📝' : hwStatus === 'undone' ? '미완 ❌' : '미기록';

    const isMakeup = todayAttendances.some(a => a.status === 'makeup');
    const makeupLabel = isMakeup ? '보강 수업' : '없음';

    return { checkIn, checkOut, hwLabel, makeupLabel, hasTodayRecord: todayAttendances.length > 0 };
  }, [todayAttendances]);

  // Group active students by class
  const studentsByClass = useMemo(() => {
    const groups: Array<{ classId: string; className: string; students: Student[] }> = [];
    for (const cls of classes) {
      const members = activeStudents.filter(s => cls.studentIds.includes(s.id));
      if (members.length > 0) groups.push({ classId: cls.id, className: cls.name, students: members });
    }
    const assignedIds = new Set(classes.flatMap(c => c.studentIds));
    const unassigned = activeStudents.filter(s => !assignedIds.has(s.id));
    if (unassigned.length > 0) groups.push({ classId: '__none__', className: '미배정', students: unassigned });
    return groups;
  }, [classes, activeStudents]);

  // Compiled message is derived directly from the current selections/parameters.
  const compiledMessage = useMemo(() => {
    if (!selectedStudentId) {
      if (selectedTemplate === 'custom' && customMessage) return customMessage;
      return '학생을 선택하시면 알림장 메시지가 이곳에 조립됩니다. 🌱';
    }

    const student = students.find(s => s.id === selectedStudentId);
    if (!student) return '';

    const studentName = student.name;

    switch (selectedTemplate) {
      case 'custom':
        return customMessage || '아이비 초안이나 직접 작성한 메시지가 이곳에 표시됩니다. 🌱';
      case 'in':
        return buildCheckMessage(messageTemplates, studentName, 'in', paramTime);
      case 'out':
        return buildCheckMessage(messageTemplates, studentName, 'out', paramTime);
      case 'homework':
        return renderTemplate(messageTemplates.homeworkIncomplete, { 학생명: studentName });
      case 'makeup':
        return renderTemplate(messageTemplates.makeup, { 학생명: studentName, 날짜: paramDate, 시간: paramTime });
      case 'test':
        return renderTemplate(messageTemplates.test, { 학생명: studentName, 평가명: paramTestName, 점수: paramScore });
      case 'daily': {
        const { checkIn, checkOut, hwLabel, makeupLabel } = todaySummary;
        return `[그로잉영어] ${studentName} 오늘의 수업 안내 🌱\n\n✅ 등원: ${checkIn}\n🏡 하원: ${checkOut}\n📝 숙제: ${hwLabel}\n🔄 보강: ${makeupLabel}\n\n오늘도 수고했어요! 감사합니다 😊`;
      }
      default:
        return '';
    }
  }, [selectedStudentId, selectedTemplate, customMessage, paramTime, paramDate, paramTestName, paramScore, students, messageTemplates, todaySummary]);

  const isPlaceholder = compiledMessage.includes('학생을 선택하시면');

  // Clipboard copy helper
  const handleCopy = () => {
    if (!compiledMessage || isPlaceholder) return;
    navigator.clipboard.writeText(compiledMessage).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  // SMS Deep Link for the currently composed message.
  const getSMSDeepLink = (): string => {
    const student = students.find(s => s.id === selectedStudentId);
    return buildSMSLink(student?.parentContact ?? '', compiledMessage);
  };

  const handleCopyAlert = (id: string, message: string) => {
    navigator.clipboard.writeText(message).then(() => {
      setCopiedAlertId(id);
      setTimeout(() => setCopiedAlertId(null), 2000);
    });
  };

  const pendingRows = useMemo<PendingAlertRow[]>(() => {
    const kioskRows: PendingAlertRow[] = kioskAlerts.map(alert => {
      const student = students.find(s => s.id === alert.studentId);
      const name = student?.name ?? '알수없음';
      const contact = student?.parentContact ?? '';
      return {
        id: `kiosk-${alert.id}`,
        source: 'kiosk',
        sourceId: alert.id,
        type: alert.kind,
        label: alert.kind === 'in' ? '등원' : '하원',
        badgeClass: alert.kind === 'in' ? 'badge-present' : 'badge-makeup',
        alertType: alert.kind === 'in' ? 'check_in' : 'check_out',
        studentId: alert.studentId,
        name,
        contact,
        date: alert.date,
        time: alert.time,
        message: buildCheckMessage(messageTemplates, name, alert.kind, alert.time),
        createdAt: alert.createdAt,
      };
    });

    const homeworkRows: PendingAlertRow[] = homeworkAlerts.map(alert => {
      const student = students.find(s => s.id === alert.studentId);
      const name = student?.name ?? '알수없음';
      const contact = student?.parentContact ?? '';
      return {
        id: `homework-${alert.id}`,
        source: 'homework',
        sourceId: alert.id,
        type: 'homework',
        label: `숙제 ${HOMEWORK_LABEL[alert.homeworkStatus]}`,
        badgeClass: alert.homeworkStatus === 'done' ? 'badge-present' : alert.homeworkStatus === 'incomplete' ? 'badge-late' : 'badge-absent',
        alertType: `homework_${alert.homeworkStatus}` as AlimtalkAlertType,
        studentId: alert.studentId,
        name,
        contact,
        date: alert.date,
        message: buildHomeworkMessage(messageTemplates, name, alert.homeworkStatus),
        createdAt: alert.createdAt,
      };
    });

    return [...kioskRows, ...homeworkRows].sort((a, b) => b.createdAt - a.createdAt);
  }, [kioskAlerts, homeworkAlerts, students, messageTemplates]);

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
    const text = selectedRows
      .map(row => `[${row.label}] ${row.name}${row.time ? ` ${row.time}` : ` ${row.date}`}\n${row.message}`)
      .join('\n\n---\n\n');
    navigator.clipboard.writeText(text).then(() => {
      setBulkCopied(true);
      setTimeout(() => setBulkCopied(false), 2000);
    });
  };

  const dismissPendingRow = (row: PendingAlertRow) => {
    if (row.source === 'homework') {
      onDismissHomeworkAlert(row.sourceId);
      return;
    }
    onDismissAlert(row.sourceId);
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

  const handleSendAlimtalk = async (row: PendingAlertRow) => {
    if (!row.contact) {
      alert('학부모 연락처가 없어 알림톡을 보낼 수 없습니다.');
      return;
    }
    setSendingAlimtalkId(row.id);
    try {
      await sendAlimtalk({
        studentId: row.studentId,
        alertType: row.alertType,
        recipientPhone: row.contact,
        recipientName: row.name,
        subject: `그로잉영어 ${row.label} 안내`,
        message: row.message,
        fallbackMessage: row.message,
      });
      dismissPendingRow(row);
      alert('알림톡 발송을 요청했습니다.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '알림톡 발송에 실패했습니다.';
      alert(message);
      setSendingAlimtalkId(null);
    } finally {
      setSendingAlimtalkId(null);
    }
  };

  const currentStudent = students.find(s => s.id === selectedStudentId);
  const draftMatchedStudent = assistantDraft?.content ? students.find(s => s.id === findDraftStudentId(students, assistantDraft.content)) : null;

  const TEMPLATE_BUTTONS: Array<{ value: TemplateType; label: string }> = [
    { value: 'in', label: '등원 완료 🌱' },
    { value: 'out', label: '하원 완료 🏡' },
    { value: 'homework', label: '과제 미제출 📝' },
    { value: 'makeup', label: '보강 안내 🕒' },
    { value: 'test', label: '평가 결과 🎯' },
    { value: 'daily', label: '종합 알림장 📋' },
  ];

  return (
    <div className="gd-root">
      {/* 발송 대기 큐 */}
      {pendingRows.length > 0 && (
        <section className="gd-card msg-queue" style={{ marginBottom: '1.15rem' }}>
          <div className="gd-card-head">
            <h2 className="gd-card-title">
              <Bell size={18} /> 알림장 발송 대기 <span className="cl-count">{pendingRows.length}건</span>
            </h2>
            <div className="msg-q-actions">
              <button
                className="pay-btn ghost sm"
                onClick={handleCopySelectedAlerts}
                disabled={selectedAlertIds.length === 0}
              >
                {bulkCopied ? <><Check size={13} /> 선택 복사됨</> : <><Copy size={13} /> 선택 복사</>}
              </button>
              <button
                className="pay-btn ghost sm"
                onClick={handleDismissSelectedAlerts}
                disabled={selectedAlertIds.length === 0}
              >
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
              <button
                key={value}
                className={`at-chip ${alertFilter === value ? 'on' : ''}`}
                onClick={() => setAlertFilter(value)}
              >
                {label}
              </button>
            ))}
            <button
              className="at-chip"
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              onClick={toggleAllVisibleAlerts}
              disabled={visibleAlertIds.length === 0}
            >
              {hasAllVisibleSelected ? <CheckSquare size={13} /> : <Square size={13} />}
              보이는 알림 선택
            </button>
          </div>

          <div className="msg-q-empty" style={{ border: 'none', background: 'none', padding: '0 0 0.6rem', textAlign: 'left' }}>
            현재 {filteredAlertRows.length}건 표시 · {selectedVisibleAlertIds.length}건 선택됨
          </div>

          <div className="msg-qlist">
            {filteredAlertRows.length === 0 ? (
              <div className="msg-q-empty">이 필터에 해당하는 대기 알림이 없습니다.</div>
            ) : (
              filteredAlertRows.map(row => {
                const selected = selectedAlertIds.includes(row.id);
                return (
                  <div className={`msg-qrow ${selected ? 'sel' : ''}`} key={row.id}>
                    <button
                      className="msg-check"
                      onClick={() => toggleAlertSelection(row.id)}
                      aria-label={`${row.name} 알림 선택`}
                    >
                      <span className={`msg-box ${selected ? 'on' : ''}`}>{selected && <Check size={12} />}</span>
                    </button>
                    <span className={`at-pill ${PILL_VARIANT[row.badgeClass] ?? 'info'}`}>{row.label}</span>
                    <span className="msg-qname">{row.name}</span>
                    <span className="msg-qtime">{row.time ?? row.date}</span>
                    <span className={`msg-qcontact ${row.contact ? '' : 'none'}`}>
                      {row.contact ? `📞 ${row.contact}` : '연락처 없음'}
                    </span>
                    <div className="msg-qbtns">
                      <button
                        className={`at-act ${copiedAlertId === row.id ? 'done' : ''}`}
                        onClick={() => handleCopyAlert(row.id, row.message)}
                      >
                        {copiedAlertId === row.id ? <><Check size={12} /> 복사됨</> : <><Copy size={12} /> 복사</>}
                      </button>
                      {row.contact && (
                        <button
                          className="at-act primary"
                          onClick={() => void handleSendAlimtalk(row)}
                          disabled={sendingAlimtalkId === row.id}
                        >
                          <Send size={12} /> {sendingAlimtalkId === row.id ? '발송중' : '알림톡'}
                        </button>
                      )}
                      {row.contact && (
                        <a
                          href={buildSMSLink(row.contact, row.message)}
                          className="at-act"
                          style={{ textDecoration: 'none' }}
                        >
                          문자
                        </a>
                      )}
                      <button className="at-act" onClick={() => dismissPendingRow(row)}>완료</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* 조립기 + 카카오톡 미리보기 */}
      <div className="msg-main">
        {/* 좌: 조립기 */}
        <section className="gd-card">
          <h2 className="gd-card-title" style={{ marginBottom: '1rem' }}>
            <MessageSquare size={18} /> 알림장 조립기
          </h2>

          <label className="msg-label">대상 원생 *</label>
          <select
            className="msg-select"
            value={selectedStudentId}
            onChange={e => setSelectedStudentId(e.target.value)}
          >
            <option value="">학생을 선택하세요</option>
            {studentsByClass.map(group => (
              <optgroup key={group.classId} label={`── ${group.className}`}>
                {group.students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.grade.split(' ')[1] || s.grade})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {currentStudent && (
            <div className="msg-today">
              <div><b>✅ 등원</b> {todaySummary.checkIn}</div>
              <div><b>🏡 하원</b> {todaySummary.checkOut}</div>
              <div><b>📝 숙제</b> {todaySummary.hwLabel}</div>
              <div><b>🔄 보강</b> {todaySummary.makeupLabel}</div>
              {!todaySummary.hasTodayRecord && (
                <div style={{ gridColumn: 'span 2', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                  오늘 출결 기록이 없습니다.
                </div>
              )}
            </div>
          )}

          {assistantDraft?.content && (
            <div
              className="msg-today"
              style={{
                gridTemplateColumns: '1fr',
                background: draftMatchedStudent ? '#f0f6f2' : '#fef3c7',
                borderColor: draftMatchedStudent ? '#d9e9e1' : 'var(--color-warning)',
                color: 'var(--color-primary-dark)',
              }}
            >
              <div>
                <b><Sparkles size={13} style={{ verticalAlign: '-2px' }} /> 아이비 초안</b>{' '}
                {draftMatchedStudent
                  ? `에서 ${draftMatchedStudent.name} 학생을 자동 선택했습니다.`
                  : '에서 학생 이름을 하나로 확정하지 못했습니다. 대상 원생을 직접 선택해 주세요.'}
              </div>
            </div>
          )}

          <label className="msg-label">템플릿 유형</label>
          <div className="msg-tpls">
            {TEMPLATE_BUTTONS.map(t => (
              <button
                key={t.value}
                className={`msg-tpl ${selectedTemplate === t.value ? 'on' : ''}`}
                onClick={() => setSelectedTemplate(t.value)}
              >
                {t.label}
              </button>
            ))}
            {customMessage && (
              <button
                className={`msg-tpl ${selectedTemplate === 'custom' ? 'on' : ''}`}
                style={{ gridColumn: 'span 2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                onClick={() => setSelectedTemplate('custom')}
              >
                <Sparkles size={15} /> 아이비 초안
              </button>
            )}
          </div>

          {/* 세부 변수 조정 */}
          {(selectedTemplate === 'in' || selectedTemplate === 'out' || selectedTemplate === 'makeup') && (
            <div className="msg-params">
              <label className="msg-label">시간 설정</label>
              <input
                type="time"
                className="msg-select"
                value={paramTime}
                onChange={e => setParamTime(e.target.value)}
              />
            </div>
          )}

          {selectedTemplate === 'makeup' && (
            <div className="msg-params">
              <label className="msg-label">보강 날짜</label>
              <input
                type="date"
                className="msg-select"
                value={paramDate}
                onChange={e => setParamDate(e.target.value)}
              />
            </div>
          )}

          {selectedTemplate === 'test' && (
            <div className="msg-params msg-params2">
              <div>
                <label className="msg-label">평가명</label>
                <input
                  type="text"
                  className="msg-select"
                  value={paramTestName}
                  onChange={e => setParamTestName(e.target.value)}
                />
              </div>
              <div>
                <label className="msg-label">득점/결과</label>
                <input
                  type="text"
                  className="msg-select"
                  value={paramScore}
                  onChange={e => setParamScore(e.target.value)}
                />
              </div>
            </div>
          )}

          {selectedTemplate === 'custom' && (
            <div className="msg-params">
              <label className="msg-label">
                <Sparkles size={13} style={{ verticalAlign: '-2px' }} /> 아이비 초안 편집
              </label>
              <textarea
                className="msg-select message-preview-textarea"
                style={{ resize: 'none' }}
                value={compiledMessage}
                onChange={e => setCustomMessage(e.target.value)}
              />
            </div>
          )}
        </section>

        {/* 우: 카카오톡 말풍선 미리보기 */}
        <section className="gd-card msg-preview">
          <h2 className="gd-card-title" style={{ marginBottom: '0.85rem' }}>
            <Smartphone size={18} /> 미리보기
          </h2>

          <div className="msg-bubble-wrap">
            <div className="msg-bubble">{compiledMessage}</div>
          </div>

          <div className="msg-send">
            <button
              className={`pay-btn ghost ${isCopied ? 'cdone' : ''}`}
              onClick={handleCopy}
              disabled={!compiledMessage || isPlaceholder}
            >
              {isCopied ? <><Check size={15} /> 복사 완료</> : <><Copy size={15} /> 카카오톡 본문 복사</>}
            </button>

            {currentStudent?.parentContact ? (
              <a
                href={getSMSDeepLink()}
                className="pay-btn primary"
                style={{
                  textDecoration: 'none',
                  pointerEvents: selectedStudentId ? 'auto' : 'none',
                  opacity: selectedStudentId ? 1 : 0.5,
                }}
              >
                <Send size={15} /> 학부모 문자 전송
              </a>
            ) : (
              <button className="pay-btn primary" disabled>
                <Send size={15} /> 문자 전송 (연락처 필요)
              </button>
            )}
          </div>

          {currentStudent && (
            <p className="msg-contact">
              📞 학부모 연락처: {currentStudent.parentContact || '등록되지 않음'}
            </p>
          )}
        </section>
      </div>

      {/* 발송 기록 */}
      <section className="gd-card" style={{ marginTop: '1.15rem' }}>
        <button
          className="msg-log-toggle"
          onClick={() => setLogsOpen(o => !o)}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Clock size={16} /> 알림톡 발송 기록
            {messageLogs.length > 0 && <span className="cl-count">{messageLogs.length}건</span>}
          </span>
          {logsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {logsOpen && (
          messageLogs.length === 0 ? (
            <div className="gd-empty" style={{ padding: '1.5rem 0' }}>
              <span>발송 기록이 없습니다. Aligo Secrets 설정 후 알림톡을 보내면 여기에 기록됩니다.</span>
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
                      <td>{MSG_LOG_TYPE_LABEL[log.alertType] ?? log.alertType}</td>
                      <td>
                        <span className={`at-pill ${log.status === 'sent' ? 'ok' : log.status === 'failed' ? 'danger' : 'warn'}`}>
                          {log.status === 'sent' ? '발송' : log.status === 'failed' ? '실패' : '대기'}
                        </span>
                        {log.status === 'failed' && log.errorMessage && (
                          <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-danger)', marginTop: '0.15rem' }}>
                            {log.errorMessage}
                          </span>
                        )}
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
