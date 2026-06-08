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
            className={`ka-tab${filter === item.key ? ' on' : ''}`}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {filteredEvents.length === 0 ? (
        <div className="mobile-empty-card">표시할 기록이 없습니다.</div>
      ) : (
        <div className="st-timeline">
          {filteredEvents.map(event => {
            const Icon = ICONS[event.type];
            const tone = EVENT_STYLE[event.severity ?? 'info'];
            const label = FILTERS.find(item => item.key === event.type)?.label ?? '';
            return (
              <div key={event.id} className="st-tl-item">
                <div className="st-tl-rail">
                  <div className="st-tl-node" style={{ backgroundColor: tone.color }}>
                    <Icon size={15} />
                  </div>
                </div>
                <div className="st-tl-card">
                  <div className="st-tl-head">
                    {label ? (
                      <span className="st-tl-type" style={{ color: tone.color }}>
                        {label}
                      </span>
                    ) : null}
                    <span className="st-tl-title">{event.title}</span>
                    <span className="st-tl-date">{event.date}</span>
                  </div>
                  <p className="st-tl-detail">{event.detail || '-'}</p>
                  {event.meta ? <span className="st-tl-meta">{event.meta}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
