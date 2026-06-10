import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, Copy, KeyRound, Link2, MessageCircle, ShieldCheck, UserX } from 'lucide-react';
import type { KakaoChannelConfig, KakaoEventLog, KakaoParentLink, KakaoParentRequest, KakaoParentRequestStatus, Student } from '../types';

interface KakaoManagerProps {
  students: Student[];
  channels: KakaoChannelConfig[];
  links: KakaoParentLink[];
  requests: KakaoParentRequest[];
  events: KakaoEventLog[];
  onUpdateRequestStatus: (id: string, status: KakaoParentRequestStatus) => void;
  onSaveChannel: (config: { id?: string; channelName: string; skillSecret: string; eventSecret?: string; enabled: boolean; autoReply: boolean }) => void;
}

const requestTypeLabel: Record<KakaoParentRequest['requestType'], string> = {
  attendance: '출결 확인',
  homework: '숙제 확인',
  counsel: '상담 요청',
  connect: '학생 연결',
};

const requestStatusLabel: Record<KakaoParentRequestStatus, string> = {
  pending: '대기',
  drafted: '답변 준비',
  resolved: '처리 완료',
  dismissed: '보류',
};

const statusPillClass: Record<KakaoParentRequestStatus, string> = {
  pending: 'at-pill warn',
  drafted: 'at-pill info',
  resolved: 'at-pill ok',
  dismissed: 'at-pill info',
};

