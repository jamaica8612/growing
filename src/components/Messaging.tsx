import React, { useState, useMemo } from 'react';
import type { Student, KioskAlert } from '../types';
import { MessageSquare, Copy, Check, Send, User, Bell, Trash2, Sparkles } from 'lucide-react';

interface MessagingProps {
  students: Student[];
  kioskAlerts: KioskAlert[];
  onDismissAlert: (id: string) => void;
  onClearAlerts: () => void;
  assistantDraft?: {
    id: number;
    content: string;
  } | null;
}

type TemplateType = 'in' | 'out' | 'homework' | 'makeup' | 'test' | 'custom';

// Shared check-in / check-out message body, reused by both the manual
// composer and the kiosk auto-queue so the wording stays in one place.
const buildCheckMessage = (studentName: string, kind: 'in' | 'out', time: string) =>
  kind === 'in'
    ? `안녕하세요, 그로잉영어입니다. 🌱\n\n오늘 ${studentName} 학생이 ${time}에 안전하게 등원하였습니다.\n오늘도 밝은 분위기 속에서 즐겁고 성실하게 공부하고 귀가할 수 있도록 지도하겠습니다. 감사합니다.`
    : `안녕하세요, 그로잉영어입니다. 🌱\n\n오늘 ${studentName} 학생이 금일 개별 학습 일정을 건강하게 마치고 ${time}에 하원하였습니다.\n가정에서도 숙제 수행 및 오늘 배운 단어를 복습할 수 있도록 격려와 지도 유도 부탁드립니다. 조은 하루 보내세요!`;

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

export const Messaging: React.FC<MessagingProps> = ({ students, kioskAlerts, onDismissAlert, onClearAlerts, assistantDraft }) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => findDraftStudentId(students, assistantDraft?.content));
  const [copiedAlertId, setCopiedAlertId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>(() => assistantDraft?.content ? 'custom' : 'in');
  const [customMessage, setCustomMessage] = useState(() => assistantDraft?.content ?? '');
  
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
    const parentName = `${studentName} 학부모님`;

    switch (selectedTemplate) {
      case 'custom':
        return customMessage || '아이비 초안이나 직접 작성한 메시지가 이곳에 표시됩니다. 🌱';
      case 'in':
        return buildCheckMessage(studentName, 'in', paramTime);
      case 'out':
        return buildCheckMessage(studentName, 'out', paramTime);
      case 'homework':
        return `안녕하세요, 그로잉영어입니다. 🌱\n\n${parentName}께 안내 말씀드립니다.\n\n오늘 ${studentName} 학생이 숙제 및 단어 준비가 다소 부족하여 교습소에서 1:1 집중 보완 지도 및 밀린 숙제를 완료한 후 귀가할 예정입니다. 귀가 시간이 다소 지연되더라도 양해 부탁드리며, 가정에서도 규칙적인 학습 습관이 잡힐 수 있도록 관심 부탁드립니다.`;
      case 'makeup':
        return `안녕하세요, 그로잉영어입니다. 🌱\n\n${studentName} 학생의 미수강 진도 보충을 위한 개별 보강 수업 일정을 안내드립니다.\n\n- 일시: ${paramDate} ${paramTime}\n\n학생이 늦지 않고 출석하여 진도를 맞출 수 있도록 학부모님의 지도 협조 부탁드립니다. 감사합니다.`;
      case 'test':
        return `안녕하세요, 그로잉영어입니다. 🌱\n\n오늘 시행한 ${studentName} 학생의 단원 평가 결과를 안내해 드립니다.\n\n- 평가 영역: ${paramTestName}\n- 평가 점수: ${paramScore}\n\n스스로 열심히 노력하여 훌륭한 성취를 낸 ${studentName} 학생에게 아낌없는 칭찬과 응원 부탁드립니다. 늘 믿고 맡겨주셔서 감사드립니다.`;
      default:
        return '';
    }
  }, [selectedStudentId, selectedTemplate, customMessage, paramTime, paramDate, paramTestName, paramScore, students]);

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

  const currentStudent = students.find(s => s.id === selectedStudentId);
  const draftMatchedStudent = assistantDraft?.content ? students.find(s => s.id === findDraftStudentId(students, assistantDraft.content)) : null;

  return (
    <div>
      {/* Kiosk check-in/out notifications awaiting send */}
      {kioskAlerts.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '5px solid var(--color-warning)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <h3 className="card-title" style={{ margin: 0 }}>
              <Bell size={20} className="text-secondary" /> 키오스크 자동 발송 대기 ({kioskAlerts.length}건)
            </h3>
            <button
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', gap: '0.3rem' }}
              onClick={onClearAlerts}
            >
              <Trash2 size={14} /> 전체 비우기
            </button>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
            학생이 키오스크에서 등·하원을 체크하면 자동으로 여기에 쌓입니다. 복사하거나 문자로 보낸 뒤 [완료]를 눌러 정리하세요.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '340px', overflowY: 'auto' }}>
            {[...kioskAlerts].reverse().map(alert => {
              const student = students.find(s => s.id === alert.studentId);
              const name = student?.name ?? '알수없음';
              const contact = student?.parentContact ?? '';
              const message = buildCheckMessage(name, alert.kind, alert.time);
              return (
                <div
                  key={alert.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: '#fafcfb',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <span className={`badge ${alert.kind === 'in' ? 'badge-present' : 'badge-makeup'}`} style={{ fontSize: '0.72rem' }}>
                      {alert.kind === 'in' ? '등원' : '하원'}
                    </span>
                    <strong style={{ color: 'var(--color-primary-dark)' }}>{name}</strong>
                    <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>{alert.time}</span>
                    <span style={{ fontSize: '0.78rem', color: contact ? 'var(--color-text-muted)' : 'var(--color-danger)' }}>
                      {contact ? `📞 ${contact}` : '연락처 없음'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem', gap: '0.25rem' }}
                      onClick={() => handleCopyAlert(alert.id, message)}
                    >
                      {copiedAlertId === alert.id ? <><Check size={13} className="text-success" /> 복사됨</> : <><Copy size={13} /> 복사</>}
                    </button>
                    {contact && (
                      <a
                        href={buildSMSLink(contact, message)}
                        className="btn btn-primary"
                        style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem', gap: '0.25rem', textDecoration: 'none' }}
                      >
                        <Send size={13} /> 문자
                      </a>
                    )}
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem' }}
                      onClick={() => onDismissAlert(alert.id)}
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
