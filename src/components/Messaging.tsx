import React, { useEffect, useMemo, useState } from 'react';
import type { Attendance, Class, CounselLog, HomeworkAlert, HomeworkStatus, KioskAlert, MessageLog, Payment, Student } from '../types';
import { Bell, Check, CheckSquare, ChevronDown, ChevronUp, Clock, Copy, Edit3, Send, Sparkles, Square, Trash2, User, Users } from 'lucide-react';
import { sendAlimtalk } from '../lib/alimtalk';
import { api } from '../lib/api';
import { buildParentNoticeDraft, getNoticeDraftMeta, type NoticeIncludeKey, type NoticeIncludeState } from '../lib/noticeDrafts';

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
type NoticeMode = 'single' | 'batch';
type BatchStatus = 'idle' | 'sending' | 'sent' | 'failed' | 'skipped';

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

interface BatchDraft {
  studentId: string;
  name: string;
  contact: string;
  message: string;
  selected: boolean;
  expanded: boolean;
  status: BatchStatus;
  errorMessage?: string;
}

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const homeworkLabel = (status?: HomeworkStatus) => {
  if (status === 'done') return '완료';
  if (status === 'incomplete') return '부분 완료';
  if (status === 'undone') return '미제출';
  return '기록 없음';
};

const messageLogTypeLabel: Record<string, string> = {
  check_in: '등원',
  check_out: '하원',
  homework_done: '과제 완료',
  homework_incomplete: '과제 부분 완료',
  homework_undone: '과제 미제출',
  payment_request: '수납 안내',
  payment_paid: '수납 완료',
  exam_result: '평가 결과',
  custom: '일일 종합알림장',
};

