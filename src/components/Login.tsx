import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { LogIn, Lock, Mail } from 'lucide-react';

// Email/password gate. Each academy owner/admin signs in with their own
// account; RLS scopes academy data to that signed-in account.
export const Login: React.FC = () => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setInfo('가입이 접수되었습니다. 이메일로 받은 확인 링크를 누른 뒤 로그인해 주세요.');
          setMode('signin');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청을 처리하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setError(null);
    setInfo(null);
  };

  // 담쟁이(Ivy) SVG — 브랜드 아이콘 (lucide Sprout 대신)
  const IvyIcon = ({ size = 24 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 20h10M10 20c5.5-2.5.8-6.4 5-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.6 1.4-.5 2.6-.4 4 1.7-.4 3-1 4-2.2 1-1.3 1.3-3 1.4-4.8-2.4.6-3.9 1.5-4.7 3z" />
    </svg>
  );

  return (
    <div className="lg-root">
      {/* ── 좌측 포레스트 브랜드 패널 (데스크탑만) ── */}
      <aside className="lg-aside" aria-hidden="true">
        {/* 잎사귀 배경 모티프 */}
        <div className="lg-aside-leaf">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 22c5-3 9-7 9-13 0-3-1-6-1-6s-4 1-7 4-4 7-4 10c0 0-2-1-3-3 0 0 0 5 6 8z" />
          </svg>
        </div>
        <div className="lg-aside-tx">
          <div className="lg-aside-logo">
            <span className="lg-aside-ic">
              <IvyIcon size={26} />
            </span>
            그로잉영어
          </div>
          <h2 className="lg-aside-h">학생의 성장을<br />하나의 화면에서.</h2>
          <p className="lg-aside-p">
            출결·수납·상담·알림장·키오스크, 그리고 AI 비서 아이비까지 — 원장님의 하루를 가볍게.
          </p>
          <div className="lg-aside-tags">
            <span>🌱 출결 자동화</span>
            <span>💬 학부모 알림</span>
            <span>🧠 아이비</span>
          </div>
        </div>
      </aside>

      {/* ── 우측 폼 패널 ── */}
      <div className="lg-panel">
        <div className="lg-form">
          {/* 모바일 전용 로고 */}
          <div className="lg-brand-m">
            <span className="lg-aside-ic sm">
              <IvyIcon size={18} />
            </span>
            그로잉영어
          </div>

          <h1 className="lg-title">
            {mode === 'signin' ? '다시 오신 걸 환영해요' : '관리자 계정 만들기'}
          </h1>
          <p className="lg-sub">
            {mode === 'signin'
              ? '교습소 운영 관리 시스템에 로그인하세요.'
              : '이메일로 계정을 만들면 바로 시작할 수 있어요.'}
          </p>

          {/* 로그인 / 가입 세그먼트 토글 */}
          <div className="lg-seg">
            <button
              type="button"
              className={mode === 'signin' ? 'on' : ''}
              onClick={() => switchMode('signin')}
            >
              로그인
            </button>
            <button
              type="button"
              className={mode === 'signup' ? 'on' : ''}
              onClick={() => switchMode('signup')}
            >
              계정 만들기
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* 이메일 필드 */}
            <label className="lg-label">이메일</label>
            <div className="lg-field">
              <Mail size={16} />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            {/* 비밀번호 필드 */}
            <label className="lg-label">비밀번호</label>
            <div className="lg-field">
              <Lock size={16} />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="6자 이상"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>

            {/* 로그인 유지 + 비밀번호 찾기 */}
            <div className="lg-row">
              <label className="lg-check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                />
                <span className="lg-box" />
                로그인 유지
              </label>
              {mode === 'signin' && (
                <button
                  type="button"
                  className="lg-link"
                  onClick={() => setInfo('비밀번호 재설정 이메일이 발송됩니다. 관리자에게 문의해 주세요.')}
                >
                  비밀번호 찾기
                </button>
              )}
            </div>

            {/* 에러 / 안내 메시지 */}
            {error && <div className="lg-err">⚠ {error}</div>}
            {info && <div className="lg-info">✓ {info}</div>}

            {/* 제출 버튼 */}
            <button type="submit" className="lg-submit" disabled={loading}>
              <LogIn size={17} />
              {loading ? '처리 중...' : mode === 'signin' ? '로그인' : '가입하고 시작하기'}
            </button>
          </form>

          {/* 모드 전환 푸터 */}
          <p className="lg-foot">
            {mode === 'signin' ? '계정이 없으신가요? ' : '이미 계정이 있으신가요? '}
            <button
              type="button"
              className="lg-link"
              onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
            >
              {mode === 'signin' ? '계정 만들기' : '로그인'}
            </button>
          </p>

          <p className="lg-note">
            로그인하면 계정 기준으로 학원 데이터가 안전하게 분리·보관돼요.
          </p>
        </div>
      </div>
    </div>
  );
};
