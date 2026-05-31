import React, { useState, useMemo } from 'react';
import type { Student, KioskAlert, HomeworkAlert, HomeworkStatus } from '../types';
import { MessageSquare, Copy, Check, Send, User, Bell, Trash2, Sparkles, Filter, CheckSquare, Square } from 'lucide-react';
import { type MessageTemplates, renderTemplate } from '../lib/messageTemplates';
import { sendAlimtalk, type AlimtalkAlertType } from '../lib/alimtalk';

interface MessagingProps {
  students: Student[];
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

type TemplateType = 'in' | 'out' | 'homework' | 'makeup' | 'test' | 'custom';
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

  // Find active students
  const activeStudents = students
    .filter(s => s.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

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
      default:
        return '';
    }
  }, [selectedStudentId, selectedTemplate, customMessage, paramTime, paramDate, paramTestName, paramScore, students, messageTemplates]);

  // Clipboard copy helper
  const handleCopy = () => {
    if (!compiledMessage || compiledMessage.includes('학생을 선택하시면')) return;
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
    } finally {
      setSendingAlimtalkId(null);
    }
  };

  const currentStudent = students.find(s => s.id === selectedStudentId);
  const draftMatchedStudent = assistantDraft?.content ? students.find(s => s.id === findDraftStudentId(students, assistantDraft.content)) : null;

  return (
    <div>
      {pendingRows.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '5px solid var(--color-warning)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <h3 className="card-title" style={{ margin: 0 }}>
              <Bell size={20} className="text-secondary" /> 알림장 발송 대기 ({pendingRows.length}건)
            </h3>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', gap: '0.3rem' }}
                onClick={handleCopySelectedAlerts}
                disabled={selectedAlertIds.length === 0}
              >
                {bulkCopied ? <><Check size={14} className="text-success" /> 선택 복사됨</> : <><Copy size={14} /> 선택 복사</>}
              </button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', gap: '0.3rem' }}
                onClick={handleDismissSelectedAlerts}
                disabled={selectedAlertIds.length === 0}
              >
                <Check size={14} /> 선택 완료
              </button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', gap: '0.3rem' }}
                onClick={handleClearPendingAlerts}
              >
                <Trash2 size={14} /> 전체 비우기
              </button>
            </div>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
            키오스크 등·하원 알림과 출결 관리의 숙제 알림을 한곳에 모았습니다. 알리고 설정이 끝나면 알림톡으로 바로 발송할 수 있습니다.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
            <Filter size={15} className="text-secondary" />
            {[
              ['all', `전체 ${pendingRows.length}`],
              ['in', `등원 ${pendingRows.filter(row => row.type === 'in').length}`],
              ['out', `하원 ${pendingRows.filter(row => row.type === 'out').length}`],
              ['homework', `숙제 ${pendingRows.filter(row => row.type === 'homework').length}`],
              ['missing-contact', `연락처 없음 ${pendingRows.filter(row => !row.contact).length}`],
            ].map(([value, label]) => (
              <button
                key={value}
                className={`btn ${alertFilter === value ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.76rem', padding: '0.35rem 0.65rem' }}
                onClick={() => setAlertFilter(value as AlertFilter)}
              >
                {label}
              </button>
            ))}
            <button
              className="btn btn-secondary"
              style={{ marginLeft: 'auto', fontSize: '0.76rem', padding: '0.35rem 0.65rem', gap: '0.25rem' }}
              onClick={toggleAllVisibleAlerts}
              disabled={visibleAlertIds.length === 0}
            >
              {hasAllVisibleSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              보이는 알림 선택
            </button>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
            현재 {filteredAlertRows.length}건 표시 · {selectedVisibleAlertIds.length}건 선택됨
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '340px', overflowY: 'auto' }}>
            {filteredAlertRows.length === 0 && (
              <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: '#fafcfb', border: '1px dashed var(--color-border)', color: 'var(--color-text-secondary)', fontSize: '0.85rem', textAlign: 'center' }}>
                이 필터에 해당하는 대기 알림이 없습니다.
              </div>
            )}
            {filteredAlertRows.map(row => {
              const selected = selectedAlertIds.includes(row.id);
              return (
                <div
                  key={row.id}
                  className="pending-alert-card"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    border: selected ? '1px solid var(--color-accent-mint)' : '1px solid var(--color-border)',
                    backgroundColor: selected ? 'var(--color-accent-mint-light, #d1fae5)' : '#fafcfb',
                  }}
                >
                  <button
                    type="button"
                    aria-label={`${row.name} 알림 선택`}
                    onClick={() => toggleAlertSelection(row.id)}
                    style={{ background: 'none', border: 'none', color: selected ? 'var(--color-primary)' : 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', padding: 0 }}
                  >
                    {selected ? <CheckSquare size={20} /> : <Square size={20} />}
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', minWidth: 0 }}>
                    <span className={`badge ${row.badgeClass}`} style={{ fontSize: '0.72rem' }}>
                      {row.label}
                    </span>
                    <strong style={{ color: 'var(--color-primary-dark)' }}>{row.name}</strong>
                    <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>{row.time ?? row.date}</span>
                    <span style={{ fontSize: '0.78rem', color: row.contact ? 'var(--color-text-muted)' : 'var(--color-danger)' }}>
                      {row.contact ? `📞 ${row.contact}` : '연락처 없음'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem', gap: '0.25rem' }}
                      onClick={() => handleCopyAlert(row.id, row.message)}
                    >
                      {copiedAlertId === row.id ? <><Check size={13} className="text-success" /> 복사됨</> : <><Copy size={13} /> 복사</>}
                    </button>
                    {row.contact && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem', gap: '0.25rem' }}
                        onClick={() => void handleSendAlimtalk(row)}
                        disabled={sendingAlimtalkId === row.id}
                      >
                        <Send size={13} /> {sendingAlimtalkId === row.id ? '발송중' : '알림톡'}
                      </button>
                    )}
                    {row.contact && (
                      <a
                        href={buildSMSLink(row.contact, row.message)}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem', gap: '0.25rem', textDecoration: 'none' }}
                      >
                        문자
                      </a>
                    )}
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem' }}
                      onClick={() => dismissPendingRow(row)}
                    >
                      완료
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid-container cols-2-1">
      {/* Left Column: Form & Template Controls */}
      <div className="card">
        <h3 className="card-title">
          <MessageSquare size={20} className="text-primary" /> 알림장 조립기
        </h3>

        <div className="form-group">
          <label>대상 원생 선택 *</label>
          <select
            className="form-control"
            value={selectedStudentId}
            onChange={e => setSelectedStudentId(e.target.value)}
          >
            <option value="">학생을 선택하세요</option>
            {activeStudents.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.school} | {s.grade.split(' ')[1] || s.grade})
              </option>
            ))}
          </select>
        </div>

        {currentStudent && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#f0f7f3',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-accent-mint-light)',
              fontSize: '0.85rem',
              marginBottom: '1.5rem',
            }}
          >
            📞 <strong>학부모 연락처:</strong> {currentStudent.parentContact || '연락처가 등록되지 않았습니다.'}
          </div>
        )}

        {assistantDraft?.content && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: draftMatchedStudent ? 'var(--color-accent-mint-light, #d1fae5)' : 'var(--color-warning-light, #fef3c7)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${draftMatchedStudent ? 'var(--color-accent-mint, #10b981)' : 'var(--color-warning, #f59e0b)'}`,
              fontSize: '0.82rem',
              color: 'var(--color-primary-dark)',
              marginBottom: '1.5rem',
            }}
          >
            <strong>아이비 초안</strong>
            {draftMatchedStudent
              ? `에서 ${draftMatchedStudent.name} 학생을 자동 선택했습니다.`
              : '에서 학생 이름을 하나로 확정하지 못했습니다. 대상 원생을 직접 선택해 주세요.'}
          </div>
        )}

        <div className="form-group">
          <label>템플릿 유형 선택</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.35rem' }}>
            <button
              className={`btn ${selectedTemplate === 'in' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.85rem', padding: '0.5rem' }}
              onClick={() => setSelectedTemplate('in')}
            >
              등원 완료 🌱
            </button>
            <button
              className={`btn ${selectedTemplate === 'out' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.85rem', padding: '0.5rem' }}
              onClick={() => setSelectedTemplate('out')}
            >
              하원 완료 🏡
            </button>
            <button
              className={`btn ${selectedTemplate === 'homework' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.85rem', padding: '0.5rem' }}
              onClick={() => setSelectedTemplate('homework')}
            >
              과제 미제출 📝
            </button>
            <button
              className={`btn ${selectedTemplate === 'makeup' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.85rem', padding: '0.5rem' }}
              onClick={() => setSelectedTemplate('makeup')}
            >
              보강 안내 🕒
            </button>
            <button
              className={`btn ${selectedTemplate === 'test' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSelectedTemplate('test')}
              style={{ gridColumn: 'span 2', fontSize: '0.85rem', padding: '0.5rem' }}
            >
              평가 결과 통보 🎯
            </button>
            {customMessage && (
              <button
                className={`btn ${selectedTemplate === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedTemplate('custom')}
                style={{ gridColumn: 'span 2', fontSize: '0.85rem', padding: '0.5rem', gap: '0.35rem' }}
              >
                <Sparkles size={15} /> 아이비 초안
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Parameter Settings */}
        {selectedTemplate !== 'custom' ? (
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-primary-dark)', marginBottom: '0.75rem' }}>
            메시지 세부 변수 조정
          </h4>

          {(selectedTemplate === 'in' || selectedTemplate === 'out' || selectedTemplate === 'makeup') && (
            <div className="form-group">
              <label>시간 설정</label>
              <input
                type="time"
                className="form-control"
                value={paramTime}
                onChange={e => setParamTime(e.target.value)}
              />
            </div>
          )}

          {selectedTemplate === 'makeup' && (
            <div className="form-group">
              <label>보강 날짜</label>
              <input
                type="date"
                className="form-control"
                value={paramDate}
                onChange={e => setParamDate(e.target.value)}
              />
            </div>
          )}

          {selectedTemplate === 'test' && (
            <div className="form-row">
              <div className="form-group">
                <label>테스트명</label>
                <input
                  type="text"
                  className="form-control"
                  value={paramTestName}
                  onChange={e => setParamTestName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>득점/결과</label>
                <input
                  type="text"
                  className="form-control"
                  value={paramScore}
                  onChange={e => setParamScore(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-primary-dark)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Sparkles size={15} /> 아이비 초안 편집
            </h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', margin: 0 }}>
              아래 미리보기에서 내용을 직접 다듬은 뒤 복사하거나 학생 연락처를 선택해 문자로 보낼 수 있습니다.
            </p>
          </div>
        )}
      </div>

      {/* Right Column: Compiled Message Preview & Send Actions */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <h3 className="card-title">
            <User size={18} className="text-secondary" /> 알림장 미리보기
          </h3>

          <textarea
            className="form-control"
            rows={12}
            readOnly={selectedTemplate !== 'custom'}
            style={{
              fontFamily: 'inherit',
              lineHeight: '1.6',
              fontSize: '0.95rem',
              backgroundColor: '#fafcfb',
              cursor: selectedTemplate === 'custom' ? 'text' : 'default',
              border: '1px solid var(--color-border)',
              resize: 'none',
              padding: '1rem',
            }}
            value={compiledMessage}
            onChange={e => setCustomMessage(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button
            className="btn btn-secondary"
            onClick={handleCopy}
            disabled={!compiledMessage || compiledMessage.includes('학생을 선택하시면')}
            style={{ width: '100%', gap: '0.5rem' }}
          >
            {isCopied ? (
              <>
                <Check size={16} className="text-success" /> 클립보드 복사 완료
              </>
            ) : (
              <>
                <Copy size={16} /> 카카오톡용 본문 복사
              </>
            )}
          </button>

          {currentStudent?.parentContact ? (
            <a
              href={getSMSDeepLink()}
              className="btn btn-primary"
              style={{
                width: '100%',
                textDecoration: 'none',
                gap: '0.5rem',
                pointerEvents: selectedStudentId ? 'auto' : 'none',
                opacity: selectedStudentId ? 1 : 0.6,
              }}
            >
              <Send size={16} /> 학부모 문자(SMS) 바로 전송
            </a>
          ) : (
            <button
              className="btn btn-primary"
              disabled
              style={{ width: '100%', gap: '0.5rem', opacity: 0.6 }}
            >
              <Send size={16} /> 문자 전송 (연락처 필요)
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};
