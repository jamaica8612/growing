import React, { useState } from 'react';
import type { Student, CounselLog, CounselLogType } from '../types';
import { MessageSquare, Search, Plus, Calendar, Trash2, Award, User, X } from 'lucide-react';

interface CounselLogsProps {
  counselLogs: CounselLog[];
  students: Student[];
  onAddCounselLog: (log: Omit<CounselLog, 'id'>) => void;
  onDeleteCounselLog: (id: string) => void;
}

export const CounselLogs: React.FC<CounselLogsProps> = ({
  counselLogs,
  students,
  onAddCounselLog,
  onDeleteCounselLog,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<CounselLogType | 'all'>('all');
  const [studentFilter, setStudentFilter] = useState<string>('all');

  // Form Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formStudentId, setFormStudentId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formType, setFormType] = useState<CounselLogType>('counsel');
  const [formScore, setFormScore] = useState('');

  // active students for dropdown
  const activeStudents = students.filter(s => s.status === 'active');

  const handleOpenAdd = () => {
    setFormStudentId(activeStudents[0]?.id || '');
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Calendar size={13} /> {log.date}
                      </span>
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
                      {activeStudents.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.school} | {s.grade.split(' ')[1] || s.grade})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>일지 유형 *</label>
                    <select
                      className="form-control"
                      value={formType}
                      onChange={e => setFormType(e.target.value as any)}
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
