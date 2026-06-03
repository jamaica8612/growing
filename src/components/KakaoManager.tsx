import { useState } from 'react';
import { CheckCircle2, Clock3, Copy, KeyRound, Link2, MessageCircle, ShieldCheck, UserX } from 'lucide-react';
import type { KakaoChannelConfig, KakaoEventLog, KakaoParentLink, KakaoParentRequest, KakaoParentRequestStatus, Student } from '../types';

interface KakaoManagerProps {
  students: Student[];
  channels: KakaoChannelConfig[];
  links: KakaoParentLink[];
  requests: KakaoParentRequest[];
  events: KakaoEventLog[];
  onUpdateRequestStatus: (id: string, status: KakaoParentRequestStatus) => void;
  onSaveChannel: (config: { id?: string; channelName: string; skillSecret: string; eventSecret?: string; enabled: boolean }) => void;
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
  const primaryChannel = channels[0];
  const [channelName, setChannelName] = useState(primaryChannel?.channelName || '그로잉영어 카카오 채널');
  const [skillSecret, setSkillSecret] = useState(primaryChannel?.skillSecret || '');
  const [eventSecret, setEventSecret] = useState(primaryChannel?.eventSecret || '');
  const [enabled, setEnabled] = useState(primaryChannel?.enabled ?? true);
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const skillUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/kakao-skill` : 'Supabase URL 설정 필요';
  const eventUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/kakao-channel-event` : 'Supabase URL 설정 필요';
  const studentById = new Map(students.map(student => [student.id, student]));
  const linkedStudentIds = new Set(links.filter(link => !link.blockedAt).map(link => link.studentId));
  const unlinkedStudents = students.filter(student => student.status === 'active' && student.parentContact && !linkedStudentIds.has(student.id));
  const pendingRequests = requests.filter(request => request.status === 'pending');
  const activeLinks = links.filter(link => !link.blockedAt);
  const blockedLinks = links.filter(link => link.blockedAt);

  return (
    <div className="gd-root kakao-admin">
      <div className="set-intro kakao-intro">
        <span className="set-intro-ic">K</span>
        <p>
          비즈니스톡 승인 전 준비 화면입니다. 실제 카카오 발송은 하지 않고, 학생 연결 상태와 상담 요청 큐,
          테스트 Skill API 로그만 확인합니다.
        </p>
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

      <section className="gd-card">
        <div className="kakao-card-head">
          <div>
            <h3>채널 분리 설정</h3>
            <p>같은 DB 안에 다른 앱/학원이 있어도 이 secret으로 들어온 요청만 해당 owner 데이터에 연결됩니다.</p>
          </div>
          <KeyRound size={20} />
        </div>
        <div className="kakao-setup-grid">
          <label>
            <span>채널명</span>
            <input className="form-control" value={channelName} onChange={event => setChannelName(event.target.value)} />
          </label>
          <label>
            <span>Skill secret 헤더값</span>
            <div className="kakao-secret-row">
              <input className="form-control" value={skillSecret} onChange={event => setSkillSecret(event.target.value)} placeholder="생성 버튼을 눌러 주세요" />
              <button className="btn btn-secondary" type="button" onClick={() => setSkillSecret(makeSecret())}>생성</button>
            </div>
          </label>
          <label>
            <span>Event secret 헤더값</span>
            <div className="kakao-secret-row">
              <input className="form-control" value={eventSecret} onChange={event => setEventSecret(event.target.value)} placeholder="생성 버튼을 눌러 주세요" />
              <button className="btn btn-secondary" type="button" onClick={() => setEventSecret(makeSecret())}>생성</button>
            </div>
          </label>
          <label className="kakao-toggle">
            <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />
            <span>이 채널 사용</span>
          </label>
        </div>
        <div className="kakao-endpoints">
          <button className="kakao-copy" type="button" onClick={() => void navigator.clipboard.writeText(skillUrl)}>
            <Copy size={14} /> Skill URL: {skillUrl}
          </button>
          <button className="kakao-copy" type="button" onClick={() => void navigator.clipboard.writeText(eventUrl)}>
            <Copy size={14} /> Event URL: {eventUrl}
          </button>
          <span>카카오 관리자 헤더: <b>x-kakao-skill-secret</b> / <b>x-kakao-event-secret</b></span>
        </div>
        <div className="kakao-actions" style={{ marginTop: '0.9rem' }}>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!channelName.trim() || !skillSecret.trim()}
            onClick={() => onSaveChannel({
              id: primaryChannel?.id,
              channelName: channelName.trim(),
              skillSecret: skillSecret.trim(),
              eventSecret: eventSecret.trim(),
              enabled,
            })}
          >
            채널 설정 저장
          </button>
        </div>
      </section>

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
            <div className="kakao-list">
              {activeLinks.map(link => {
                const student = studentById.get(link.studentId);
                return (
                  <div key={link.id} className="kakao-row">
                    <div>
                      <strong>{student?.name ?? '알 수 없는 학생'}</strong>
                      <span>{cleanPhone(link.parentPhone) || '전화번호 없음'} · {maskKey(link.kakaoUserKey)}</span>
                    </div>
                    <em>{fmtDateTime(link.verifiedAt)}</em>
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
            <div className="kakao-list">
              {unlinkedStudents.slice(0, 8).map(student => (
                <div key={student.id} className="kakao-row">
                  <div>
                    <strong>{student.name}</strong>
                    <span>{student.grade || '학년 없음'} · {student.parentContact}</span>
                  </div>
                  <em>대기</em>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="gd-card">
        <div className="kakao-card-head">
          <div>
            <h3>상담/문의 요청 큐</h3>
            <p>상담 요청은 자동 발송하지 않고 원장님이 확인한 뒤 처리합니다.</p>
          </div>
          <MessageCircle size={20} />
        </div>
        {requests.length === 0 ? (
          <div className="gd-empty">
            <MessageCircle size={28} />
            <span>접수된 카카오 요청이 없습니다.</span>
          </div>
        ) : (
          <div className="kakao-request-list">
            {requests.map(request => {
              const student = request.studentId ? studentById.get(request.studentId) : undefined;
              return (
                <article key={request.id} className="kakao-request">
                  <div className="kakao-request-main">
                    <span className={`kakao-status ${request.status}`}>{requestStatusLabel[request.status]}</span>
                    <div>
                      <h4>{requestTypeLabel[request.requestType]} · {student?.name ?? '미연결 학부모'}</h4>
                      <p>{request.message || '메시지 없음'}</p>
                      <small>{fmtDateTime(request.createdAt)} · {maskKey(request.kakaoUserKey)}</small>
                    </div>
                  </div>
                  <div className="kakao-actions">
                    <button className="btn btn-secondary" disabled={request.status === 'drafted'} onClick={() => onUpdateRequestStatus(request.id, 'drafted')}>
                      답변 준비
                    </button>
                    <button className="btn btn-primary" disabled={request.status === 'resolved'} onClick={() => onUpdateRequestStatus(request.id, 'resolved')}>
                      완료
                    </button>
                    <button className="btn btn-secondary" disabled={request.status === 'dismissed'} onClick={() => onUpdateRequestStatus(request.id, 'dismissed')}>
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
            <p>승인 전에는 테스트 payload로 Skill API 응답과 로그 저장만 확인합니다.</p>
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
    </div>
  );
}