const fmtDateTime = (iso?: string) => {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const maskKey = (value: string) => {
  if (!value) return '-';
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const cleanPhone = (value: string) => value.replace(/[^0-9]/g, '');

const makeSecret = () => {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

export function KakaoManager({ students, channels, links, requests, events, onUpdateRequestStatus, onSaveChannel }: KakaoManagerProps) {
  const [activeTab, setActiveTab] = useState<'inbox' | 'links' | 'settings'>('inbox');
  const primaryChannel = channels[0];
  const [autoReply, setAutoReply] = useState(primaryChannel?.autoReply ?? true);
  const [channelName, setChannelName] = useState(primaryChannel?.channelName || '그로잉영어 카카오 채널');
  const [skillSecret, setSkillSecret] = useState(primaryChannel?.skillSecret || '');
  const [eventSecret, setEventSecret] = useState(primaryChannel?.eventSecret || '');
  const [enabled, setEnabled] = useState(primaryChannel?.enabled ?? true);
  // 저장 후 props 변경 시 폼 상태 동기화
  useEffect(() => {
    if (!primaryChannel) return;
    setChannelName(primaryChannel.channelName || '그로잉영어 카카오 채널');
    setSkillSecret(primaryChannel.skillSecret || '');
    setEventSecret(primaryChannel.eventSecret || '');
    setEnabled(primaryChannel.enabled ?? true);
    setAutoReply(primaryChannel.autoReply ?? true);
  }, [primaryChannel]);

  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const skillUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/kakao-skill` : 'Supabase URL 설정 필요';
  const eventUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/kakao-channel-event` : 'Supabase URL 설정 필요';
  const skillUrlWithSecret = skillSecret && supabaseUrl ? `${skillUrl}?secret=${encodeURIComponent(skillSecret)}` : skillUrl;
  const eventUrlWithSecret = eventSecret && supabaseUrl ? `${eventUrl}?secret=${encodeURIComponent(eventSecret)}` : eventUrl;
  const studentById = new Map(students.map(student => [student.id, student]));
  const linkedStudentIds = new Set(links.filter(link => !link.blockedAt).map(link => link.studentId));
  const unlinkedStudents = students.filter(student => student.status === 'active' && student.parentContact && !linkedStudentIds.has(student.id));
  const pendingRequests = requests.filter(request => request.requestType === 'counsel' && request.status === 'pending');
  const activeLinks = links.filter(link => !link.blockedAt);
  const blockedLinks = links.filter(link => link.blockedAt);

  return (
    <div className="gd-root kakao-admin">
      <div className="ka-intro">
        <span className="ka-k">K</span>
        <p>
          카카오 채널봇 연결을 관리합니다. 학생 연결 상태와 상담 요청 큐, 최근 요청 로그를 확인합니다.
        </p>
      </div>

      <div className="ka-tabs" role="tablist" aria-label="카카오 관리 분류">
        {([
          ['inbox', '요청 큐', pendingRequests.length],
          ['links', '연결', null],
          ['settings', '설정', null],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            className={`ka-tab${activeTab === key ? ' on' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
            {count ? <span className="ka-n">{count}</span> : null}
          </button>
        ))}
      </div>

      <div className="gd-stats">
        <div className="gd-stat">
          <div className="gd-stat-ic" style={{ background: '#e9f8f1', color: 'var(--color-accent-mint)' }}>
            <Link2 size={22} />
          </div>
          <div className="gd-stat-body">
            <span className="gd-stat-label">연결된 학부모</span>
            <span className="gd-stat-val">{activeLinks.length}<em>명</em></span>
          </div>
        </div>
        <div className="gd-stat">
          <div className="gd-stat-ic" style={{ background: '#fff4de', color: '#b4710a' }}>
            <Clock3 size={22} />
          </div>
          <div className="gd-stat-body">
            <span className="gd-stat-label">상담/문의 대기</span>
            <span className="gd-stat-val">{pendingRequests.length}<em>건</em></span>
          </div>
        </div>
        <div className="gd-stat">
          <div className="gd-stat-ic" style={{ background: '#eef4ff', color: 'var(--color-info)' }}>
            <MessageCircle size={22} />
          </div>
          <div className="gd-stat-body">
            <span className="gd-stat-label">최근 카카오 요청</span>
            <span className="gd-stat-val">{events.length}<em>건</em></span>
          </div>
        </div>
        <div className="gd-stat">
          <div className="gd-stat-ic" style={{ background: '#fdeaea', color: 'var(--color-danger)' }}>
            <UserX size={22} />
          </div>
          <div className="gd-stat-body">
            <span className="gd-stat-label">차단/수신거부</span>
            <span className="gd-stat-val">{blockedLinks.length}<em>명</em></span>
          </div>
        </div>
      </div>

      {activeTab === 'settings' && (
      <section className="gd-card">
        <div className="kakao-card-head">
          <div>
            <h3>채널 분리 설정</h3>
            <p>같은 DB 안에 다른 앱/학원이 있어도 이 secret으로 들어온 요청만 해당 owner 데이터에 연결됩니다.</p>
          </div>
          <KeyRound size={20} />
        </div>
        <div className="ka-fields">
          <div className="ka-field">
            <label>채널명</label>
            <input className="gd-field" value={channelName} onChange={event => setChannelName(event.target.value)} />
          </div>
          <div className="ka-field">
            <label>Skill secret 헤더값</label>
            <div className="ka-url">
              <input className="gd-field" value={skillSecret} onChange={event => setSkillSecret(event.target.value)} placeholder="생성 버튼을 눌러 주세요" />
              <button className="pay-btn ghost sm" type="button" onClick={() => setSkillSecret(makeSecret())}>생성</button>
            </div>
          </div>
          <div className="ka-field">
            <label>Event secret 헤더값</label>
            <div className="ka-url">
              <input className="gd-field" value={eventSecret} onChange={event => setEventSecret(event.target.value)} placeholder="생성 버튼을 눌러 주세요" />
              <button className="pay-btn ghost sm" type="button" onClick={() => setEventSecret(makeSecret())}>생성</button>
            </div>
          </div>
          <div className="ka-field">
            <label>Skill URL (헤더 방식)</label>
            <div className="ka-url">
              <code>{skillUrl}</code>
              <button className="pay-btn ghost sm" type="button" onClick={() => void navigator.clipboard.writeText(skillUrl)}>
                <Copy size={14} /> 복사
              </button>
            </div>
          </div>
          <div className="ka-field">
            <label>Skill URL (secret 포함)</label>
            <div className="ka-url">
              <code>{skillUrlWithSecret}</code>
              <button className="pay-btn ghost sm" type="button" onClick={() => void navigator.clipboard.writeText(skillUrlWithSecret)}>
                <Copy size={14} /> 복사
              </button>
            </div>
          </div>
          <div className="ka-field">
            <label>Event URL (헤더 방식)</label>
            <div className="ka-url">
              <code>{eventUrl}</code>
              <button className="pay-btn ghost sm" type="button" onClick={() => void navigator.clipboard.writeText(eventUrl)}>
                <Copy size={14} /> 복사
              </button>
            </div>
          </div>
          <div className="ka-field">
            <label>Event URL (secret 포함)</label>
            <div className="ka-url">
              <code>{eventUrlWithSecret}</code>
              <button className="pay-btn ghost sm" type="button" onClick={() => void navigator.clipboard.writeText(eventUrlWithSecret)}>
                <Copy size={14} /> 복사
              </button>
            </div>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-muted)', margin: '0.2rem 0' }}>
            카카오 관리자에서 헤더 입력이 가능하면 <b>x-kakao-skill-secret</b> / <b>x-kakao-event-secret</b>을 쓰고, 불가능하면 secret 포함 URL을 사용하세요.
          </p>
          <label className="kakao-toggle">
            <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />
            <span>이 채널 사용</span>
          </label>
        </div>
        <div className="ka-auto-toggle">
          <div className="ka-auto-tx">
            <b>출결·숙제 자동응답</b>
            <span className="ka-auto-note">
              {autoReply ? '출결/숙제 문의는 DB 조회 후 즉시 답변합니다.' : '모든 문의를 요청 큐에서 수동 처리합니다.'}
            </span>
          </div>
          <button
            type="button"
            className={`ka-switch${autoReply ? ' on' : ''}`}
            onClick={() => setAutoReply(!autoReply)}
            aria-pressed={autoReply}
            aria-label="자동응답 켜기/끄기"
          >
            <span className="ka-auto-dot" />
          </button>
        </div>
        <div className="kakao-actions" style={{ marginTop: '0.9rem' }}>
          <button
            className="pay-btn primary"
            type="button"
            disabled={!channelName.trim() || !skillSecret.trim()}
            onClick={() => onSaveChannel({
              id: primaryChannel?.id,
              channelName: channelName.trim(),
              skillSecret: skillSecret.trim(),
              eventSecret: eventSecret.trim(),
              enabled,
              autoReply,
            })}
          >
            채널 설정 저장
          </button>
        </div>
      </section>
      )}

      {activeTab === 'links' && (
      <div className="kakao-grid">
        <section className="gd-card">
          <div className="kakao-card-head">
            <div>
              <h3>학부모 연결 상태</h3>
              <p>학생명과 보호자 전화번호가 맞으면 카카오 사용자와 학생이 연결됩니다.</p>
            </div>
            <ShieldCheck size={20} />
          </div>
          {activeLinks.length === 0 ? (
            <div className="gd-empty">
              <Link2 size={28} />
              <span>아직 연결된 학부모가 없습니다.</span>
            </div>
          ) : (
            <div className="ka-links">
              {activeLinks.map(link => {
                const student = studentById.get(link.studentId);
                return (
                  <div key={link.id} className="ka-link">
                    <span className="ka-av">{student?.name?.[0] ?? '?'}</span>
                    <div>
                      <b>{student?.name ?? '알 수 없는 학생'}</b>
                      <br />
                      <span>{cleanPhone(link.parentPhone) || '전화번호 없음'} · {maskKey(link.kakaoUserKey)}</span>
                    </div>
                    <span className="ka-state linked">{fmtDateTime(link.verifiedAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="gd-card">
          <div className="kakao-card-head">
            <div>
              <h3>아직 연결 안 된 학생</h3>
              <p>보호자 연락처가 있는 재원생 중 카카오 연결이 없는 학생입니다.</p>
            </div>
            <Link2 size={20} />
          </div>
          {unlinkedStudents.length === 0 ? (
            <div className="gd-empty">
              <CheckCircle2 size={28} />
              <span>연결 대기 학생이 없습니다.</span>
            </div>
          ) : (
            <div className="ka-links">
              {unlinkedStudents.map(student => (
                <div key={student.id} className="ka-link">
                  <span className="ka-av">{student.name[0]}</span>
                  <div>
                    <b>{student.name}</b>
                    <br />
                    <span>{student.grade || '학년 없음'} · {student.parentContact}</span>
                  </div>
                  <span className="ka-state pending">대기</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      )}

      {activeTab === 'inbox' && (
      <>
      <section className="gd-card">
        <div className="kakao-card-head">
          <div>
            <h3>상담/문의 요청 큐</h3>
            <p>상담 요청은 자동 발송하지 않고 원장님이 확인한 뒤 처리합니다.</p>
          </div>
          <MessageCircle size={20} />
        </div>
        {requests.filter(r => r.requestType === 'counsel').length === 0 ? (
          <div className="gd-empty">
            <MessageCircle size={28} />
            <span>접수된 상담 요청이 없습니다.</span>
          </div>
        ) : (
          <div className="ka-inbox">
            {requests.filter(r => r.requestType === 'counsel').map(request => {
              const student = request.studentId ? studentById.get(request.studentId) : undefined;
              return (
                <article key={request.id} className={`ka-req${request.status === 'resolved' && (request.requestType === 'attendance' || request.requestType === 'homework') ? ' answered' : ''}`}>
                  <div className="ka-req-ic">
                    <MessageCircle size={18} />
                  </div>
                  <div className="ka-req-id">
                    <b>{requestTypeLabel[request.requestType]}</b>
                    <span className="ka-type">{student?.name ?? '미연결 학부모'}</span>
                    <p>{request.message || '메시지 없음'}</p>
                    <div className="ka-time">{fmtDateTime(request.createdAt)} · {maskKey(request.kakaoUserKey)}</div>
                  </div>
                  <div className="ka-req-acts">
                    <span className={statusPillClass[request.status]}>{requestStatusLabel[request.status]}</span>
                    {request.status === 'resolved' && (request.requestType === 'attendance' || request.requestType === 'homework') && (
                      <span className="ka-done-pill">자동 처리됨</span>
                    )}
                    <button className="pay-btn ghost sm" disabled={request.status === 'drafted'} onClick={() => onUpdateRequestStatus(request.id, 'drafted')}>
                      답변 준비
                    </button>
                    <button className="pay-btn primary sm" disabled={request.status === 'resolved'} onClick={() => onUpdateRequestStatus(request.id, 'resolved')}>
                      완료
                    </button>
                    <button className="pay-btn ghost sm" disabled={request.status === 'dismissed'} onClick={() => onUpdateRequestStatus(request.id, 'dismissed')}>
                      보류
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="gd-card">
        <div className="kakao-card-head">
          <div>
            <h3>최근 카카오 요청 로그</h3>
            <p>학부모가 채널봇으로 보낸 요청 기록입니다.</p>
          </div>
          <Clock3 size={20} />
        </div>
        {events.length === 0 ? (
          <div className="gd-empty">
            <Clock3 size={28} />
            <span>아직 카카오 요청 로그가 없습니다.</span>
          </div>
        ) : (
          <div className="kakao-log-table">
            <div className="kakao-log-head">
              <span>시간</span>
              <span>유형</span>
              <span>상태</span>
              <span>사용자</span>
            </div>
            {events.map(event => (
              <div key={event.id} className="kakao-log-row">
                <span>{fmtDateTime(event.createdAt)}</span>
                <span>{event.intent || event.eventType}</span>
                <span>{event.status}</span>
                <span>{maskKey(event.kakaoUserKey)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      </>
      )}
    </div>
  );
}
