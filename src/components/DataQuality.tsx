import { AlertTriangle, ArrowRight, CheckCircle2, Info } from 'lucide-react';
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

const severityMeta: Record<DataQualitySeverity, { label: string; icon: typeof AlertTriangle; color: string; background: string }> = {
  danger: { label: '데이터 꼬임', icon: AlertTriangle, color: 'var(--color-danger)', background: 'var(--color-danger-light)' },
  warning: { label: '확인 필요', icon: AlertTriangle, color: 'var(--color-warning)', background: '#fff7ed' },
  info: { label: '개선 추천', icon: Info, color: 'var(--color-info)', background: '#eff6ff' },
};

const targetTab: Record<DataQualityTarget, string> = {
  students: 'students',
  classes: 'classes',
  attendance: 'attendance',
  payments: 'payments',
};

export function DataQuality({ students, classes, attendance, payments, counselLogs, onNavigate }: DataQualityProps) {
  const sections = getDataQualitySections({ students, classes, attendance, payments, counselLogs });
  const totalIssues = sections.reduce((sum, section) => sum + section.issues.length, 0);
  const activeSections = sections.filter(section => section.issues.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="grid-container cols-3" style={{ gap: '1rem' }}>
        <div className="metric-card danger">
          <div className="metric-label">전체 점검 항목</div>
          <div className="metric-value">{totalIssues}건</div>
        </div>
        <div className="metric-card warning">
          <div className="metric-label">확인 필요 카드</div>
          <div className="metric-value">{activeSections.length}개</div>
        </div>
        <div className="metric-card accent-mint">
          <div className="metric-label">자동 수정</div>
          <div className="metric-value" style={{ fontSize: '1.1rem' }}>없음</div>
        </div>
      </div>

      {activeSections.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
          <CheckCircle2 size={34} color="var(--color-success)" />
          <h3 style={{ color: 'var(--color-primary-dark)', margin: '0.75rem 0 0.25rem' }}>현재 데이터 점검 결과가 좋습니다.</h3>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>로드된 데이터 기준으로 바로 확인할 항목이 없습니다.</p>
        </div>
      ) : (
        <div className="grid-container cols-2" style={{ gap: '1rem' }}>
          {activeSections.map(section => {
            const meta = severityMeta[section.severity];
            const Icon = meta.icon;
            return (
              <div key={section.key} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center' }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: meta.color,
                        backgroundColor: meta.background,
                      }}
                    >
                      <Icon size={18} />
                    </div>
                    <div>
                      <h3 className="card-title" style={{ margin: 0 }}>{section.title}</h3>
                      <span style={{ color: meta.color, fontSize: '0.78rem', fontWeight: 800 }}>{meta.label}</span>
                    </div>
                  </div>
                  <span className="badge badge-inactive">{section.issues.length}건</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 240, overflow: 'auto' }}>
                  {section.issues.map(issue => (
                    <div key={issue.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.65rem', backgroundColor: '#fff' }}>
                      <strong style={{ display: 'block', color: 'var(--color-primary-dark)', fontSize: '0.9rem' }}>{issue.title}</strong>
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>{issue.description}</span>
                    </div>
                  ))}
                </div>

                <button type="button" className="btn btn-secondary" onClick={() => onNavigate(targetTab[section.target])}>
                  {section.actionLabel} <ArrowRight size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