const statusLabel: Record<BatchStatus, string> = {
  idle: '대기',
  sending: '발송중',
  sent: '완료',
  failed: '실패',
  skipped: '제외',
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
  const [mode, setMode] = useState<NoticeMode>('single');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [include, setInclude] = useState<NoticeIncludeState>({
    attendance: true,
    homework: true,
    makeup: false,
  });
  const [message, setMessage] = useState('');
  const [batchClassId, setBatchClassId] = useState('');
  const [batchDrafts, setBatchDrafts] = useState<BatchDraft[]>([]);
  const [noticeDate, setNoticeDate] = useState(() => todayLocal());
  const [isSending, setIsSending] = useState(false);
  const [isBatchSending, setIsBatchSending] = useState(false);
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('all');
  const [selectedAlertIds, setSelectedAlertIds] = useState<string[]>([]);
  const [bulkCopied, setBulkCopied] = useState(false);
  const [messageLogs, setMessageLogs] = useState<MessageLog[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);

  useEffect(() => {
    api.getMessageLogs(50).then(setMessageLogs).catch(() => {});
  }, []);

  const noticeMonth = noticeDate.slice(0, 7);
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

  const selectedMeta = useMemo(() => {
    if (!currentStudent) return null;
    return getNoticeDraftMeta({
      student: currentStudent,
      classes,
      attendance,
      payments,
      counselLogs,
      month: noticeMonth,
      today: noticeDate,
    });
  }, [attendance, classes, counselLogs, currentStudent, noticeDate, noticeMonth, payments]);

  const buildNoticeForStudent = (student: Student) => buildParentNoticeDraft({
    student,
    classes,
    attendance,
    payments,
    counselLogs,
    month: noticeMonth,
    today: noticeDate,
    include,
  });

  const batchTargets = useMemo(() => {
    if (!batchClassId) return activeStudents;
    const targetClass = classes.find(cls => cls.id === batchClassId);
    if (!targetClass) return [];
    return activeStudents.filter(student => targetClass.studentIds.includes(student.id));
  }, [activeStudents, batchClassId, classes]);

  const batchStats = useMemo(() => {
    const selected = batchDrafts.filter(draft => draft.selected);
    return {
      total: batchDrafts.length,
      selected: selected.length,
      sendable: selected.filter(draft => draft.contact && draft.message.trim()).length,
      missingContact: batchDrafts.filter(draft => !draft.contact).length,
      sent: batchDrafts.filter(draft => draft.status === 'sent').length,
      failed: batchDrafts.filter(draft => draft.status === 'failed').length,
    };
  }, [batchDrafts]);

  const pendingRows = useMemo<PendingAlertRow[]>(() => {
    const kioskRows: PendingAlertRow[] = kioskAlerts.map(alert => {
      const student = students.find(s => s.id === alert.studentId);
      const name = student?.name ?? '학생 없음';
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
      const name = student?.name ?? '학생 없음';
      const label = `과제 ${homeworkLabel(alert.homeworkStatus)}`;
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
        message: `${name} 학생 과제 상태: ${homeworkLabel(alert.homeworkStatus)}`,
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

  const refreshLogs = async () => {
    const logs = await api.getMessageLogs(50).catch(() => messageLogs);
    setMessageLogs(logs);
  };

  const handleGenerate = () => {
    if (!currentStudent) return;
    setMessage(buildNoticeForStudent(currentStudent));
  };

  const handleGenerateBatch = () => {
    const drafts = batchTargets.map(student => ({
      studentId: student.id,
      name: student.name,
      contact: student.parentContact,
      message: buildNoticeForStudent(student),
      selected: Boolean(student.parentContact),
      expanded: false,
      status: student.parentContact ? 'idle' as BatchStatus : 'skipped' as BatchStatus,
      errorMessage: student.parentContact ? undefined : '학부모 연락처가 없습니다.',
    }));
    setMode('batch');
    setBatchDrafts(drafts);
  };

  const patchBatchDraft = (studentId: string, patch: Partial<BatchDraft>) => {
    setBatchDrafts(rows => rows.map(row => row.studentId === studentId ? { ...row, ...patch } : row));
  };

  const handleSelectAllBatch = () => {
    const selectableCount = batchDrafts.filter(draft => draft.contact && draft.message.trim()).length;
    const allSelected = selectableCount > 0 && batchDrafts.filter(draft => draft.contact && draft.message.trim()).every(draft => draft.selected);
    setBatchDrafts(rows => rows.map(row => row.contact && row.message.trim() ? { ...row, selected: !allSelected } : { ...row, selected: false }));
  };

  const handleSendComprehensiveAlimtalk = async () => {
    if (!currentStudent || !currentStudent.parentContact || !message.trim()) return;
    if (!window.confirm(`${currentStudent.name} 학생 학부모님께 일일 종합알림장을 발송할까요?`)) return;
    setIsSending(true);
    try {
      await sendAlimtalk({
        studentId: currentStudent.id,
        alertType: 'custom',
        recipientPhone: currentStudent.parentContact,
        recipientName: currentStudent.name,
        subject: `그로잉영어 ${currentStudent.name} 학생 일일 종합알림장`,
        message,
        fallbackMessage: message,
      });
      await refreshLogs();
      alert('일일 종합알림장 발송을 요청했어요.');
    } catch (error) {
      alert(error instanceof Error ? error.message : '일일 종합알림장 발송에 실패했어요.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendSelectedBatch = async () => {
    const targets = batchDrafts.filter(draft => draft.selected && draft.contact && draft.message.trim());
    if (targets.length === 0) return;
    if (!window.confirm(`선택한 ${targets.length}명에게 일일 종합알림장을 발송할까요?`)) return;
    setIsBatchSending(true);
    for (const draft of targets) {
      patchBatchDraft(draft.studentId, { status: 'sending', errorMessage: undefined });
      try {
        await sendAlimtalk({
          studentId: draft.studentId,
          alertType: 'custom',
          recipientPhone: draft.contact,
          recipientName: draft.name,
          subject: `그로잉영어 ${draft.name} 학생 일일 종합알림장`,
          message: draft.message,
          fallbackMessage: draft.message,
        });
        patchBatchDraft(draft.studentId, { status: 'sent', selected: false });
      } catch (error) {
        patchBatchDraft(draft.studentId, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : '발송 실패',
        });
      }
    }
    await refreshLogs();
    setIsBatchSending(false);
  };

  const toggleInclude = (key: NoticeIncludeKey) => setInclude(prev => ({ ...prev, [key]: !prev[key] }));

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
          <h2>일일 종합알림장</h2>
          <p>선택한 하루의 출결과 과제를 정리하고, 보강/보충은 해당 날짜에 기록이 있을 때 선택해 포함합니다.</p>
        </div>
        <div className="msg-hero-actions">
          <input
            type="date"
            className="msg-month dark"
            value={noticeDate}
            onChange={e => setNoticeDate(e.target.value)}
            aria-label="알림장 기준일"
          />
          <button className="pay-btn primary" disabled={mode === 'single' ? !currentStudent : batchTargets.length === 0} onClick={mode === 'single' ? handleGenerate : handleGenerateBatch}>
            <Sparkles size={15} /> 초안 만들기
          </button>
        </div>
      </section>

      <div className="msg-mode-tabs" role="tablist" aria-label="알림장 작성 방식">
        <button className={mode === 'single' ? 'on' : ''} onClick={() => setMode('single')}>
          <User size={15} /> 개별 작성
        </button>
        <button className={mode === 'batch' ? 'on' : ''} onClick={() => setMode('batch')}>
          <Users size={15} /> 반별 일괄
        </button>
      </div>

      <div className="msg-compose-grid">
        <section className="gd-card msg-panel">
          <div className="msg-section-title">{mode === 'single' ? '대상 학생' : '발송 대상'}</div>
          {mode === 'single' ? (
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
          ) : (
            <div className="msg-batch-target">
              <select className="msg-select" value={batchClassId} onChange={e => setBatchClassId(e.target.value)}>
                <option value="">전체 재원생</option>
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
              <button className="pay-btn ghost" onClick={handleGenerateBatch} disabled={batchTargets.length === 0}>
                <Sparkles size={15} /> {batchTargets.length}명 초안 생성
              </button>
            </div>
          )}

          {currentStudent && mode === 'single' && selectedMeta && (
            <div className="msg-summary-grid">
              <div><span>출결</span><b>{selectedMeta.attendance}</b></div>
              <div><span>과제</span><b>{selectedMeta.homework}</b></div>
              <div><span>보강/보충</span><b>{selectedMeta.makeup}</b></div>
              <div><span>기준일</span><b>{noticeDate}</b></div>
            </div>
          )}

          {mode === 'batch' && (
            <div className="msg-summary-grid">
              <div><span>생성 대상</span><b>{batchTargets.length}명</b></div>
              <div><span>초안</span><b>{batchStats.total}명</b></div>
              <div><span>선택</span><b>{batchStats.selected}명</b></div>
              <div><span>연락처 없음</span><b>{batchStats.missingContact}명</b></div>
            </div>
          )}

          <div className="msg-section-row">
            <div className="msg-section-title">포함 항목</div>
          </div>
          <div className="msg-include-list">
            <div className="msg-include on locked">
              <span className="msg-include-icon"><CheckSquare size={16} /></span>
              <span><b>출결</b><em>{selectedMeta?.attendance ?? '선택일 출결'}</em></span>
            </div>
            <div className="msg-include on locked">
              <span className="msg-include-icon"><CheckSquare size={16} /></span>
              <span><b>과제</b><em>{selectedMeta?.homework ?? '선택일 과제'}</em></span>
            </div>
            <button className={`msg-include ${include.makeup ? 'on' : ''}`} onClick={() => toggleInclude('makeup')}>
              <span className="msg-include-icon">{include.makeup ? <CheckSquare size={16} /> : <Square size={16} />}</span>
              <span><b>보강/보충</b><em>{include.makeup ? selectedMeta?.makeup ?? '선택일 기록' : '필요할 때만 선택'}</em></span>
            </button>
          </div>
        </section>

        <section className="gd-card msg-preview-pro">
          {mode === 'single' ? (
            <>
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
            </>
          ) : (
            <>
              <div className="msg-section-row">
                <div>
                  <div className="msg-section-title">일괄 검토</div>
                  <p className="msg-small-copy">학생 카드를 열어 문구를 확인하고, 발송할 학생만 선택하세요.</p>
                </div>
                <button className="pay-btn ghost sm" onClick={handleSelectAllBatch} disabled={batchDrafts.length === 0}>
                  <CheckSquare size={14} /> 전체 선택
                </button>
              </div>
              {batchDrafts.length === 0 ? (
                <div className="msg-empty-panel">대상을 고른 뒤 초안을 생성하면 학생별 알림장이 여기에 표시됩니다.</div>
              ) : (
                <div className="msg-batch-list">
                  {batchDrafts.map(draft => (
                    <div className={`msg-batch-row ${draft.selected ? 'sel' : ''} ${draft.expanded ? 'open' : ''}`} key={draft.studentId}>
                      <button
                        className="msg-check"
                        onClick={() => patchBatchDraft(draft.studentId, { selected: !draft.selected })}
                        disabled={!draft.contact || !draft.message.trim() || isBatchSending}
                        aria-label={`${draft.name} 발송 선택`}
                      >
                        <span className={`msg-box ${draft.selected ? 'on' : ''}`}>{draft.selected && <Check size={12} />}</span>
                      </button>
                      <button className="msg-batch-summary" onClick={() => patchBatchDraft(draft.studentId, { expanded: !draft.expanded })}>
                        <b>{draft.name}</b>
                        <span>{draft.contact || '연락처 없음'}</span>
                        <em>{draft.message.split('\n').find(Boolean) || '초안 없음'}</em>
                      </button>
                      <span className={`at-pill ${draft.status === 'sent' ? 'ok' : draft.status === 'failed' ? 'danger' : draft.status === 'sending' ? 'warn' : draft.status === 'skipped' ? 'danger' : 'info'}`}>
                        {statusLabel[draft.status]}
                      </span>
                      <button className="at-act" onClick={() => patchBatchDraft(draft.studentId, { expanded: !draft.expanded })}>
                        <Edit3 size={13} /> 수정
                      </button>
                      {draft.expanded && (
                        <div className="msg-batch-editor">
                          <textarea
                            value={draft.message}
                            onChange={e => patchBatchDraft(draft.studentId, { message: e.target.value })}
                          />
                          {draft.errorMessage && <span className="msg-error-text">{draft.errorMessage}</span>}
                          <div className="msg-batch-editor-actions">
                            {draft.contact ? (
                              <a href={buildSMSLink(draft.contact, draft.message)} className="pay-btn ghost sm" style={{ textDecoration: 'none' }}>
                                <Send size={14} /> 문자로 열기
                              </a>
                            ) : (
                              <button className="pay-btn ghost sm" disabled>연락처 필요</button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {mode === 'batch' && batchDrafts.length > 0 && (
        <div className="msg-batch-actionbar">
          <div>
            <b>{batchStats.selected}명 선택</b>
            <span>발송 가능 {batchStats.sendable}명 · 완료 {batchStats.sent}명 · 실패 {batchStats.failed}명</span>
          </div>
          <button className="pay-btn primary" onClick={() => void handleSendSelectedBatch()} disabled={batchStats.sendable === 0 || isBatchSending}>
            <Send size={15} /> {isBatchSending ? '발송 중' : '선택 발송'}
          </button>
        </div>
      )}

      {pendingRows.length > 0 && (
        <section className="gd-card msg-queue" style={{ marginTop: '1.15rem' }}>
          <div className="gd-card-head">
            <h2 className="gd-card-title">
              <Bell size={18} /> 알림 대기 자료 <span className="cl-count">{pendingRows.length}건</span>
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
              ['homework', `과제 ${pendingRows.filter(row => row.type === 'homework').length}`],
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
