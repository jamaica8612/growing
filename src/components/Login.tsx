import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Sprout, LogIn, UserPlus } from 'lucide-react';

// Email/password gate. Each academy owner/admin signs in with their own
// account; RLS scopes academy data to that signed-in account.
export const Login: React.FC = () => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        // Auth state change is observed by App, which swaps in the app.
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          // Auto-confirmed: signed in immediately.
        } else {
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

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'linear-gradient(160deg, #0f3023 0%, #1b4b36 60%, #2c6f52 100%)',
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
          <div className="logo-icon">
            <Sprout size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>그로잉영어</h1>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>학원 운영 관리 시스템</span>
          </div>
        </div>

        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '1rem' }}>
          {mode === 'signin' ? '관리자 로그인' : '관리자 계정 만들기'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>이메일</label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label>비밀번호</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="6자 이상"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && (
            <div style={{ fontSize: '0.85rem', color: 'var(--color-danger)', marginBottom: '0.75rem', fontWeight: 600 }}>
              {error}
            </div>
          )}
          {info && (
            <div style={{ fontSize: '0.85rem', color: 'var(--color-primary)', marginBottom: '0.75rem', fontWeight: 600 }}>
              {info}
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', gap: '0.5rem' }} disabled={loading}>
            {mode === 'signin' ? <LogIn size={16} /> : <UserPlus size={16} />}
            {loading ? '처리 중...' : mode === 'signin' ? '로그인' : '가입하기'}
          </button>
        </form>

        <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
          {mode === 'signin' ? (
            <>
              계정이 없으신가요?{' '}
              <button
                type="button"
                onClick={() => { setMode('signup'); setError(null); setInfo(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontWeight: 700, cursor: 'pointer' }}
              >
                계정 만들기
              </button>
            </>
          ) : (
            <>
              이미 계정이 있으신가요?{' '}
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(null); setInfo(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontWeight: 700, cursor: 'pointer' }}
              >
                로그인
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
