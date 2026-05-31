import { useState } from 'react';
import { Clipboard, FileText, Printer, Save, Wand2 } from 'lucide-react';
import type { Attendance, Class, CounselLog, Payment, Student } from '../types';
import { getStudentReportSummary } from '../lib/reportSummary';
import { StudentTagBadges } from './StudentTagBadges';

interface StudentReportPreviewProps {
  student: Student;
  classes: Class[];
  attendance: Attendance[];
  payments: Payment[];
  counselLogs: CounselLog[];
  onAddCounselLog: (log: Omit<CounselLog, 'id'>) => void;
  onUpdateCounselLog: (log: CounselLog) => void;
}

const today = () => new Date().toISOString().split('T')[0];

export function StudentReportPreview({
  student,
  classes,
  attendance,
  payments,
  counselLogs,
  onAddCounselLog,
  onUpdateCounselLog,
}: StudentReportPreviewProps) {
  const [month, setMonth] = useState(() => new Date().toISOString().substring(0, 7));
  const existingLog = counselLogs.find(
    log => log.studentId === student.id && log.type === 'progress' && log.title.includes(`${month} 월간 학습 리포트`)
  );
  const [syncKey, setSyncKey] = useState(`${student.id}|${month}`);
  const [comment, setComment] = useState(existingLog?.content ?? '');
  const summary = getStudentReportSummary({ student, classes, attendance, payments, counselLogs, month });

  const nextSyncKey = `${student.id}|${month}`;
  if (syncKey !== nextSyncKey) {
    setSyncKey(nextSyncKey);
    setComment(existingLog?.content ?? '');
  }

  const handleSave = () => {
    const content = comment.trim();
    if (!content) {
      alert('종합 의견을 입력해 주세요.');
      return;
    }
    if (existingLog) {
      onUpdateCounselLog({ ...existingLog, content, date: today() });
    } else {
      onAddCounselLog({
        studentId: student.id,
        date: today(),
        title: `${month} 월간 학습 리포트 종합 의견`,
        content,
        type: 'progress',
      });
    }
    alert('월간 리포트 의견을 저장했습니다.');
  };

  const reportText = [
    `Growing English 월간 학습 리포트`,
    `학생: ${student.name} (${student.school || '-'} / ${student.grade})`,
    `대상월: ${month}`,
    `반: ${summary.classNames}`,
    `출결: 출석 ${summary.attendance.present}회, 결석 ${summary.attendance.absent}회, 보강 ${summary.attendance.makeup}회, 출석률 ${summary.attendance.rate}%`,
    `숙제: 완료 ${summary.homework.done}회, 미흡 ${summary.homework.incomplete}회, 미완료 ${summary.homework.undone}회`,
    `수납: ${summary.payment ? (summary.payment.status === 'paid' ? '납부 완료' : '미납') : '청구 없음'}`,
    '',
    comment.trim() || summary.draft,
  ].join('\n');

  const handleCopy = () => {
    void navigator.clipboard.writeText(reportText).then(() => alert('리포트 내용을 복사했습니다.'));
  };

  return (
    <div className="student-report-preview">
      <div className="student-report-toolbar">
        <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-primary-dark)', margin: 0 }}>
          월간 학습 리포트
        </h4>
        <div className="student-report-actions">
          <input
            type="month"
            className="form-control"
            value={month}
            onChange={event => setMonth(event.target.value)}
          />
          <button type="button" className="btn btn-secondary" onClick={() => setComment(summary.draft)}>
            <Wand2 size={15} /> 초안 자동 작성
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            <Save size={15} /> 저장
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleCopy}>
            <Clipboard size={15} /> 복사
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            <Printer size={15} /> 인쇄/PDF
          </button>
        </div>
      </div>

      <div className="student-report-metrics">
        <div className="card metric-card accent-mint">
          <div className="metric-label">출석률</div>
          <div className="metric-value">{summary.attendance.rate}%</div>
        </div>
        <div className="card metric-card warning">
          <div className="metric-label">숙제 미흡/미완료</div>
          <div className="metric-value">{summary.homework.incomplete + summary.homework.undone}회</div>
        </div>
        <div className="card metric-card danger">
          <div className="metric-label">수납 상태</div>
          <div className="metric-value" style={{ fontSize: '1.05rem' }}>
            {summary.payment ? (summary.payment.status === 'paid' ? '완료' : '미납') : '없음'}
          </div>
        </div>
      </div>

      <div className="card" style={{ boxShadow: 'none', padding: '1rem' }}>
        <label style={{ display: 'block', fontWeight: 800, color: 'var(--color-primary-dark)', marginBottom: '0.5rem' }}>
          원장 종합 의견
        </label>
        <textarea
          className="form-control"
          rows={5}
          value={comment}
          onChange={event => setComment(event.target.value)}
          placeholder="초안 자동 작성 버튼을 누르거나 직접 의견을 입력해 주세요."
        />
      </div>

      <div className="print-report-card">
        <div className="print-report-header">
          <div>
            <div style={{ color: 'var(--color-primary)', fontWeight: 900, fontSize: '0.78rem' }}>GROWING ENGLISH</div>
            <h2 style={{ margin: '0.2rem 0 0', color: 'var(--color-primary-dark)' }}>월간 학습 리포트</h2>
          </div>
          <FileText size={30} color="var(--color-primary)" />
        </div>

        <div className="print-report-info">
          <div><strong>학생</strong> {student.name} ({student.school || '-'} / {student.grade})</div>
          <div><strong>대상월</strong> {month}</div>
          <div style={{ gridColumn: '1 / -1' }}><strong>수강반</strong> {summary.classNames}</div>
        </div>

        <div className="print-report-stats">
          <div><strong>출석</strong><br />{summary.attendance.present}회</div>
          <div><strong>결석</strong><br />{summary.attendance.absent}회</div>
          <div><strong>보강</strong><br />{summary.attendance.makeup}회</div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <strong>주요 태그</strong>
          <div style={{ marginTop: '0.35rem' }}>
            <StudentTagBadges tags={summary.tags.slice(0, 4)} showReasons />
          </div>
        </div>

        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, border: '1px dashed var(--color-primary-light)', borderRadius: 6, padding: '1rem' }}>
          {comment.trim() || summary.draft}
        </div>
      </div>
    </div>
  );
}
