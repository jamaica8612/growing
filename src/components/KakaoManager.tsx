import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, Copy, KeyRound, Link2, MessageCircle, Plus, ShieldCheck, Trash2, UserX } from 'lucide-react';
import type {
  CalendarException,
  CalendarExceptionKind,
  HolidaySettings,
  KakaoChannelConfig,
  KakaoChannelConfigInput,
  KakaoEventLog,
  KakaoLinkCode,
  KakaoParentLink,
  KakaoParentRequest,
  KakaoParentRequestStatus,
  Student,
} from '../types';
import { MAX_CALENDAR_EXCEPTIONS, normalizeCalendarExceptions } from '../lib/holidaySettings';

interface KakaoManagerProps {
  students: Student[];
  channels: KakaoChannelConfig[];
  links: KakaoParentLink[];
  requests: KakaoParentRequest[];
  events: KakaoEventLog[];
  onUpdateRequestStatus: (id: string, status: KakaoParentRequestStatus) => void;
  onDeleteRequest: (id: string) => void;
  onDeleteParentLink: (id: string) => Promise<void | undefined>;
  onDeleteUnlinkedIdentity: (requestId: string) => Promise<void | undefined>;
  onCreateLinkCode: (studentId: string) => Promise<KakaoLinkCode | undefined>;
  onSaveChannel: (config: KakaoChannelConfigInput) => void;
  holidayAutoClose: boolean;
  calendarExceptions: CalendarException[];
  onSaveHolidaySettings: (settings: HolidaySettings) => Promise<boolean>;
}

const requestTypeLabel: Record<KakaoParentRequest['requestType'], string> = {
  attendance: '출결 확인',
  homework: '숙제 확인',
  counsel: '상담 요청',
  connect: '학생 연결 확인',
};

const requestStatusLabel: Record<KakaoParentRequestStatus, string> = {
  pending: '대기',
  drafted: '답변 초안',
  resolved: '처리 완료',
  dismissed: '보류',
};

const statusPillClass: Record<KakaoParentRequestStatus, string> = {
  pending: 'at-pill warn',
  drafted: 'at-pill warn',
  resolved: 'at-pill ok',
  dismissed: 'at-pill info',
};

const intentLabel: Record<string, string> = {
  connect_student: '학생 연결',
  unlink_student: '연결 해제',
  schedule_info: '휴강 일정',
  attendance_today: '출결 확인',
  homework_today: '숙제 확인',
  counsel_request: '상담 요청',
  ask_ai: '아이비 질문',
  student_menu: '학생 메뉴',
};

