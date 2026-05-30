import { useRef, useState, useEffect } from 'react';
import { Sparkles, Send, User, Loader2, X } from 'lucide-react';
import { sendAssistantMessage, type ChatMessage } from '../lib/assistant';

// AI 학원 비서 '아이비' — 오른쪽 하단 플로팅 위젯 (Phase 0).
// 메뉴 탭이 아니라 모든 화면에 떠 있는 런처 버튼으로, 클릭하면 채팅 팝업이
// 열린다. 현재는 Gemini와의 대화 파이프만 검증하며, DB 조회/쓰기 tool과
// 멀티 에이전트는 이후 Phase에서 연결된다.
export const Assistant: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 메시지/패널 오픈 시 항상 맨 아래로 스크롤.
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
      const { reply } = await sendAssistantMessage(next);
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 비서 응답에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 전송 / Shift+Enter 줄바꿈
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const suggestions = [
    '미납 학부모에게 보낼 안내 문구 만들어줘',
    '결석이 잦은 학생 관리 팁 알려줘',
    '신규 상담 시 체크할 항목 정리해줘',
  ];

  return (
    <>
      {/* 런처 버튼 (닫혀 있을 때) */}
      {!open && (
        <button
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

      {/* 채팅 패널 (열려 있을 때) */}
      {open && (
        <div
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
                    maxWidth: '78%',
                    padding: '0.6rem 0.8rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.85rem',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    backgroundColor: m.role === 'user' ? 'var(--color-primary)' : '#fff',
                    color: m.role === 'user' ? '#fff' : 'var(--color-text-primary)',
                    border: m.role === 'user' ? 'none' : '1px solid var(--color-border)',
                  }}
                >
                  {m.content}
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
