import { useState } from 'react';
import { BookOpen, Check, Copy, Printer, Save, Wand2 } from 'lucide-react';
import type { Attendance, Class, CounselLog, Payment, Student } from '../types';
import { getStudentReportSummary } from '../lib/reportSummary';
import { AttendanceCalendar } from './AttendanceCalendar';

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

// 담쟁이 아이콘 (인라인 SVG)
const IvyIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 20h10M10 20c5.5-2.5.8-6.4 5-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.6 1.4-.5 2.6-.4 4 1.7-.4 3-1 4-2.2 1-1.3 1.3-3 1.4-4.8-2.4.6-3.9 1.5-4.7 3z" />
  </svg>
);

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
  const [toast, setToast] = useState<string | null>(null);

  const existingLog = counselLogs.find(
    log =>
      log.studentId === student.id &&
      log.type === 'progress' &&
      log.title.includes(`${month} 월간 학습 리포트`),
  );

  const [syncKey, setSyncKey] = useState(`${student.id}|${month}`);
  const [comment, setComment] = useState(existingLog?.content ?? '');

  const summary = getStudentReportSummary({
    student, classes, attendance, payments, counselLogs, month,
  });

  const nextSyncKey = `${student.id}|${month}`;
  if (syncKey !== nextSyncKey) {
    setSyncKey(nextSyncKey);
    setComment(existingLog?.content ?? '');
  }

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

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
    flash('진도 일지로 저장했어요');
  };

  const reportText = [
    `Growing English 월간 학습 리포트`,
    `학생: ${student.name} (${student.school || '-'} / ${student.grade})`,
    `대상월: ${month}`,
    `반: ${summary.classNames}`,
    `출결: 출석 ${summary.attendance.present}회, 결석 ${summary.attendance.absent}회, 보강 ${summary.attendance.makeup}회, 출석률 ${summary.attendance.rate}%`,
    `보충률: ${summary.attendance.supplementRate}% (다른 학생 평균 ${summary.attendance.peerSupplementRate}%, 차이 ${summary.attendance.supplementRateDelta > 0 ? '+' : ''}${summary.attendance.supplementRateDelta}%p)`,
    `숙제: 완료 ${summary.homework.done}회, 미흡 ${summary.homework.incomplete}회, 미완료 ${summary.homework.undone}회`,
    `수납: ${summary.payment ? (summary.payment.status === 'paid' ? '납부 완료' : '미납') : '청구 없음'}`,
    '',
    comment.trim() || summary.draft,
  ].join('\n');

  const handleCopy = () => {
    void navigator.clipboard.writeText(reportText).then(() => flash('리포트 본문을 복사했어요'));
  };

  // 숙제 수행률
  const hwTotal = summary.homework.done + summary.homework.incomplete + summary.homework.undone;
  const hwRate = hwTotal > 0 ? Math.round((summary.homework.done / hwTotal) * 100) : 0;

  // 이번 달 평가·진도 일지
  const testLogs = summary.logs.filter(l => l.type === 'test');
  const progressLogs = summary.logs.filter(
    l => l.type === 'progress' && !l.title.includes('월간 학습 리포트'),
  );

  // 학생 달력용 출결 (이 학생 + 이 월 필터)
  const studentMonthAttendance = attendance.filter(
    a => a.studentId === student.id && a.date.startsWith(month),
  );

  // 발행일 및 대상월 표시
  const [yyyy, mm] = month.split('-');
  const monthLabel = `${yyyy}년 ${mm}월 학습 리포트`;
  const issueDate = today();

  return (
    <div className="rp-root">
      {/* ── 툴바 (인쇄 영역 밖) ── */}
      <div className="rp-toolbar">
        <div className="rp-tool-left">
          <span className="rp-tool-title">
            <BookOpen size={16} /> 월간 학습 리포트
          </span>
          <input
            type="month"
            className={`msg-select rp-month`}
            value={month}
            onChange={e => setMonth(e.target.value)}
          />
        </div>
        <div className="rp-tool-btns">
          <button type="button" className="pay-btn ghost" onClick={() => setComment(summary.draft)}>
            <Wand2 size={14} /> 초안 자동 작성
          </button>
          <button type="button" className="pay-btn ghost" onClick={handleCopy}>
            <Copy size={14} /> 복사
          </button>
          <button type="button" className="pay-btn ghost" onClick={handleSave}>
            <Save size={14} /> 일지 저장
          </button>
          <button type="button" className="pay-btn primary" onClick={() => window.print()}>
            <Printer size={14} /> 인쇄
          </button>
        </div>
      </div>

      {/* ── 인쇄 문서 (.rp-doc) ── */}
      <div className="rp-doc">
        {/* 브랜드 헤더 */}
        <div className="rp-doc-head">
          <div className="rp-doc-brand">
            <span className="rp-doc-ic">
              <IvyIcon size={22} />
            </span>
            <div>
              <b>그로잉영어 교습소</b>
              <span>GROWING ENGLISH</span>
            </div>
          </div>
          <div className="rp-doc-meta">
            <b>{monthLabel}</b>
            <span>발행일 {issueDate}</span>
          </div>
        </div>

        {/* 학생 프로필 + 출석률 */}
        <div className="rp-student">
          <div className="rp-student-av">{student.name[0]}</div>
          <div className="rp-student-id">
            <b>{student.name}</b>
            <span>
              {student.school || '학교 미기재'}
              {student.grade ? ` · ${student.grade}` : ''}
              {summary.classNames ? ` · ${summary.classNames}` : ''}
            </span>
          </div>
          <div className="rp-student-rate">
            <span className="rp-rate-v">{summary.attendance.rate}%</span>
            <span className="rp-rate-l">{mm}월 출석률</span>
          </div>
        </div>

        {/* 통계 4개 */}
        <div className="rp-stats">
          <div className="rp-stat ok">
            <span className="rp-stat-l">출석</span>
            <span className="rp-stat-v">{summary.attendance.present}</span>
            <span className="rp-stat-s">총 {summary.attendance.total}회 중</span>
          </div>
          <div className="rp-stat info">
            <span className="rp-stat-l">보충률</span>
            <span className="rp-stat-v">{summary.attendance.supplementRate}%</span>
            <span className="rp-stat-s">평균 {summary.attendance.peerSupplementRate}%</span>
          </div>
          <div className={`rp-stat${summary.attendance.absent > 0 ? ' warn' : ''}`}>
            <span className="rp-stat-l">결석</span>
            <span className="rp-stat-v">{summary.attendance.absent}</span>
            <span className="rp-stat-s">{summary.attendance.absent > 0 ? '보강 확인' : '없음'}</span>
          </div>
          <div className="rp-stat ok">
            <span className="rp-stat-l">숙제 수행</span>
            <span className="rp-stat-v">{hwRate}%</span>
            <span className="rp-stat-s">{summary.homework.done}/{hwTotal}회 완료</span>
          </div>
        </div>

        {/* 2단: 출결 달력 + 평가·진도 */}
        <div className="rp-2col">
          <div className="rp-section">
            <h4 className="rp-h">📅 {mm}월 출결 달력</h4>
            <AttendanceCalendar
              attendance={studentMonthAttendance}
              month={month}
              compact
            />
          </div>

          <div className="rp-section">
            <h4 className="rp-h">🎯 평가 · 진도</h4>
            {testLogs.length === 0 && progressLogs.length === 0 ? (
              <p style={{ fontSize: '0.84rem', color: 'var(--color-text-muted)' }}>
                이번 달 평가·진도 기록이 없습니다.
              </p>
            ) : (
              <div className="rp-records">
                {testLogs.map(log => (
                  <div key={log.id} className="rp-rec">
                    <span className="rp-rec-badge test">평가</span>
                    <div className="rp-rec-body">
                      <b>{log.title}</b>
                      <span>{log.content}</span>
                    </div>
                    {log.score && <span className="rp-rec-score">{log.score}</span>}
                  </div>
                ))}
                {progressLogs.map(log => (
                  <div key={log.id} className="rp-rec">
                    <span className="rp-rec-badge prog">진도</span>
                    <div className="rp-rec-body">
                      <b>{log.title}</b>
                      <span>{log.content}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 선생님 종합 의견 */}
        <div className="rp-section" style={{ marginBottom: '1.4rem' }}>
          <h4 className="rp-h">✍️ 선생님 종합 의견</h4>
          <textarea
            className="rp-comment"
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="초안 자동 작성 버튼을 누르거나 직접 의견을 입력해 주세요."
          />
        </div>

        {/* 문서 푸터 */}
        <div className="rp-doc-foot">
          <span>그로잉영어 교습소 · 담당 선생님</span>
          <span>본 리포트는 {student.name} 학부모님께 발송됩니다.</span>
        </div>
      </div>

      {/* 토스트 */}
      {toast && (
        <div className="gd-toast">
          <Check size={14} /> {toast}
        </div>
      )}
    </div>
  );
}
