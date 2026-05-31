import { useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Check, CheckCircle2, Clipboard, MessageSquare, Sparkles, Send, User, Loader2, X, XCircle } from 'lucide-react';
import { sendAssistantMessage, executeAction, type ChatMessage, type PendingAction } from '../lib/assistant';

// AI 학원 비서 '아이비' — 오른쪽 하단 플로팅 위젯.
// Phase 2: propose_* tool 응답에 action 객체가 오면 확인 카드를 표시하고,
// 원장님이 승인 시 execute_action으로 실제 DB를 변경한다.

interface AssistantProps {
  onSendToMessaging?: (content: string) => void;
}

const ATTENDANCE_KO: Record<string, string> = {
  present: '출석', absent: '결석', late: '출석', makeup: '보강', '(기록없음)': '기록없음',
};

const ACTION_TITLE: Record<PendingAction['type'], string> = {
  update_attendance: '출결 변경',
  create_attendance: '출결 등록',
  update_payment: '수납 처리',
};

function formatWon(amount: number) {
  return `${Math.round(amount).toLocaleString('ko-KR')}원`;
}

// ---- 확인 카드 컴포넌트 ----
interface ConfirmationCardProps {
  action: PendingAction;
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
}

function ConfirmationCard({ action, onApprove, onReject, disabled }: ConfirmationCardProps) {
  const rows: { label: string; value: string }[] = [];

  if (action.type === 'update_attendance' || action.type === 'create_attendance') {
    rows.push({ label: '학생', value: action.student_name });
    rows.push({ label: '날짜', value: action.date });
    rows.push({ label: '현재', value: ATTENDANCE_KO[action.old_status] ?? action.old_status });
    rows.push({ label: '변경 후', value: ATTENDANCE_KO[action.new_status] ?? action.new_status });
  } else if (action.type === 'update_payment') {
    rows.push({ label: '학생', value: action.student_name });
    rows.push({ label: '청구 월', value: action.billing_month });
    rows.push({ label: '금액', value: formatWon(action.amount) });
    rows.push({ label: '처리', value: '미납 → 완납' });
  }

  return (
    <div
      style={{
        marginTop: '0.6rem',
        borderRadius: 'var(--radius-md)',
        border: '1.5px solid var(--color-primary)',
        overflow: 'hidden',
        fontSize: '0.82rem',
      }}
    >
      {/* 카드 헤더 */}
      <div
        style={{
          padding: '0.45rem 0.75rem',
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark, #0c2e20))',
          color: '#fff',
          fontWeight: 700,
          fontSize: '0.78rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
        }}
      >
        <Sparkles size={13} />
        {ACTION_TITLE[action.type]} — 승인이 필요합니다
      </div>

      {/* 변경 내용 */}
      <div style={{ padding: '0.6rem 0.75rem', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {rows.map(r => (
          <div key={r.label} style={{ display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--color-text-secondary)', minWidth: '4rem' }}>{r.label}</span>
            <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{r.value}</span>
          </div>
        ))}
      </div>

      {/* 버튼 영역 */}
      <div
        style={{
          display: 'flex',
          gap: '0.4rem',
          padding: '0.5rem 0.75rem',
          borderTop: '1px solid var(--color-border)',
          backgroundColor: '#fafbfc',
        }}
      >
        <button
          type="button"
          onClick={onApprove}
          disabled={disabled}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.3rem',
            padding: '0.4rem 0',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            backgroundColor: 'var(--color-primary)',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.78rem',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <Check size={13} /> 승인
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={disabled}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.3rem',
            padding: '0.4rem 0',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            backgroundColor: '#fff',
            color: 'var(--color-text-secondary)',
            fontWeight: 700,
            fontSize: '0.78rem',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <X size={13} /> 취소
        </button>
      </div>
    </div>
  );
}

export const Assistant: React.FC<AssistantProps> = ({ onSendToMessaging }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, open]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setError(null);
    setLoading(true);
    try {
      const { reply, action } = await sendAssistantMessage(next);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: reply,
        ...(action ? { action, actionStatus: 'pending' } : {}),
      };
      setMessages([...next, assistantMsg]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 비서 응답에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveAction = async (msgIndex: number, action: PendingAction) => {
    setLoading(true);
    setError(null);
    try {
      const { message } = await executeAction(action);
      setMessages(prev =>
        prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: 'approved' as const } : m)
      );
      setMessages(prev => [...prev, { role: 'assistant', content: message }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectAction = (msgIndex: number) => {
    setMessages(prev =>
      prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: 'rejected' as const } : m)
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex(current => (current === index ? null : current)), 1600);
    } catch {
      setError('클립보드 복사에 실패했습니다. 문구를 직접 선택해 복사해 주세요.');
    }
  };

  const isDraftMessage = (content: string) => (
    content.includes('학부모님') ||
    content.includes('안내문') ||
    content.includes('초안') ||
    content.includes('발송')
  );

  const handleSendToMessaging = (content: string) => {
    onSendToMessaging?.(content);
    setOpen(false);
  };

  const suggestions = [
    '오늘 출석 현황 알려줘',
    '이번 달 미납 학부모에게 보낼 안내 문구 만들어줘',
    '홍길동 오늘 결석 → 출석으로 바꿔줘',
  ];

  return (
    <>
      {!open && (
        <button
          className="assistant-fab"
          onClick={() => setOpen(true)}
          aria-label="AI 비서 아이비 열기"
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            zIndex: 1200,
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark, #0c2e20))',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(12, 46, 32, 0.35)',
            transition: 'transform 0.15s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.06)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <Sparkles size={26} />
        </button>
      )}

      {open && (
        <div
          className="assistant-panel"
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            zIndex: 1200,
            width: 'min(390px, calc(100vw - 2rem))',
            height: 'min(600px, calc(100vh - 3rem))',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#fff',
            borderRadius: 'var(--radius-lg, 16px)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 12px 40px rgba(12, 46, 32, 0.28)',
            overflow: 'hidden',
            animation: 'slideUp 0.2s ease-out',
          }}
        >
          {/* 헤더 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.85rem 1rem',
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark, #0c2e20))',
              color: '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={18} />
              </div>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>아이비 🌱</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.85 }}>그로잉영어 AI 비서 · Beta</div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="닫기"
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '0.25rem', display: 'flex', opacity: 0.85 }}
            >
              <X size={20} />
            </button>
          </div>

          {/* 메시지 영역 */}
          <div
            ref={scrollRef}
            style={{
              flexGrow: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
              padding: '1rem 0.85rem',
              backgroundColor: '#fafbfc',
            }}
          >
            {messages.length === 0 && !loading && (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--color-text-muted)', width: '100%' }}>
                <Sparkles size={28} className="text-primary" style={{ marginBottom: '0.6rem' }} />
                <p style={{ fontSize: '0.88rem', marginBottom: '0.9rem', color: 'var(--color-text-secondary)' }}>
                  안녕하세요, 아이비예요. <br />무엇을 도와드릴까요?
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {suggestions.map(s => (
                    <button
                      key={s}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', justifyContent: 'flex-start', textAlign: 'left', padding: '0.5rem 0.7rem' }}
                      onClick={() => setInput(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'flex-start',
                  flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: m.role === 'user' ? 'var(--color-primary)' : 'var(--color-accent-mint, #a3e2c9)',
                    color: m.role === 'user' ? '#fff' : 'var(--color-primary-dark, #0c2e20)',
                  }}
                >
                  {m.role === 'user' ? <User size={15} /> : <Sparkles size={15} />}
                </div>
                <div
                  style={{
                    maxWidth: '82%',
                    minWidth: 0,
                    padding: '0.6rem 0.8rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.85rem',
                    lineHeight: 1.5,
                    whiteSpace: m.role === 'assistant' ? 'normal' : 'pre-wrap',
                    overflowWrap: 'anywhere',
                    backgroundColor: m.role === 'user' ? 'var(--color-primary)' : '#fff',
                    color: m.role === 'user' ? '#fff' : 'var(--color-text-primary)',
                    border: m.role === 'user' ? 'none' : '1px solid var(--color-border)',
                  }}
                >
                  {m.role === 'assistant' && isDraftMessage(m.content) && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.1rem 0.4rem',
                        marginBottom: '0.45rem',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: 'var(--color-accent-mint-light, #d1fae5)',
                        color: 'var(--color-primary-dark, #0c2e20)',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                      }}
                    >
                      <Sparkles size={11} /> 초안
                    </div>
                  )}

                  {m.role === 'assistant' ? (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p style={{ margin: '0 0 0.35em 0' }}>{children}</p>,
                        ul: ({ children }) => <ul style={{ margin: '0.2em 0', paddingLeft: '1.2em' }}>{children}</ul>,
                        ol: ({ children }) => <ol style={{ margin: '0.2em 0', paddingLeft: '1.3em' }}>{children}</ol>,
                        li: ({ children }) => <li style={{ margin: '0.1em 0' }}>{children}</li>,
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  ) : (
                    m.content
                  )}

                  {/* 확인 카드 */}
                  {m.role === 'assistant' && m.action && m.actionStatus === 'pending' && (
                    <ConfirmationCard
                      action={m.action}
                      onApprove={() => void handleApproveAction(i, m.action!)}
                      onReject={() => handleRejectAction(i)}
                      disabled={loading}
                    />
                  )}

                  {/* 승인/거부 결과 뱃지 */}
                  {m.role === 'assistant' && m.action && m.actionStatus === 'approved' && (
                    <div
                      style={{
                        marginTop: '0.6rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        fontSize: '0.75rem',
                        color: 'var(--color-primary-dark, #0c2e20)',
                        fontWeight: 700,
                      }}
                    >
                      <CheckCircle2 size={14} style={{ color: 'var(--color-primary)' }} /> 처리 완료
                    </div>
                  )}
                  {m.role === 'assistant' && m.action && m.actionStatus === 'rejected' && (
                    <div
                      style={{
                        marginTop: '0.6rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        fontSize: '0.75rem',
                        color: 'var(--color-text-secondary)',
                        fontWeight: 700,
                      }}
                    >
                      <XCircle size={14} /> 취소됨
                    </div>
                  )}

                  {/* 복사 / 알림장 버튼 */}
                  {m.role === 'assistant' && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem', marginTop: '0.55rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => void handleCopy(m.content, i)}
                        aria-label="아이비 답변 복사"
                        title="답변 복사"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          minHeight: '28px',
                          padding: '0.2rem 0.5rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--color-border)',
                          backgroundColor: copiedIndex === i ? 'var(--color-success-light)' : '#fff',
                          color: copiedIndex === i ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
                          font: 'inherit',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {copiedIndex === i ? <Check size={13} /> : <Clipboard size={13} />}
                        {copiedIndex === i ? '복사됨' : '복사'}
                      </button>
                      {onSendToMessaging && isDraftMessage(m.content) && (
                        <button
                          type="button"
                          onClick={() => handleSendToMessaging(m.content)}
                          aria-label="아이비 답변을 알림장으로 보내기"
                          title="알림장으로 보내기"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            minHeight: '28px',
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--color-accent-mint, #10b981)',
                            backgroundColor: 'var(--color-accent-mint-light, #d1fae5)',
                            color: 'var(--color-primary-dark, #0c2e20)',
                            font: 'inherit',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <MessageSquare size={13} /> 알림장으로
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--color-text-secondary)' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-accent-mint, #a3e2c9)', color: 'var(--color-primary-dark, #0c2e20)' }}>
                  <Sparkles size={15} />
                </div>
                <Loader2 size={15} className="text-primary" style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: '0.82rem' }}>생각하는 중...</span>
              </div>
            )}
          </div>

          {error && (
            <div style={{ padding: '0.5rem 0.85rem', backgroundColor: '#fff5f5', borderTop: '1px solid var(--color-danger-light, #fecaca)', color: 'var(--color-danger)', fontSize: '0.78rem' }}>
              ⚠️ {error}
            </div>
          )}

          {/* 입력 영역 */}
          <div style={{ display: 'flex', gap: '0.45rem', padding: '0.7rem', borderTop: '1px solid var(--color-border)', alignItems: 'flex-end', backgroundColor: '#fff' }}>
            <textarea
              className="form-control"
              style={{ resize: 'none', minHeight: '42px', maxHeight: '110px', flexGrow: 1, fontFamily: 'inherit', fontSize: '0.85rem' }}
              rows={1}
              placeholder="메시지 입력 (Enter 전송)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              className="btn btn-primary"
              style={{ height: '42px', minWidth: 'auto', padding: '0 0.85rem' }}
              onClick={() => void handleSend()}
              disabled={loading || !input.trim()}
              aria-label="전송"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
