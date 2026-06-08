import { AlertCircle, AlertTriangle, ArrowRight, Bell, CheckCircle2, Info } from 'lucide-react';
import type { Attendance, Class, CounselLog, Payment, Student } from '../types';
import { getDataQualitySections, type DataQualitySeverity, type DataQualityTarget } from '../lib/dataQuality';

interface DataQualityProps {
  students: Student[];
  classes: Class[];
  attendance: Attendance[];
  payments: Payment[];
  counselLogs: CounselLog[];
  onNavigate: (tab: string) => void;
}

const severityMeta: Record<
  DataQualitySeverity,
  { label: string; icon: typeof AlertTriangle; icClass: string }
> = {
  danger: { label: '데이터 꼬임', icon: AlertCircle, icClass: 'danger' },
  warning: { label: '확인 필요', icon: AlertTriangle, icClass: 'warn' },
  info: { label: '개선 추천', icon: Info, icClass: 'info' },
};

const targetTab: Record<DataQualityTarget, string> = {
  students: 'students',
  classes: 'classes',
  attendance: 'attendance',
  payments: 'payments',
};

export function DataQuality({ students, classes, attendance, payments, counselLogs, onNavigate }: DataQualityProps) {
  const sections = getDataQualitySections({ students, classes, attendance, payments, counselLogs });
  const totalIssues = sections.reduce((sum, sec) => sum + sec.issues.length, 0);
  const activeSections = sections.filter(sec => sec.issues.length > 0);

  return (
    <div className="gd-root">
      {/* ── KPI 3개 ── */}
      <div className="gd-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="gd-stat gd-stat-danger">
          <div className="gd-stat-ic" style={{ background: '#fdeaea', color: 'var(--color-danger)' }}>
            <AlertCircle size={22} />
          </div>
          <div className="gd-stat-body">
            <span className="gd-stat-label">전체 점검 항목</span>
            <span className="gd-stat-val">{totalIssues}<em>건</em></span>
          </div>
        </div>

        <div className="gd-stat">
          <div className="gd-stat-ic" style={{ background: '#fef3c7', color: '#b4710a' }}>
            <Bell size={22} />
          </div>
          <div className="gd-stat-body">
            <span className="gd-stat-label">확인 필요 카드</span>
            <span className="gd-stat-val">{activeSections.length}<em>개</em></span>
          </div>
        </div>

        <div className="gd-stat">
          <div className="gd-stat-ic" style={{ background: '#e9f8f1', color: 'var(--color-accent-mint)' }}>
            <CheckCircle2 size={22} />
          </div>
          <div className="gd-stat-body">
            <span className="gd-stat-label">자동 수정</span>
            <span className="gd-stat-val" style={{ fontSize: '1.15rem' }}>없음</span>
          </div>
        </div>
      </div>

      {/* ── 점검 카드 그리드 ── */}
      {activeSections.length === 0 ? (
        <div className="gd-card">
          <div className="gd-empty" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
            <CheckCircle2 size={34} />
            <span>현재 데이터 점검 결과가 좋아요!</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>
              로드된 데이터 기준으로 바로 확인할 항목이 없습니다.
            </span>
          </div>
        </div>
      ) : (
        <div className="dq-grid">
          {activeSections.map(sec => {
            const meta = severityMeta[sec.severity];
            const Icon = meta.icon;
            return (
              <section key={sec.key} className="gd-card dq-card">
                {/* 카드 헤더 */}
                <div className="dq-head">
                  <div className="dq-head-id">
                    <span className={`dq-ic ${meta.icClass}`}>
                      <Icon size={18} />
                    </span>
                    <div>
                      <h3>{sec.title}</h3>
                      <span className={`dq-sev ${meta.icClass}`}>{meta.label}</span>
                    </div>
                  </div>
                  <span className="dq-count">{sec.issues.length}건</span>
                </div>

                {/* 이슈 리스트 */}
                <div className="dq-issues">
                  {sec.issues.map(issue => (
                    <div key={issue.id} className="dq-issue">
                      <b>{issue.title}</b>
                      <span>{issue.description}</span>
                    </div>
                  ))}
                </div>

                {/* 해당 화면으로 버튼 */}
                <button
                  type="button"
                  className="pay-btn ghost dq-action"
                  onClick={() => onNavigate(targetTab[sec.target])}
                >
                  {sec.actionLabel} <ArrowRight size={14} />
                </button>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
