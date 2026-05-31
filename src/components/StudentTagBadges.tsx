import type { StudentTag } from '../lib/studentTags';

interface StudentTagBadgesProps {
  tags: StudentTag[];
  maxVisible?: number;
  showReasons?: boolean;
}

const severityClass = {
  danger: 'badge-unpaid',
  warning: 'badge-absent',
  info: 'badge-makeup',
} as const;

export function StudentTagBadges({ tags, maxVisible, showReasons = false }: StudentTagBadgesProps) {
  const visibleTags = typeof maxVisible === 'number' ? tags.slice(0, maxVisible) : tags;
  const hiddenCount = typeof maxVisible === 'number' ? Math.max(0, tags.length - maxVisible) : 0;

  if (tags.length === 0) {
    return showReasons ? (
      <div style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>주의 태그가 없습니다.</div>
    ) : null;
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
      {visibleTags.map(tag => (
        <span
          key={tag.key}
          className={`badge ${severityClass[tag.severity]}`}
          title={tag.reason}
          style={{ fontSize: '0.68rem', lineHeight: 1.35 }}
        >
          {tag.label}
          {showReasons ? <span style={{ fontWeight: 500 }}> · {tag.reason}</span> : null}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="badge badge-inactive" style={{ fontSize: '0.68rem' }}>
          +{hiddenCount}
        </span>
      ) : null}
    </div>
  );
}
