import { useMemo, useState } from 'react';
import { CalendarDays, CreditCard, FileText, MessageSquare, NotebookPen } from 'lucide-react';
import type { Attendance, Class, CounselLog, Payment, Student } from '../types';
import { getStudentTimeline, type StudentTimelineType } from '../lib/studentTimeline';

interface StudentTimelineProps {
  student: Student;
  classes: Class[];
  attendance: Attendance[];
  payments: Payment[];
  counselLogs: CounselLog[];
}

const FILTERS: { key: StudentTimelineType | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'attendance', label: '출결' },
  { key: 'homework', label: '숙제' },
  { key: 'payment', label: '수납' },
  { key: 'counsel', label: '상담/지도/시험' },
  { key: 'report', label: '리포트' },
];

const EVENT_STYLE = {
  danger: { color: 'var(--color-danger)', background: 'var(--color-danger-light)' },
  warning: { color: 'var(--color-warning)', background: '#fff7ed' },
  info: { color: 'var(--color-info)', background: '#eff6ff' },
  success: { color: 'var(--color-success)', background: 'var(--color-success-light)' },
} as const;

const ICONS = {
  attendance: CalendarDays,
  homework: NotebookPen,
  payment: CreditCard,
  counsel: MessageSquare,
  report: FileText,
} as const;

export function StudentTimeline({ student, classes, attendance, payments, counselLogs }: StudentTimelineProps) {
  const [filter, setFilter] = useState<StudentTimelineType | 'all'>('all');
  const events = useMemo(
    () => getStudentTimeline({ student, classes, attendance, payments, counselLogs }),
    [student, classes, attendance, payments, counselLogs]
  );
  const filteredEvents = filter === 'all' ? events : events.filter(event => event.type === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="tabs-header" style={{ marginBottom: 0 }}>
        {FILTERS.map(item => (
          <button
            key={item.key}
            type="button"
            className={`tab-btn ${filter === item.key ? 'active' : ''}`}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {filteredEvents.length === 0 ? (
        <div className="mobile-empty-card">표시할 기록이 없습니다.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredEvents.map(event => {
            const Icon = ICONS[event.type];
            const tone = EVENT_STYLE[event.severity ?? 'info'];
            return (
              <div
                key={event.id}
                className="mobile-data-card"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: '0.8rem',
                  alignItems: 'start',
                  cursor: 'default',
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: tone.color,
                    backgroundColor: tone.background,
                    flexShrink: 0,
                  }}
                >
                  <Icon size={17} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--color-primary-dark)' }}>{event.title}</strong>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>
                      {event.date}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: '0.25rem 0 0',
                      color: 'var(--color-text-secondary)',
                      fontSize: '0.84rem',
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {event.detail || '-'}
                  </p>
                  {event.meta ? (
                    <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {event.meta}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
