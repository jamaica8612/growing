import React, { useState } from 'react';
import type { Student, CounselLog, CounselLogType } from '../types';
import { MessageSquare, Search, Plus, Calendar, Trash2, Award, User, X, Copy, Check, Download } from 'lucide-react';

interface CounselLogsProps {
  counselLogs: CounselLog[];
  students: Student[];
  onAddCounselLog: (log: Omit<CounselLog, 'id'>) => void;
  onDeleteCounselLog: (id: string) => void;
  onSendDraftToMessaging?: (content: string) => void;
}

export const CounselLogs: React.FC<CounselLogsProps> = ({
  counselLogs,
  students,
  onAddCounselLog,
  onDeleteCounselLog,
  onSendDraftToMessaging,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<CounselLogType | 'all'>('all');
  const [studentFilter, setStudentFilter] = useState<string>('all');
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  // Form Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formStudentId, setFormStudentId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formType, setFormType] = useState<CounselLogType>('counsel');
  const [formScore, setFormScore] = useState('');

  // 신규 일지 작성 대상: 재원생 + 휴원생(퇴원생만 제외). 휴원 중인 학생의
  // 복귀 상담·특이사항도 기록할 수 있어야 한다.
  const enrolledStudents = students.filter(s => s.status !== 'inactive');

  const handleOpenAdd = () => {
    setFormStudentId(enrolledStudents[0]?.id || '');
    setFormTitle('');
    setFormContent('');
    setFormType('counsel');
    setFormScore('');
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStudentId || !formTitle.trim() || !formContent.trim() || isSubmitting) {
      if (isSubmitting) return;
      alert('필수 입력란을 모두 채워주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      onAddCounselLog({
        studentId: formStudentId,
        date: new Date().toISOString().split('T')[0],
        title: formTitle.trim(),
        content: formContent.trim(),
        type: formType,
        score: formType === 'test' ? formScore.trim() : undefined,
      });

      setIsFormOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (id: string, title: string) => {
    if (window.confirm(`"${title}" 기록을 삭제하시겠습니까?`)) {
      onDeleteCounselLog(id);
    }
  };

  const typeLabel = (type: CounselLogType) =>
    type === 'counsel' ? '상담' : type === 'test' ? '테스트' : '진도/학습';

  const buildParentMessage = (log: CounselLog, student?: Student) => {
    const studentName = student?.name ?? '학생';
    const scoreLine = log.type === 'test' && log.score ? `\n- 평가 결과: ${log.score}` : '';
    return (
      `안녕하세요, 그로잉영어입니다. 🌱\n\n` +
      `${studentName} 학생의 ${typeLabel(log.type)} 내용을 안내드립니다.\n\n` +
      `- 일자: ${log.date}\n` +
      `- 제목: ${log.title}${scoreLine}\n\n` +
      `${log.content}\n\n` +
      `가정에서도 이어서 관심과 격려 부탁드립니다. 궁금하신 점은 편하게 말씀 주세요.`
    );
  };

  const handleCopyParentMessage = (log: CounselLog, student?: Student) => {
    navigator.clipboard.writeText(buildParentMessage(log, student)).then(() => {
      setCopiedLogId(log.id);
      setTimeout(() => setCopiedLogId(null), 2000);
    });
  };

  const handleSendToMessaging = (log: CounselLog, student?: Student) => {
    onSendDraftToMessaging?.(buildParentMessage(log, student));
  };

  // 현재 필터된 일지를 마크다운 파일로 내보낸다(상담 자료·인수인계용).
  const handleExport = () => {
    if (filteredLogs.length === 0) {
      alert('내보낼 일지가 없습니다. 필터를 확인해 주세요.');
      return;
    }
    const lines: string[] = [`# 상담/진도 일지 (${filteredLogs.length}건)`, ''];
    [...filteredLogs]
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach(log => {
        const student = students.find(s => s.id === log.studentId);
        lines.push(`## ${student?.name ?? '(퇴원생)'} · ${typeLabel(log.type)} · ${log.date}`);
        lines.push(`**${log.title}**`);
        if (log.type === 'test' && log.score) lines.push(`- 점수: ${log.score}`);
        lines.push('', log.content, '');
      });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `상담일지_${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter logs
  const filteredLogs = counselLogs.filter(log => {
    const student = students.find(s => s.id === log.studentId);
    const studentName = student?.name || '';

    const matchesSearch =
      log.title.toLowerCase().includes(search.toLowerCase()) ||
      log.content.toLowerCase().includes(search.toLowerCase()) ||
      studentName.toLowerCase().includes(search.toLowerCase());

    const matchesType = typeFilter === 'all' || log.type === typeFilter;
    const matchesStudent = studentFilter === 'all' || log.studentId === studentFilter;

    return matchesSearch && matchesType && matchesStudent;
  });

  const recentShareCandidates = [...counselLogs]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter(log => students.find(s => s.id === log.studentId)?.status !== 'inactive')
    .slice(0, 6);

  return (
    <div className="gd-root">
      {/* ── 툴바 ── */}
      <div className="cl-toolbar">
        <div className="cl-search pay-search">
          <Search size={15} />
          <input placeholder="일지 제목, 내용, 학생 이름으로 검색…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="gd-seg cl-typeseg">
          {([['all','전체'],['counsel','상담'],['progress','진도'],['test','테스트']] as const).map(([v,l]) => (
            <button key={v} className={`gd-seg-b ${typeFilter === v ? 'sel ok' : ''}`} onClick={() => setTypeFilter(v)}>{l}</button>
          ))}
        </div>
        <select className="form-control" style={{ width: '140px', padding: '0.4rem 0.6rem' }} value={studentFilter} onChange={e => setStudentFilter(e.target.value)}>
          <option value="all">전체 학생</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="cl-count">{filteredLogs.length}건</span>
        <div className="cl-tools-right">
          <button className="pay-btn ghost" onClick={handleExport}><Download size={14} /> 내보내기</button>
          <button className="pay-btn primary" onClick={handleOpenAdd}><Plus size={14} /> 일지 등록</button>
        </div>
      </div>

      {recentShareCandidates.length > 0 && (
        <div className="card" style={{ borderLeft: '5px solid var(--color-info)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div>
              <h3 className="card-title" style={{ marginBottom: '0.35rem' }}>
                <MessageSquare size={20} className="text-primary" /> 최근 일지 공유 후보
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                최근 상담/진도/평가 기록을 학부모 안내문 초안으로 빠르게 복사하거나 알림장 조립기로 넘길 수 있습니다.
              </p>
            </div>
            <span className="badge badge-makeup" style={{ fontSize: '0.78rem' }}>최근 {recentShareCandidates.length}건</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
            {recentShareCandidates.map(log => {
              const student = students.find(s => s.id === log.studentId);
              return (
                <div
                  key={log.id}
                  style={{
                    padding: '0.9rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: '#fafcfb',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <div>
                      <strong style={{ color: 'var(--color-primary-dark)' }}>{student?.name ?? '퇴원생'}</strong>
                      <div style={{ fontSize: '0.76rem', color: 'var(--color-text-secondary)', marginTop: '0.1rem' }}>
                        {typeLabel(log.type)} · {log.date}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        color: '#fff',
                        backgroundColor: log.type === 'counsel' ? 'var(--color-warning)' : log.type === 'test' ? 'var(--color-accent-mint)' : 'var(--color-info)',
                      }}
                    >
                      {typeLabel(log.type)}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--color-text-primary)' }}>{log.title}</div>
                  <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.8rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {log.content}
                  </p>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ flex: '1 1 110px', padding: '0.4rem 0.6rem', fontSize: '0.76rem', gap: '0.25rem' }}
                      onClick={() => handleCopyParentMessage(log, student)}
                    >
                      {copiedLogId === log.id ? <><Check size={12} className="text-success" /> 복사됨</> : <><Copy size={12} /> 안내 복사</>}
                    </button>
                    <button
                      className="btn btn-primary"
                      style={{ flex: '1 1 120px', padding: '0.4rem 0.6rem', fontSize: '0.76rem', gap: '0.25rem' }}
                      onClick={() => handleSendToMessaging(log, student)}
                    >
                      <MessageSquare size={12} /> 알림장으로
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 일지 목록 ── */}
      {filteredLogs.length === 0 ? (
        <div className="gd-card" style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--color-text-secondary)' }}>
          🌱 등록된 일지 기록이 없습니다. 일지 등록 버튼을 눌러 새 내용을 추가해 보세요.
        </div>
      ) : (
        <div className="cl-list">
          {[...filteredLogs].reverse().map(log => {
            const student = students.find(s => s.id === log.studentId);
            const typeColor = log.type === 'counsel' ? 'var(--color-warning)' : log.type === 'test' ? 'var(--color-accent-mint)' : 'var(--color-info)';
            return (
              <div key={log.id} className="cl-log" style={{ borderLeftColor: typeColor }}>
                <div className="cl-log-top">
                  <div className="cl-log-id">
                    <span className="cl-type" style={{ background: typeColor }}>
                      {log.type === 'counsel' ? '상담' : log.type === 'test' ? '테스트' : '진도'}
                    </span>
                    <span className="cl-who">
                      <User size={13} /> {student?.name || '퇴원생'}
                      <em>{student?.school} {student?.grade.split(' ')[1] || student?.grade}</em>
                    </span>
                  </div>
                  <div className="cl-log-actions">
                    <span className="cl-date"><Calendar size={12} /> {log.date}</span>
                    <button className={`at-act ${copiedLogId === log.id ? 'done' : ''}`} onClick={() => handleCopyParentMessage(log, student)}>
                      {copiedLogId === log.id ? <><Check size={12} /> 복사됨</> : <><Copy size={12} /> 안내 복사</>}
                    </button>
                    {onSendDraftToMessaging && (
                      <button className="at-act primary" onClick={() => handleSendToMessaging(log, student)}>
                        <MessageSquare size={12} /> 알림장으로
                      </button>
                    )}
                    <button className="cl-del" onClick={() => handleDelete(log.id, log.title)} title="일지 삭제"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="cl-title">{log.title}</div>
                <p className="cl-content">{log.content}</p>
                {log.type === 'test' && log.score && (
                  <div className="cl-score"><Award size={14} /> 평가 결과: {log.score}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Add Log */}
      {isFormOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <h3 className="modal-title">일지 신규 등록</h3>
              <button className="btn-icon-only" onClick={() => setIsFormOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                
                <div className="form-row">
                  <div className="form-group">
                    <label>대상 학생 선택 *</label>
                    <select
                      className="form-control"
                      value={formStudentId}
                      onChange={e => setFormStudentId(e.target.value)}
                      required
                    >
                      <option value="">학생을 선택하세요</option>
                      {enrolledStudents.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.status === 'paused' ? ' (휴원)' : ''} ({s.school} | {s.grade.split(' ')[1] || s.grade})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>일지 유형 *</label>
                    <select
                      className="form-control"
                      value={formType}
                      onChange={e => setFormType(e.target.value as CounselLogType)}
                    >
                      <option value="counsel">학부모 상담 일지</option>
                      <option value="progress">학생 진도/학습 일지</option>
                      <option value="test">테스트 평가 결과</option>
                    </select>
                  </div>
                </div>

                {formType === 'test' && (
                  <div className="form-group">
                    <label>테스트 성적 / 평가 결과</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="예: 95/100점, A등급, 통과"
                      value={formScore}
                      onChange={e => setFormScore(e.target.value)}
                      required={formType === 'test'}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label>제목 *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="예: 단어 테스트 미달 상담, 관계사 문제풀이 지도"
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>상세 내용 *</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    placeholder="상담 대화 내용이나 수업 관찰 내역을 기록해 주세요..."
                    value={formContent}
                    onChange={e => setFormContent(e.target.value)}
                    required
                  />
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  등록 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
