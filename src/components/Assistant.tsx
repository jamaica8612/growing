import { useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Check, CheckCircle2, Copy, MessageSquare, RefreshCw, Send, X, XCircle, AlertCircle } from 'lucide-react';
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
  create_counsel_log: '일지 작성',
  update_student_memo: '메모 수정',
};

const LOG_TYPE_KO: Record<string, string> = {
  counsel: '상담', progress: '진도', test: '시험',
};

const SUGGESTION_GROUPS = [
  {
    title: '오늘 업무',
    prompts: [
      '오늘 브리핑 해줘',
      '오늘 출석 현황과 미체크 학생 알려줘',
      '이번 달 우선 관리 대상 학생 정리해줘',
    ],
  },
  {
    title: '학생·반 조회',
    prompts: [
      '재원생 명단을 학교별로 정리해줘',
      '휴원생 목록과 반 배정 상태 알려줘',
      '중등 문법반 학생과 수업 시간표 알려줘',
    ],
  },
  {
    title: '출결·수납',
    prompts: [
      '이번 달 출석률 낮은 학생 순서대로 보여줘',
      '이번 달 미납 학생과 총액 알려줘',
      '홍길동 오늘 결석을 출석으로 바꿔줘',
      '홍길동 2026-06 수납 완납 처리해줘',
    ],
  },
  {
    title: '상담·안내문',
    prompts: [
      '홍길동 최근 상담/진도 기록 요약해줘',
      '홍길동 학부모님께 보낼 출결 안내문 써줘',
      '홍길동 단어 테스트 80점, 숙제 미흡으로 상담일지 작성해줘',
      '홍길동 메모에 "어휘 복습을 자주 확인" 추가해줘',
    ],
  },
  {
    title: '기억·자료',
    prompts: [
      '앞으로 안내문은 짧고 따뜻한 톤으로 써줘',
      '아이비가 읽을 수 있는 데이터 목록 보여줘',
      '최근 알림장 발송 기록이 있으면 보여줘',
    ],
  },
];

function truncate(text: string, max = 80) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function formatWon(amount: number) {
  return `${Math.round(amount).toLocaleString('ko-KR')}원`;
}

// ── 아이비 아바타 (새싹 캐릭터) ──
function IvyAvatar({ size = 36, state = 'idle', ring = false }: {
  size?: number;
  state?: 'idle' | 'thinking';
  ring?: boolean;
}) {
  const s = size;
  return (
    <span
      className={`ivy-avatar${state === 'thinking' ? ' is-thinking' : ''}${ring ? ' has-ring' : ''}`}
      style={{ width: s, height: s }}
    >
      <svg
        width={s * 0.62}
        height={s * 0.62}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M7 20h10M10 20c5.5-2.5.8-6.4 5-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.6 1.4-.5 2.6-.4 4 1.7-.4 3-1 4-2.2 1-1.3 1.3-3 1.4-4.8-2.4.6-3.9 1.5-4.7 3z" />
      </svg>
    </span>
  );
}

// ── 승인 카드 — pending/approved/rejected 세 상태 통합 ──
interface ConfirmationCardProps {
  action: PendingAction;
  status: 'pending' | 'approved' | 'rejected';
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
}

