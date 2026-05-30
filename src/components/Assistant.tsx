import { useRef, useState, useEffect } from 'react';
import { Sparkles, Send, User, Loader2 } from 'lucide-react';
import { sendAssistantMessage, type ChatMessage } from '../lib/assistant';

// AI 학원 비서 채팅 패널 (Phase 0). 현재는 Gemini와의 대화 파이프만 검증한다.
// DB 조회/쓰기 tool과 멀티 에이전트는 이후 Phase에서 연결된다.
export const Assistant: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 메시지가 추가되면 항상 맨 아래로 스크롤.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

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
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)', minHeight: '480px' }}>
      <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>
        <Sparkles size={20} className="text-primary" /> 아이비 <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--color-text-secondary)' }}>· 그로잉영어 AI 비서</span>
        <span className="badge badge-present" style={{ fontSize: '0.65rem', marginLeft: '0.5rem' }}>Beta</span>
      </h3>
      <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
        안녕하세요, 아이비예요 🌱 그로잉영어 운영을 도와드립니다. (현재는 대화 단계 — 학원 데이터 직접 조회는 곧 연결됩니다)
      </p>

      {/* 메시지 영역 */}
      <div
        ref={scrollRef}
        style={{
          flexGrow: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          padding: '0.5rem',
          backgroundColor: '#fafbfc',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
        }}
      >
        {messages.length === 0 && !loading && (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--color-text-muted)', maxWidth: '420px' }}>
            <Sparkles size={32} className="text-primary" style={{ marginBottom: '0.75rem' }} />
            <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>무엇을 도와드릴까요?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {suggestions.map(s => (
                <button
                  key={s}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8rem', justifyContent: 'flex-start' }}
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
              gap: '0.6rem',
              alignItems: 'flex-start',
              flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
            }}
          >
            <div
              style={{
                flexShrink: 0,
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: m.role === 'user' ? 'var(--color-primary)' : 'var(--color-accent-mint, #a3e2c9)',
                color: m.role === 'user' ? '#fff' : 'var(--color-primary-dark, #0c2e20)',
              }}
            >
              {m.role === 'user' ? <User size={16} /> : <Sparkles size={16} />}
            </div>
            <div
              style={{
                maxWidth: '75%',
                padding: '0.7rem 0.9rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.88rem',
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
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', color: 'var(--color-text-secondary)' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-accent-mint, #a3e2c9)', color: 'var(--color-primary-dark, #0c2e20)' }}>
              <Sparkles size={16} />
            </div>
            <Loader2 size={16} className="text-primary" style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.85rem' }}>생각하는 중...</span>
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-md)', backgroundColor: '#fff5f5', border: '1px solid var(--color-danger-light, #fecaca)', color: 'var(--color-danger)', fontSize: '0.82rem' }}>
          ⚠️ {error}
        </div>
      )}

      {/* 입력 영역 */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'flex-end' }}>
        <textarea
          className="form-control"
          style={{ resize: 'none', minHeight: '46px', maxHeight: '120px', flexGrow: 1, fontFamily: 'inherit' }}
          rows={1}
          placeholder="메시지를 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          className="btn btn-primary"
          style={{ height: '46px', gap: '0.35rem' }}
          onClick={() => void handleSend()}
          disabled={loading || !input.trim()}
        >
          <Send size={16} /> 전송
        </button>
      </div>
    </div>
  );
};
