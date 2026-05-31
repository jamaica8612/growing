import React, { useState } from 'react';
import type { Student, CounselLog, CounselLogType } from '../types';
import { MessageSquare, Search, Plus, Calendar, Trash2, Award, User, X, Copy, Check } from 'lucide-react';

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
    if (!formStudentId || !formTitle.trim() || !formContent.trim()) {
      alert('필수 입력란을 모두 채워주세요.');
      return;
    }

    onAddCounselLog({
      studentId: formStudentId,
      date: new Date().toISOString().split('T')[0],
      title: formTitle.trim(),
      content: formContent.trim(),
      type: formType,
      score: formType === 'test' ? formScore.trim() : undefined,
    });

    setIsFormOpen(false);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Search & Filter Toolbar */}
      <div className="filter-bar">
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', flexGrow: 1 }}>
          <div className="search-input-wrapper" style={{ maxWidth: '300px', flexGrow: 1 }}>
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="form-control"
              placeholder="일지 제목, 내용, 학생 이름으로 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <select
            className="form-control"
            style={{ width: '130px' }}
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as CounselLogType | 'all')}
          >
            <option value="all">전체 유형</option>
            <option value="counsel">상담 일지</option>
            <option value="progress">진도/수업</option>
            <option value="test">테스트 평가</option>
          </select>

          <select
            className="form-control"
            style={{ width: '150px' }}
            value={studentFilter}
            onChange={e => setStudentFilter(e.target.value)}
          >
            <option value="all">전체 학생</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <button className="btn btn-primary" onClick={handleOpenAdd}>
          <Plus size={16} /> 일지 신규 등록
        </button>
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

      {/* Main Logs List */}
      <div className="card">
        <h3 className="card-title">
          <MessageSquare size={20} className="text-primary" /> 교습소 상담 및 학습 일지 타임라인 ({filteredLogs.length}건)
        </h3>

        {filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--color-text-secondary)' }}>
            🌱 등록된 일지 기록이 없습니다. 새로운 내용을 등록해 보세요!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
            {[...filteredLogs].reverse().map(log => {
              const student = students.find(s => s.id === log.studentId);
              return (
                <div
                  key={log.id}
                  style={{
                    padding: '1.25rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: log.type === 'counsel' ? '#fffdfb' : log.type === 'test' ? '#fafdfc' : '#fafbfc',
                    borderLeft: `5px solid ${
                      log.type === 'counsel' ? 'var(--color-warning)' :
                      log.type === 'test' ? 'var(--color-accent-mint)' : 'var(--color-info)'
                    }`,
                    transition: 'transform var(--transition-fast)',
                    position: 'relative'
                  }}
                >
                  {/* Top line of log card */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {/* Badge */}
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          color: 'white',
                          backgroundColor:
                            log.type === 'counsel' ? 'var(--color-warning)' :
                            log.type === 'test' ? 'var(--color-accent-mint)' : 'var(--color-info)'
                        }}
                      >
                        {log.type === 'counsel' ? '상담' : log.type === 'test' ? '테스트' : '진도'}
                      </span>

                      {/* Student info link */}
                      <span style={{ fontWeight: 800, color: 'var(--color-primary-dark)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.95rem' }}>
                        <User size={14} className="text-secondary" />
                        {student?.name || '퇴원생'} ({student?.school || '학교없음'} {student?.grade.split(' ')[1] || student?.grade})
                      </span>

                      {/* Log Title */}
                      <span style={{ fontWeight: 700, color: 'var(--color-text-primary)', fontSize: '0.95rem' }}>
                        | {log.title}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Calendar size={13} /> {log.date}
                      </span>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.3rem 0.55rem', fontSize: '0.74rem', gap: '0.25rem' }}
                        onClick={() => handleCopyParentMessage(log, student)}
                      >
                        {copiedLogId === log.id ? <><Check size={12} className="text-success" /> 복사됨</> : <><Copy size={12} /> 안내 복사</>}
                      </button>
                      {onSendDraftToMessaging && (
                        <button
                          className="btn btn-primary"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.74rem', gap: '0.25rem' }}
                          onClick={() => handleSendToMessaging(log, student)}
                        >
                          <MessageSquare size={12} /> 알림장으로
                        </button>
                      )}
                      <button
                        className="btn-icon-only text-danger"
                        onClick={() => handleDelete(log.id, log.title)}
                        title="일지 삭제"
                        style={{ padding: '0.25rem' }}
                      >
                        <Trash2 size={15} style={{ color: 'var(--color-danger)' }} />
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', lineHeight: '1.6', paddingLeft: '0.25rem' }}>
                    {log.content}
                  </p>

                  {/* Test score highlight */}
                  {log.type === 'test' && log.score && (
                    <div style={{ marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: 'var(--color-accent-mint-light)', color: 'var(--color-primary)', padding: '0.25rem 0.65rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 700 }}>
                      <Award size={15} />
                      평가 결과: {log.score}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

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
                <button type="button" className="btn btn-secondary" onClick={() => setIsFormOpen(false)}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary">
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