function ConfirmationCard({ action, status, onApprove, onReject, disabled }: ConfirmationCardProps) {
  if (status === 'approved') {
    return (
      <div className="ivy-result ok">
        <CheckCircle2 size={14} /> 처리 완료
      </div>
    );
  }
  if (status === 'rejected') {
    return (
      <div className="ivy-result no">
        <XCircle size={14} /> 취소됨
      </div>
    );
  }

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
  } else if (action.type === 'create_counsel_log') {
    rows.push({ label: '학생', value: action.student_name });
    rows.push({ label: '종류', value: LOG_TYPE_KO[action.log_type] ?? action.log_type });
    rows.push({ label: '날짜', value: action.date });
    rows.push({ label: '제목', value: action.title });
    rows.push({ label: '내용', value: truncate(action.content) });
    if (action.score) rows.push({ label: '점수', value: action.score });
  } else if (action.type === 'update_student_memo') {
    rows.push({ label: '학생', value: action.student_name });
    rows.push({ label: '현재 메모', value: action.old_memo ? truncate(action.old_memo) : '(없음)' });
    rows.push({ label: '변경 후', value: truncate(action.new_memo) });
  }

  return (
    <div className="ivy-confirm">
      <div className="ivy-confirm-head">
        <IvyAvatar size={14} />
        {ACTION_TITLE[action.type]} — 승인이 필요해요
      </div>
      <div className="ivy-confirm-body">
        {rows.map(r => (
          <div key={r.label} className="ivy-confirm-row">
            <span>{r.label}</span>
            <b>{r.value}</b>
          </div>
        ))}
      </div>
      <div className="ivy-confirm-btns">
        <button type="button" className="ivy-approve" onClick={onApprove} disabled={disabled}>
          <Check size={13} /> 승인
        </button>
        <button type="button" className="ivy-reject" onClick={onReject} disabled={disabled}>
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
  const [activeSuggestionGroup, setActiveSuggestionGroup] = useState(SUGGESTION_GROUPS[0].title);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, open]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1900);
  };

  const runConversation = async (msgs: ChatMessage[]) => {
    setError(null);
    setLoading(true);
    try {
      const { reply, action } = await sendAssistantMessage(msgs);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: reply,
        ...(action ? { action, actionStatus: 'pending' } : {}),
      };
      setMessages([...msgs, assistantMsg]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '아이비가 잠시 답하지 못했어요. 다시 시도해 주세요. 🙏');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    await runConversation(next);
  };

  const handleRetry = async () => {
    if (loading || messages.length === 0) return;
    if (messages[messages.length - 1].role !== 'user') return;
    await runConversation(messages);
  };

  const handleApproveAction = async (msgIndex: number, action: PendingAction) => {
    setLoading(true);
    setError(null);
    try {
      const { message } = await executeAction(action);
      setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: 'approved' as const } : m));
      setMessages(prev => [...prev, { role: 'assistant', content: message }]);
      flash('변경을 저장했어요');
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectAction = (msgIndex: number) => {
    setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: 'rejected' as const } : m));
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
      flash('답변을 복사했어요');
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
    flash('알림장 발송으로 전달했어요');
    setOpen(false);
  };

  const activeSuggestions = SUGGESTION_GROUPS.find(g => g.title === activeSuggestionGroup) ?? SUGGESTION_GROUPS[0];

  return (
    <>
      {/* FAB — 스퀘어클(radius 20) + 알림 점 + float 애니메이션 */}
      {!open && (
        <button
          className="ivy-fab"
          onClick={() => setOpen(true)}
          aria-label="AI 비서 아이비 열기"
        >
          <IvyAvatar size={34} />
          <span className="ivy-fab-dot" />
        </button>
      )}

      {/* 패널 */}
      {open && (
        <div className="ivy-panel">
          {/* 포레스트 헤더 + 온라인 점 */}
          <header className="ivy-head">
            <div className="ivy-head-id">
              <span className="ivy-head-av">
                <IvyAvatar size={38} />
                <span className="ivy-online" />
              </span>
              <div>
                <div className="ivy-name">아이비</div>
                <div className="ivy-role">그로잉영어 운영 비서 · 온라인</div>
              </div>
            </div>
            <div className="ivy-head-btns">
              <button
                type="button"
                className="ivy-iconbtn"
                title="대화 비우기"
                onClick={() => { setMessages([]); setError(null); }}
              >
                <RefreshCw size={16} />
              </button>
              <button
                type="button"
                className="ivy-iconbtn"
                title="닫기"
                onClick={() => setOpen(false)}
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            </div>
          </header>

          {/* 메시지 영역 */}
          <div className="ivy-body" ref={scrollRef}>
            {/* 웰컴 — 그룹 탭 + 추천 질문 */}
            {messages.length === 0 && !loading && (
              <div>
                <div className="ivy-welcome-top">
                  <IvyAvatar size={48} ring />
                  <div>
                    <div className="ivy-welcome-h">안녕하세요, 아이비예요 🌱</div>
                    <p className="ivy-welcome-p">
                      조회·브리핑·안내문 초안을 돕고, 저장·변경은 승인 후 처리해요.
                    </p>
                  </div>
                </div>

                <div className="ivy-tabs">
                  {SUGGESTION_GROUPS.map(group => (
                    <button
                      key={group.title}
                      type="button"
                      className={`ivy-tab${activeSuggestionGroup === group.title ? ' on' : ''}`}
                      onClick={() => setActiveSuggestionGroup(group.title)}
                    >
                      {group.title}
                    </button>
                  ))}
                </div>

                <div className="ivy-prompts">
                  {activeSuggestions.prompts.map(prompt => (
                    <button
                      key={prompt}
                      type="button"
                      className="ivy-prompt"
                      onClick={() => setInput(prompt)}
                    >
                      <span>{prompt}</span>
                      <span className="ivy-prompt-arrow">↗</span>
                    </button>
                  ))}
                </div>

                <p className="ivy-note">출결·수납·일지·메모 변경은 확인 카드에서 승인해야 저장됩니다.</p>
              </div>
            )}

            {/* 메시지 목록 */}
            {messages.map((m, i) => (
              <div key={i} className={`ivy-msg${m.role === 'user' ? ' user' : ' ivy'}`}>
                {/* 아이비 아바타 (왼쪽, 아이비 메시지만) */}
                {m.role !== 'user' && <IvyAvatar size={28} />}

                <div className={`ivy-bubble${m.role === 'user' ? ' user' : ' ivy'}`}>
                  {/* 초안 배지 */}
                  {m.role === 'assistant' && isDraftMessage(m.content) && (
                    <div className="ivy-draft">✦ 초안</div>
                  )}

                  {/* 본문 */}
                  {m.role === 'assistant' ? (
                    <div className="ivy-rich">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="ivy-p">{children}</p>,
                          ul: ({ children }) => <ul className="ivy-ul">{children}</ul>,
                          ol: ({ children }) => <ol className="ivy-ul">{children}</ol>,
                          li: ({ children }) => <li>{children}</li>,
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}

                  {/* 승인 카드 (pending/approved/rejected 통합) */}
                  {m.role === 'assistant' && m.action && (
                    <ConfirmationCard
                      action={m.action}
                      status={m.actionStatus ?? 'pending'}
                      onApprove={() => void handleApproveAction(i, m.action!)}
                      onReject={() => handleRejectAction(i)}
                      disabled={loading}
                    />
                  )}

                  {/* 복사 / 알림장으로 */}
                  {m.role === 'assistant' && (
                    <div className="ivy-actions">
                      <button
                        type="button"
                        className={`ivy-act${copiedIndex === i ? ' done' : ''}`}
                        onClick={() => void handleCopy(m.content, i)}
                        aria-label="답변 복사"
                      >
                        {copiedIndex === i ? <Check size={12} /> : <Copy size={12} />}
                        {copiedIndex === i ? '복사됨' : '복사'}
                      </button>
                      {onSendToMessaging && isDraftMessage(m.content) && (
                        <button
                          type="button"
                          className="ivy-act mint"
                          onClick={() => handleSendToMessaging(m.content)}
                          aria-label="알림장으로 보내기"
                        >
                          <MessageSquare size={12} /> 알림장으로
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* 타이핑 인디케이터 — 점 3개 바운스 */}
            {loading && (
              <div className="ivy-msg ivy">
                <IvyAvatar size={28} state="thinking" />
                <div className="ivy-bubble ivy ivy-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          {/* 에러 표시 */}
          {error && (
            <div className="ivy-error">
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <AlertCircle size={14} /> {error}
              </span>
              {!loading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                <button
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', minWidth: 'auto', flexShrink: 0 }}
                  onClick={() => void handleRetry()}
                >
                  다시 시도
                </button>
              )}
            </div>
          )}

          {/* 입력 영역 — 둥근 textarea + 원형 전송 버튼 */}
          <div className="ivy-input">
            <textarea
              rows={1}
              placeholder="아이비에게 물어보기… (Enter 전송)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              type="button"
              className="ivy-send"
              onClick={() => void handleSend()}
              disabled={loading || !input.trim()}
              aria-label="전송"
            >
              <Send size={16} />
            </button>
          </div>

          {/* 토스트 */}
          {toast && (
            <div className="ivy-toast">
              <Check size={14} /> {toast}
            </div>
          )}
        </div>
      )}
    </>
  );
};