const eventStatusLabel = (status: string): string => {
  const map: Record<string, string> = {
    connect_success: '연결 완료',
    connect_failed: '연결 실패',
    counsel_prompt: '상담 안내',
    counsel_consent_prompt: '상담 개인정보 동의 안내',
    counsel_consent_confirmed: '상담 개인정보 동의',
    counsel_queued: '상담 접수',
    counsel_queued_unlinked: '상담 접수(미연결)',
    schedule_info: '휴강 안내',
    attendance_holiday: '휴강일 안내',
    attendance_queued: '출결 답변',
    homework_queued: '숙제 답변',
    unverified: '미인증',
    missing_user: '사용자 없음',
    student_missing: '학생 없음',
    unlink_student: '연결 해제',
    ask_ai_no_key: 'AI 키 없음',
  };
  if (map[status]) return map[status];
  if (status.startsWith('counsel_prompt:')) return '상담 안내';
  if (status.startsWith('ask_ai_error')) return 'AI 오류';
  if (status.startsWith('error:')) return '오류';
  return status;
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

const makeSecret = () => {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

export function KakaoManager({
  students,
  channels,
  links,
  requests,
  events,
  onUpdateRequestStatus,
  onDeleteParentLink,
  onDeleteUnlinkedIdentity,
  onCreateLinkCode,
  onSaveChannel,
  holidayAutoClose,
  calendarExceptions,
  onSaveHolidaySettings,
}: KakaoManagerProps) {
  const [activeTab, setActiveTab] = useState<'inbox' | 'links' | 'settings'>('inbox');
  const [showArchived, setShowArchived] = useState(false);
  const primaryChannel = channels[0];
  const [autoReply, setAutoReply] = useState(primaryChannel?.autoReply ?? true);
  const [channelName, setChannelName] = useState(primaryChannel?.channelName || '그로잉영어 카카오 채널');
  const [skillSecret, setSkillSecret] = useState(primaryChannel?.skillSecret || '');
  const [skillSecretGenerated, setSkillSecretGenerated] = useState(false);
  const [skillSecretCopied, setSkillSecretCopied] = useState(false);
  const [eventSecret, setEventSecret] = useState(primaryChannel?.eventSecret || '');
  const [channelPublicId, setChannelPublicId] = useState(primaryChannel?.channelPublicId || '');
  const [channelUuid, setChannelUuid] = useState(primaryChannel?.channelUuid || '');
  const [enabled, setEnabled] = useState(primaryChannel?.enabled ?? true);
  const [linkCodeStudentId, setLinkCodeStudentId] = useState('');
  const [issuedLinkCode, setIssuedLinkCode] = useState<KakaoLinkCode | null>(null);
  const [linkCodeIssuing, setLinkCodeIssuing] = useState(false);
  const [linkCodeCopied, setLinkCodeCopied] = useState(false);
  const [linkCodeError, setLinkCodeError] = useState('');
  const [deletingLinkId, setDeletingLinkId] = useState('');
  const [deletingIdentityRequestId, setDeletingIdentityRequestId] = useState('');
  const [holidayAutoCloseDraft, setHolidayAutoCloseDraft] = useState(holidayAutoClose);
  const [calendarExceptionsDraft, setCalendarExceptionsDraft] = useState(calendarExceptions);
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionTitle, setExceptionTitle] = useState('');
  const [exceptionKind, setExceptionKind] = useState<CalendarExceptionKind>('closed');
  const [holidaySaveStatus, setHolidaySaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const holidaySaving = holidaySaveStatus === 'saving';
  const channelIdentityIncomplete = Boolean(channelPublicId.trim()) !== Boolean(channelUuid.trim());
  const skillSecretLength = skillSecret.trim().length;
  const skillSecretInvalid = primaryChannel
    ? (skillSecretLength > 0 ? skillSecretLength < 32 : !primaryChannel.skillSecretConfigured)
    : skillSecretLength < 32;
  const eventSecretLength = eventSecret.trim().length;
  const hasChannelIdentity = Boolean(channelPublicId.trim() && channelUuid.trim());
  const eventSecretInvalid = eventSecretLength > 0
    ? eventSecretLength < 16
    : hasChannelIdentity && !primaryChannel?.eventAdminKeyConfigured;
  const replacingException = calendarExceptionsDraft.some(item => item.date === exceptionDate);
  const exceptionLimitReached = calendarExceptionsDraft.length >= MAX_CALENDAR_EXCEPTIONS && !replacingException;
  // 저장 후 props 변경 시 폼 상태 동기화
  useEffect(() => {
    if (!primaryChannel) return;
    const frame = requestAnimationFrame(() => {
      setChannelName(primaryChannel.channelName || '그로잉영어 카카오 채널');
      setSkillSecret(primaryChannel.skillSecret || '');
      setSkillSecretGenerated(false);
      setSkillSecretCopied(false);
      setEventSecret(primaryChannel.eventSecret || '');
      setChannelPublicId(primaryChannel.channelPublicId || '');
      setChannelUuid(primaryChannel.channelUuid || '');
      setEnabled(primaryChannel.enabled ?? true);
      setAutoReply(primaryChannel.autoReply ?? true);
    });
    return () => cancelAnimationFrame(frame);
  }, [primaryChannel]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setHolidayAutoCloseDraft(holidayAutoClose);
      setCalendarExceptionsDraft(calendarExceptions);
    });
    return () => cancelAnimationFrame(frame);
  }, [calendarExceptions, holidayAutoClose]);

  const addCalendarException = () => {
    if (holidaySaving || exceptionLimitReached || !exceptionDate || !exceptionTitle.trim()) return;
    setHolidaySaveStatus('idle');
    setCalendarExceptionsDraft(current => normalizeCalendarExceptions([
      ...current,
      { date: exceptionDate, kind: exceptionKind, title: exceptionTitle },
    ]));
    setExceptionDate('');
    setExceptionTitle('');
    setExceptionKind('closed');
  };

  const saveHolidaySettings = async () => {
    if (holidaySaveStatus === 'saving') return;
    setHolidaySaveStatus('saving');
    try {
      const saved = await onSaveHolidaySettings({
        holidayAutoClose: holidayAutoCloseDraft,
        calendarExceptions: calendarExceptionsDraft,
      });
      setHolidaySaveStatus(saved ? 'success' : 'error');
    } catch (error) {
      console.error('Holiday settings save callback failed:', error);
      setHolidaySaveStatus('error');
    }
  };

  const issueLinkCode = async () => {
    if (!linkCodeStudentId || linkCodeIssuing) return;
    setLinkCodeIssuing(true);
    setIssuedLinkCode(null);
    setLinkCodeCopied(false);
    setLinkCodeError('');
    try {
      const result = await onCreateLinkCode(linkCodeStudentId);
      if (result) {
        setIssuedLinkCode(result);
      } else {
        setLinkCodeError('연결코드를 발급하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } catch (error) {
      console.error('Kakao link code issue callback failed:', error);
      setLinkCodeError('연결코드를 발급하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLinkCodeIssuing(false);
    }
  };

  const copyLinkCode = async () => {
    if (!issuedLinkCode) return;
    try {
      await navigator.clipboard.writeText(issuedLinkCode.code);
      setLinkCodeCopied(true);
      setLinkCodeError('');
    } catch (error) {
      console.error('Kakao link code copy failed:', error);
      setLinkCodeError('복사하지 못했습니다. 코드를 직접 전달해 주세요.');
    }
  };

  const deleteParentLink = async (link: KakaoParentLink) => {
    const studentName = studentById.get(link.studentId)?.name ?? '이 학부모';
    const confirmed = window.confirm(
      `${studentName}의 카카오 연결 개인정보를 영구 삭제할까요?\n\n` +
      '이 작업은 되돌릴 수 없으며 해당 학생의 요청도 함께 삭제됩니다. 이 학부모의 마지막 연결이면 이벤트와 미분류 요청도 삭제됩니다.',
    );
    if (!confirmed) return;
    setDeletingLinkId(link.id);
    try {
      await onDeleteParentLink(link.id);
    } finally {
      setDeletingLinkId('');
    }
  };

  const deleteUnlinkedIdentity = async (request: KakaoParentRequest) => {
    const confirmed = window.confirm(
      '미연결 학부모의 개인정보를 영구 삭제할까요?\n\n' +
      '이 작업은 되돌릴 수 없으며 이 카카오 사용자의 모든 상담 요청과 이벤트 기록이 함께 삭제됩니다.',
    );
    if (!confirmed) return;
    setDeletingIdentityRequestId(request.id);
    try {
      await onDeleteUnlinkedIdentity(request.id);
    } finally {
      setDeletingIdentityRequestId('');
    }
  };

  const copySkillSecret = async () => {
    if (!skillSecret) return;
    try {
      await navigator.clipboard.writeText(skillSecret);
      setSkillSecretCopied(true);
    } catch (error) {
      console.error('Kakao skill secret copy failed:', error);
      setSkillSecretCopied(false);
    }
  };

  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const skillUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/kakao-skill` : 'Supabase URL 설정 필요';
  const eventUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/kakao-channel-event` : 'Supabase URL 설정 필요';
  const studentById = new Map(students.map(student => [student.id, student]));
  const linkedStudentIds = new Set(links.filter(link => !link.blockedAt).map(link => link.studentId));
  const activeStudents = students.filter(student => student.status === 'active');
  const unlinkedStudents = activeStudents.filter(student => !linkedStudentIds.has(student.id));
  const queuedRequests = requests.filter(request => request.status === 'pending' || request.status === 'drafted');
  const activeLinks = links.filter(link => !link.blockedAt);
  const blockedLinks = links.filter(link => link.blockedAt);

  return (
    <div className="gd-root kakao-admin">
      <div className="ka-intro">
        <span className="ka-k">K</span>
        <p>
          카카오 채널봇 연결을 관리합니다. 학생 연결 상태와 모든 학부모 요청, 최근 요청 로그를 확인합니다.
        </p>
      </div>

      <div className="ka-tabs" role="tablist" aria-label="카카오 관리 분류">
        {([
          ['inbox', '요청 큐', queuedRequests.length],
          ['links', '연결', null],
          ['settings', '설정', null],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            className={`ka-tab${activeTab === key ? ' on' : ''}`}
            onClick={() => {
              setActiveTab(key);
              if (key !== 'links') {
                setIssuedLinkCode(null);
                setLinkCodeCopied(false);
                setLinkCodeError('');
              }
            }}
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
            <span className="gd-stat-label">처리 대기 요청</span>
            <span className="gd-stat-val">{queuedRequests.length}<em>건</em></span>
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
      <>
      <section className="gd-card">
        <div className="kakao-card-head">
          <div>
            <h3>채널 분리 설정</h3>
            <p>저장한 인증값으로 카카오 요청을 검증하고 해당 학원 데이터에만 연결합니다.</p>
          </div>
          <KeyRound size={20} />
        </div>
        <div className="ka-fields">
          <div className="ka-field">
            <label>채널명</label>
            <input className="gd-field" value={channelName} onChange={event => setChannelName(event.target.value)} />
          </div>
          <div className="ka-field">
            <label htmlFor="kakao-channel-public-id">카카오 채널 Public ID</label>
            <input
              id="kakao-channel-public-id"
              className="gd-field"
              value={channelPublicId}
              onChange={event => setChannelPublicId(event.target.value)}
              placeholder="카카오 채널 관리자센터의 Public ID"
              autoComplete="off"
            />
          </div>
          <div className="ka-field">
            <label htmlFor="kakao-channel-uuid">카카오 채널 UUID</label>
            <input
              id="kakao-channel-uuid"
              className="gd-field"
              value={channelUuid}
              onChange={event => setChannelUuid(event.target.value)}
              placeholder="채널 웹훅에 포함되는 채널 UUID"
              autoComplete="off"
            />
          </div>
          {channelIdentityIncomplete && (
            <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.82rem', margin: '0.2rem 0' }}>
              채널 웹훅을 연결하려면 Public ID와 UUID를 모두 입력하세요.
            </p>
          )}
          <div className="ka-field">
            <label htmlFor="kakao-skill-secret">Skill secret 헤더값</label>
            <div className="ka-url">
              <input
                id="kakao-skill-secret"
                className="gd-field"
                type="password"
                value={skillSecret}
                minLength={32}
                maxLength={128}
                autoComplete="new-password"
                onChange={event => {
                  setSkillSecret(event.target.value);
                  setSkillSecretGenerated(false);
                  setSkillSecretCopied(false);
                }}
                placeholder={primaryChannel ? '교체할 때만 새 값을 입력하세요' : '32자 이상 입력하거나 생성하세요'}
              />
              <button
                className="pay-btn ghost sm"
                type="button"
                onClick={() => {
                  setSkillSecret(makeSecret());
                  setSkillSecretGenerated(true);
                  setSkillSecretCopied(false);
                }}
              >
                새 값 생성
              </button>
              {skillSecretGenerated && (
                <button className="pay-btn ghost sm" type="button" onClick={() => void copySkillSecret()}>
                  <Copy size={14} /> {skillSecretCopied ? '복사됨' : '복사'}
                </button>
              )}
            </div>
            {skillSecretGenerated ? (
              <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>
                지금 복사해 카카오 관리자에 등록한 뒤 설정을 저장하세요. 저장 후에는 다시 표시되지 않습니다.
              </span>
            ) : primaryChannel?.skillSecretConfigured && !skillSecret ? (
              <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>
                등록됨 · 교체할 때만 새 값을 입력하세요.
              </span>
            ) : primaryChannel && !skillSecret ? (
              <span role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>
                미등록 · 새 값을 생성해 카카오 관리자에 등록하세요.
              </span>
            ) : skillSecretInvalid ? (
              <span role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>
                Skill secret은 32자 이상이어야 합니다.
              </span>
            ) : null}
          </div>
          <div className="ka-field">
            <label htmlFor="kakao-event-admin-key">카카오 Admin 키 (채널 웹훅 인증)</label>
            <input
              id="kakao-event-admin-key"
              className="gd-field"
              type="password"
              value={eventSecret}
              minLength={16}
              maxLength={128}
              onChange={event => setEventSecret(event.target.value)}
              placeholder={primaryChannel ? '교체할 때만 새 값을 입력하세요' : '카카오 디벨로퍼스에서 발급한 Admin 키'}
              autoComplete="new-password"
            />
            {primaryChannel?.eventAdminKeyConfigured && !eventSecret && (
              <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>
                등록됨 · 교체할 때만 새 값을 입력하세요.
              </span>
            )}
            {primaryChannel && !primaryChannel.eventAdminKeyConfigured && !eventSecret && (
              <span role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>
                미등록 · 실제 Kakao Primary Admin 키를 입력하세요.
              </span>
            )}
            {eventSecretInvalid && (
              <span role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>
                카카오 Admin 키는 16자 이상이어야 합니다.
              </span>
            )}
          </div>
          <div className="ka-field">
            <label>Skill URL</label>
            <div className="ka-url">
              <code>{skillUrl}</code>
              <button className="pay-btn ghost sm" type="button" onClick={() => void navigator.clipboard.writeText(skillUrl)}>
                <Copy size={14} /> 복사
              </button>
            </div>
          </div>
          <div className="ka-field">
            <label>채널 웹훅 URL</label>
            <div className="ka-url">
              <code>{eventUrl}</code>
              <button className="pay-btn ghost sm" type="button" onClick={() => void navigator.clipboard.writeText(eventUrl)}>
                <Copy size={14} /> 복사
              </button>
            </div>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-muted)', margin: '0.2rem 0' }}>
            Skill 요청은 <b>x-kakao-skill-secret</b> 헤더에 저장한 Skill secret을 넣으세요. 채널 웹훅은 카카오가 보내는 <b>Authorization: KakaoAK {'{Admin 키}'}</b> 헤더로 검증합니다. 인증값을 URL에 넣지 마세요.
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
              {autoReply
                ? '출결·숙제 문의는 DB 조회 결과로 즉시 답변합니다. 상담과 연결 확인 요청은 요청 큐에 접수됩니다.'
                : '출결·숙제 문의도 즉시 답변하지 않고 요청 큐에 접수됩니다. 상담과 연결 확인 요청은 항상 큐에서 확인합니다.'}
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
            disabled={!channelName.trim() || skillSecretInvalid || eventSecretInvalid || channelIdentityIncomplete}
            onClick={() => onSaveChannel({
              id: primaryChannel?.id,
              channelName: channelName.trim(),
              skillSecret: skillSecret.trim(),
              eventSecret: eventSecret.trim(),
              channelPublicId: channelPublicId.trim(),
              channelUuid: channelUuid.trim(),
              enabled,
              autoReply,
            })}
          >
            채널 설정 저장
          </button>
        </div>
      </section>
      <section className="gd-card">
        <div className="kakao-card-head">
          <div>
            <h3>휴강일 자동 안내</h3>
            <p>카카오 챗봇이 공휴일과 학원 예외 일정을 확인해 휴강 여부를 바로 답합니다.</p>
          </div>
          <CalendarDays size={20} />
        </div>

        <div className="ka-auto-toggle">
          <div className="ka-auto-tx">
            <b>대한민국 공휴일 자동 휴강</b>
            <span>
              {holidayAutoCloseDraft
                ? '공휴일·대체공휴일은 기본 휴강으로 안내합니다.'
                : '공휴일도 기본 정상 수업으로 안내하며, 등록한 예외만 적용합니다.'}
            </span>
          </div>
          <button
            type="button"
            className={`ka-switch${holidayAutoCloseDraft ? ' on' : ''}`}
            disabled={holidaySaving}
            onClick={() => {
              setHolidayAutoCloseDraft(value => !value);
              setHolidaySaveStatus('idle');
            }}
            aria-pressed={holidayAutoCloseDraft}
            aria-label="공휴일 자동 휴강 켜기/끄기"
          >
            <span />
          </button>
        </div>

        <div className="ka-holiday-editor">
          <div className="ka-holiday-fields">
            <div className="ka-field">
              <label htmlFor="holiday-exception-date">날짜</label>
              <input
                id="holiday-exception-date"
                className="gd-field"
                type="date"
                disabled={holidaySaving}
                value={exceptionDate}
                onChange={event => setExceptionDate(event.target.value)}
              />
            </div>
            <div className="ka-field">
              <label htmlFor="holiday-exception-kind">수업 여부</label>
              <select
                id="holiday-exception-kind"
                className="gd-field"
                disabled={holidaySaving}
                value={exceptionKind}
                onChange={event => setExceptionKind(event.target.value as CalendarExceptionKind)}
              >
                <option value="closed">휴강</option>
                <option value="open">정상 수업</option>
              </select>
            </div>
            <div className="ka-field ka-holiday-title-field">
              <label htmlFor="holiday-exception-title">일정명</label>
              <input
                id="holiday-exception-title"
                className="gd-field"
                value={exceptionTitle}
                disabled={holidaySaving}
                maxLength={80}
                placeholder="예: 여름방학, 공휴일 정상 수업"
                onChange={event => setExceptionTitle(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addCalendarException();
                  }
                }}
              />
            </div>
            <button
              className="pay-btn ghost ka-holiday-add"
              type="button"
              disabled={holidaySaving || exceptionLimitReached || !exceptionDate || !exceptionTitle.trim()}
              onClick={addCalendarException}
            >
              <Plus size={15} /> 추가/변경
            </button>
          </div>

          {exceptionLimitReached && (
            <p className="ka-holiday-limit" role="alert">
              예외 일정은 최대 {MAX_CALENDAR_EXCEPTIONS}개까지 등록할 수 있습니다. 기존 날짜는 변경할 수 있습니다.
            </p>
          )}

          {calendarExceptionsDraft.length === 0 ? (
            <div className="gd-empty ka-holiday-empty">
              <CalendarDays size={24} />
              <span>등록한 학원 휴강·정상 수업 예외가 없습니다.</span>
            </div>
          ) : (
            <div className="ka-holiday-list" role="list" aria-label="학원 일정 예외">
              {calendarExceptionsDraft.map(exception => (
                <div className="ka-holiday-row" role="listitem" key={exception.date}>
                  <time dateTime={exception.date}>{exception.date}</time>
                  <span className={`ka-holiday-kind ${exception.kind}`}>
                    {exception.kind === 'closed' ? '휴강' : '정상 수업'}
                  </span>
                  <b>{exception.title}</b>
                  <button
                    className="pay-btn ghost sm"
                    type="button"
                    disabled={holidaySaving}
                    title={`${exception.title} 삭제`}
                    aria-label={`${exception.title} 삭제`}
                    onClick={() => {
                      setCalendarExceptionsDraft(current => current.filter(item => item.date !== exception.date));
                      setHolidaySaveStatus('idle');
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="kakao-actions" style={{ marginTop: '0.9rem' }}>
          <button
            className="pay-btn primary"
            type="button"
            disabled={holidaySaving}
            aria-busy={holidaySaving}
            onClick={() => void saveHolidaySettings()}
          >
            {holidaySaving ? '저장 중…' : '휴강 설정 저장'}
          </button>
          <span
            className={`ka-holiday-save-status ${holidaySaveStatus}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {holidaySaveStatus === 'success' && '휴강 설정을 저장했습니다.'}
            {holidaySaveStatus === 'error' && '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'}
          </span>
        </div>
      </section>
      </>
      )}

      {activeTab === 'links' && (
      <div className="kakao-grid">
        <section className="gd-card">
          <div className="kakao-card-head">
            <div>
              <h3>1회용 연결코드 발급</h3>
              <p>재원생을 선택해 학부모에게 전달할 8자리 코드를 발급합니다.</p>
            </div>
            <KeyRound size={20} />
          </div>
          <div className="ka-fields">
            <div className="ka-field">
              <label htmlFor="kakao-link-code-student">학생</label>
              <select
                id="kakao-link-code-student"
                className="gd-field"
                value={linkCodeStudentId}
                disabled={linkCodeIssuing || activeStudents.length === 0}
                onChange={event => {
                  setLinkCodeStudentId(event.target.value);
                  setIssuedLinkCode(null);
                  setLinkCodeCopied(false);
                  setLinkCodeError('');
                }}
              >
                <option value="">학생을 선택하세요</option>
                {activeStudents.map(student => (
                  <option key={student.id} value={student.id}>
                    {student.name}{student.grade ? ` · ${student.grade}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="kakao-actions">
              <button
                className="pay-btn primary"
                type="button"
                disabled={!linkCodeStudentId || linkCodeIssuing}
                aria-busy={linkCodeIssuing}
                onClick={() => void issueLinkCode()}
              >
                {linkCodeIssuing ? '발급 중…' : '8자리 코드 발급'}
              </button>
            </div>
          </div>

          {activeStudents.length === 0 && (
            <div className="gd-empty">
              <UserX size={24} />
              <span>연결코드를 발급할 재원생이 없습니다.</span>
            </div>
          )}

          {issuedLinkCode && (
            <div className="ka-holiday-editor" role="status" aria-live="polite">
              <p style={{ margin: '0 0 0.5rem', color: 'var(--color-muted)', fontSize: '0.84rem' }}>
                {studentById.get(issuedLinkCode.studentId)?.name ?? '선택한 학생'} 연결코드
              </p>
              <div className="ka-url">
                <code style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '0.18em' }}>{issuedLinkCode.code}</code>
                <button className="pay-btn ghost sm" type="button" onClick={() => void copyLinkCode()}>
                  <Copy size={14} /> {linkCodeCopied ? '복사됨' : '복사'}
                </button>
              </div>
              <p style={{ margin: '0.65rem 0 0', color: 'var(--color-muted)', fontSize: '0.82rem' }}>
                이 코드는 지금 화면에서 한 번만 확인할 수 있으며 10분 후 만료됩니다. 만료 시각: <time dateTime={issuedLinkCode.expiresAt}>{fmtDateTime(issuedLinkCode.expiresAt)}</time>
              </p>
            </div>
          )}

          {linkCodeError && (
            <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.82rem', margin: '0.75rem 0 0' }}>
              {linkCodeError}
            </p>
          )}
        </section>

        <section className="gd-card">
          <div className="kakao-card-head">
            <div>
              <h3>학부모 연결 상태</h3>
              <p>학원에서 발급한 8자리 1회용 코드를 학부모가 입력하면 학생과 안전하게 연결됩니다.</p>
              <p style={{ color: 'var(--color-danger)', marginTop: '0.35rem' }}>
                개인정보 삭제는 되돌릴 수 없습니다. 해당 학생 요청을 함께 삭제하며, 마지막 자녀 연결이면 사용자 이벤트도 삭제합니다.
              </p>
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
                      <span>카카오 사용자 {maskKey(link.kakaoUserKey)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span className="ka-state linked">{fmtDateTime(link.verifiedAt)}</span>
                      <button
                        className="pay-btn ghost sm"
                        type="button"
                        disabled={deletingLinkId === link.id}
                        style={{ color: 'var(--color-danger)' }}
                        onClick={() => void deleteParentLink(link)}
                      >
                        <Trash2 size={14} /> {deletingLinkId === link.id ? '삭제 중…' : '개인정보 삭제'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="gd-card">
          <div className="kakao-card-head">
            <div>
              <h3>차단된 학부모 연결</h3>
              <p>카카오 채널을 차단했거나 수신을 거부한 연결입니다.</p>
            </div>
            <UserX size={20} />
          </div>
          {blockedLinks.length === 0 ? (
            <div className="gd-empty">
              <CheckCircle2 size={28} />
              <span>차단된 학부모 연결이 없습니다.</span>
            </div>
          ) : (
            <div className="ka-links">
              {blockedLinks.map(link => {
                const student = studentById.get(link.studentId);
                return (
                  <div key={link.id} className="ka-link">
                    <span className="ka-av">{student?.name?.[0] ?? '?'}</span>
                    <div>
                      <b>{student?.name ?? '알 수 없는 학생'}</b>
                      <br />
                      <span>카카오 사용자 {maskKey(link.kakaoUserKey)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span className="ka-state pending">차단 {fmtDateTime(link.blockedAt)}</span>
                      <button
                        className="pay-btn ghost sm"
                        type="button"
                        disabled={deletingLinkId === link.id}
                        style={{ color: 'var(--color-danger)' }}
                        onClick={() => void deleteParentLink(link)}
                      >
                        <Trash2 size={14} /> {deletingLinkId === link.id ? '삭제 중…' : '개인정보 삭제'}
                      </button>
                    </div>
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
              <p>재원생 중 아직 카카오 연결이 없는 학생입니다.</p>
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
                    <span>{student.grade || '학년 없음'}</span>
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
            <h3>학부모 요청 큐</h3>
            <p>상담·학생 연결 확인 요청과 수동 접수된 출결·숙제 요청을 완료 또는 보류로 처리합니다.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              className={`pay-btn ghost sm${showArchived ? ' sel' : ''}`}
              onClick={() => setShowArchived(v => !v)}
              style={{ fontSize: '0.78rem' }}
            >
              {showArchived ? '대기만 보기' : '완료/보류 포함'}
            </button>
            <MessageCircle size={20} />
          </div>
        </div>
        {(() => {
          const visibleRequests = showArchived
            ? requests
            : requests.filter(r => r.status === 'pending' || r.status === 'drafted');
          if (requests.length === 0) return (
            <div className="gd-empty">
              <MessageCircle size={28} />
              <span>접수된 학부모 요청이 없습니다.</span>
            </div>
          );
          if (visibleRequests.length === 0) return (
            <div className="gd-empty">
              <CheckCircle2 size={28} />
              <span>대기 중인 학부모 요청이 없습니다.</span>
              <button className="pay-btn ghost sm" style={{ marginTop: '0.5rem' }} onClick={() => setShowArchived(true)}>완료/보류 포함해서 보기</button>
            </div>
          );
          return (
            <div className="ka-inbox">
              {visibleRequests.map(request => {
                const student = request.studentId ? studentById.get(request.studentId) : undefined;
                const hasLinkHistory = links.some(link => link.kakaoUserKey === request.kakaoUserKey);
                const canDeleteUnlinkedIdentity = request.requestType === 'counsel' && !hasLinkHistory;
                return (
                  <article key={request.id} className={`ka-req${request.status === 'resolved' || request.status === 'dismissed' ? ' answered' : ''}`}>
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
                      <button className="pay-btn primary sm" disabled={request.status === 'resolved'} onClick={() => onUpdateRequestStatus(request.id, 'resolved')}>
                        완료
                      </button>
                      <button className="pay-btn ghost sm" disabled={request.status === 'dismissed'} onClick={() => onUpdateRequestStatus(request.id, 'dismissed')}>
                        보류
                      </button>
                      {canDeleteUnlinkedIdentity && (
                        <button
                          className="pay-btn ghost sm"
                          type="button"
                          disabled={deletingIdentityRequestId === request.id}
                          style={{ color: 'var(--color-danger)' }}
                          title="연결 이력이 없는 학부모의 모든 상담 요청과 이벤트 기록을 영구 삭제합니다."
                          onClick={() => void deleteUnlinkedIdentity(request)}
                        >
                          <Trash2 size={14} /> {deletingIdentityRequestId === request.id ? '삭제 중…' : '미연결 학부모 개인정보 삭제'}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          );
        })()}
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
            <div className="kakao-log-body">
              {events.map(event => {
                const linkedUser = links.find(l => l.kakaoUserKey === event.kakaoUserKey);
                const linkedStudent = linkedUser ? studentById.get(linkedUser.studentId) : undefined;
                const userLabel = linkedStudent ? linkedStudent.name + ' 학부모' : maskKey(event.kakaoUserKey);
                return (
                  <div key={event.id} className="kakao-log-row">
                    <span>{fmtDateTime(event.createdAt)}</span>
                    <span>{intentLabel[event.intent ?? ''] || event.intent || event.eventType}</span>
                    <span>{eventStatusLabel(event.status)}</span>
                    <span>{userLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
      </>
      )}
    </div>
  );
}
