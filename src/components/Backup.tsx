import React, { useRef, useState, useEffect } from 'react';
import { Download, Upload, AlertTriangle, CheckCircle, KeyRound, BrainCircuit, Trash2, BookOpen, MessageSquare, RotateCcw } from 'lucide-react';
import type { Student, Class, Attendance, Payment, CounselLog } from '../types';
import { api } from '../lib/api';
import { type MessageTemplates, DEFAULT_TEMPLATES, TEMPLATE_META } from '../lib/messageTemplates';

// Bump when the backup file shape changes so old/foreign files can be detected.
const SCHEMA_VERSION = 1;

interface BackupProps {
  onImportData: (data: {
    students: Student[];
    classes: Class[];
    attendance: Attendance[];
    payments: Payment[];
    counselLogs: CounselLog[];
  }) => void;
  onResetData: () => void;
  getAllData: () => {
    students: Student[];
    classes: Class[];
    attendance: Attendance[];
    payments: Payment[];
    counselLogs: CounselLog[];
  };
  kioskPin: string;
  onChangeKioskPin: (newPin: string) => void;
  messageTemplates: MessageTemplates;
  onSaveMessageTemplates: (templates: MessageTemplates) => void;
}

// Verify each record is an object carrying a string id, so a corrupt or
// foreign JSON file is rejected before it overwrites real data.
const isRecordArray = (value: unknown): value is { id: unknown }[] =>
  Array.isArray(value) &&
  value.every(item => typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string');

export const Backup: React.FC<BackupProps> = ({ onImportData, onResetData, getAllData, kioskPin, onChangeKioskPin, messageTemplates, onSaveMessageTemplates }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinStatus, setPinStatus] = useState<string | null>(null);

  const MEMORY_MAX = 3000;
  const DEFAULT_MEMORY = `- 아이비는 그로잉영어 원장님을 돕는 학원 운영 비서다.
- 사용자를 직접 부를 때는 "지선쌤"이라고 부른다.
- 답변은 짧고 실무적으로 한다.
- 학부모 안내문은 따뜻하고 정중하게 작성한다.
- 미납 안내는 압박하지 않고 확인 요청 형태로 작성한다.
- 출결/수납/상담/진도 데이터는 반드시 DB 조회 결과를 기준으로 답한다.
- 모르는 내용은 추측하지 않는다.
- 개인정보는 꼭 필요한 경우에만 최소한으로 언급한다.`;

  const [memoryText, setMemoryText] = useState('');
  const [memoryLoading, setMemoryLoading] = useState(true);
  const [memorySaving, setMemorySaving] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState<{ success: boolean; message: string } | null>(null);

  // 메시지 템플릿 편집 — 저장 전까지 로컬 초안으로 보관하고, 저장 시 상위로 올린다.
  const [templateDraft, setTemplateDraft] = useState<MessageTemplates>(messageTemplates);
  const [templateStatus, setTemplateStatus] = useState<string | null>(null);

  // 상위 템플릿 참조가 바뀌면(저장/복원 등) 초안을 동기화. effect 대신 렌더 중
  // 직접 비교하는 React 권장 패턴이라 편집 중 불필요한 리렌더가 없다.
  const [prevTemplates, setPrevTemplates] = useState(messageTemplates);
  if (prevTemplates !== messageTemplates) {
    setPrevTemplates(messageTemplates);
    setTemplateDraft(messageTemplates);
  }

  const handleSaveTemplates = () => {
    onSaveMessageTemplates(templateDraft);
    setTemplateStatus('알림 메시지 템플릿이 저장되었습니다.');
    setTimeout(() => setTemplateStatus(null), 4000);
  };

  const handleResetTemplate = (key: keyof MessageTemplates) => {
    setTemplateDraft(prev => ({ ...prev, [key]: DEFAULT_TEMPLATES[key] }));
  };

  useEffect(() => {
    api.getAssistantMemory()
      .then(text => setMemoryText(text || DEFAULT_MEMORY))
      .catch(() => setMemoryText(DEFAULT_MEMORY))
      .finally(() => setMemoryLoading(false));
  // DEFAULT_MEMORY는 상수라 deps에 넣지 않는다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveMemory = async () => {
    const trimmed = memoryText.slice(0, MEMORY_MAX);
    setMemorySaving(true);
    setMemoryStatus(null);
    try {
      await api.setAssistantMemory(trimmed);
      setMemoryStatus({ success: true, message: '아이비 기억이 저장되었습니다.' });
    } catch (e) {
      setMemoryStatus({ success: false, message: e instanceof Error ? e.message : '저장에 실패했습니다.' });
    } finally {
      setMemorySaving(false);
      setTimeout(() => setMemoryStatus(null), 4000);
    }
  };

  type AssistantNote = { id: string; scope: string; category: string; content: string; studentName: string; createdAt: string };
  const [notes, setNotes] = useState<AssistantNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    api.listAssistantNotes()
      .then(setNotes)
      .catch(() => {})
      .finally(() => setNotesLoading(false));
  }, []);

  const handleDeleteNote = async (id: string) => {
    if (!window.confirm('이 메모를 삭제하시겠습니까?')) return;
    setDeletingId(id);
    try {
      await api.deleteAssistantNote(id);
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch {
      alert('삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  // Export Data to JSON File
  const handleExport = () => {
    try {
      const data = {
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        ...getAllData(),
      };
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const today = new Date().toISOString().split('T')[0];
      const link = document.createElement('a');
      link.href = url;
      link.download = `그로잉영어_백업데이터_${today}.json`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('데이터 백업 생성 중 오류가 발생했습니다.');
      console.error(error);
    }
  };

  // Import Data from JSON File
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);

        if (typeof json !== 'object' || json === null) {
          throw new Error('데이터 양식이 일치하지 않습니다. 올바른 그로잉영어 백업 파일이 아닙니다.');
        }

        // Field-level verification: every collection must be an array of records
        // with a string id, so a partially corrupt file can't silently wipe data.
        if (
          !isRecordArray(json.students) ||
          !isRecordArray(json.classes) ||
          !isRecordArray(json.attendance) ||
          !isRecordArray(json.payments) ||
          !isRecordArray(json.counselLogs)
        ) {
          throw new Error('데이터 양식이 일치하지 않습니다. 올바른 그로잉영어 백업 파일이 아닙니다.');
        }

        // Newer backups carry a schemaVersion; warn if it's from a future build.
        if (typeof json.schemaVersion === 'number' && json.schemaVersion > SCHEMA_VERSION) {
          throw new Error('이 백업 파일은 더 최신 버전에서 생성되었습니다. 프로그램을 업데이트한 후 다시 시도해 주세요.');
        }

        if (window.confirm('클라우드에 저장된 기존 데이터가 모두 지워지고 백업 파일 데이터로 덮어씌워집니다. 진행하시겠습니까?')) {
          onImportData({
            students: json.students,
            classes: json.classes,
            attendance: json.attendance,
            payments: json.payments,
            counselLogs: json.counselLogs,
          });

          setImportStatus({
            success: true,
            message: `성공적으로 데이터를 복원했습니다! (학생: ${json.students.length}명, 수업: ${json.classes.length}개)`,
          });

          setTimeout(() => setImportStatus(null), 5000);
        }
      } catch (err) {
        setImportStatus({
          success: false,
          message: err instanceof Error ? err.message : 'JSON 파일 분석에 실패했습니다. 파일이 손상되었는지 확인하세요.',
        });
      }
    };
    reader.readAsText(file);
    
    // reset input
    if (e.target) {
      e.target.value = '';
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const downloadCsv = (filename: string, rows: string[][]) => {
    const bom = '﻿';
    const csv = bom + rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportStudentsCsv = () => {
    const { students, classes } = getAllData();
    const statusLabel: Record<string, string> = { active: '재원', paused: '휴원', inactive: '퇴원' };
    const header = ['이름', '학년', '학교', '학부모 연락처', '상태', '수강반'];
    const rows = students.map(s => {
      const classNames = classes.filter(c => c.studentIds.includes(s.id)).map(c => c.name).join(' / ');
      return [s.name, s.grade, s.school, s.parentContact, statusLabel[s.status] ?? s.status, classNames];
    });
    downloadCsv(`그로잉영어_학생목록_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  const handleExportAttendanceCsv = () => {
    const { students, classes, attendance } = getAllData();
    const studentMap = Object.fromEntries(students.map(s => [s.id, s.name]));
    const classMap = Object.fromEntries(classes.map(c => [c.id, c.name]));
    const statusLabel: Record<string, string> = { present: '출석', absent: '결석', makeup: '보강', late: '지각' };
    const hwLabel: Record<string, string> = { done: '완료', incomplete: '미흡', undone: '안함', '': '' };
    const header = ['날짜', '학생', '반', '출결', '숙제', '등원시간', '하원시간', '메모'];
    const rows = [...attendance]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(a => [
        a.date,
        studentMap[a.studentId] ?? '',
        classMap[a.classId] ?? '',
        statusLabel[a.status] ?? a.status,
        hwLabel[a.homeworkStatus ?? ''] ?? '',
        a.checkInTime ?? '',
        a.checkOutTime ?? '',
        a.memo ?? '',
      ]);
    downloadCsv(`그로잉영어_출결기록_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  const handleExportPaymentsCsv = () => {
    const { students, payments } = getAllData();
    const studentMap = Object.fromEntries(students.map(s => [s.id, s.name]));
    const statusLabel: Record<string, string> = { paid: '납부', unpaid: '미납' };
    const methodLabel: Record<string, string> = { card: '카드', cash: '현금', transfer: '이체', '': '' };
    const header = ['청구월', '학생', '금액', '상태', '납부일', '납부방법'];
    const rows = [...payments]
      .sort((a, b) => a.billingMonth.localeCompare(b.billingMonth))
      .map(p => [
        p.billingMonth,
        studentMap[p.studentId] ?? '',
        String(p.amount),
        statusLabel[p.status] ?? p.status,
        p.paymentDate ?? '',
        methodLabel[p.paymentMethod ?? ''] ?? '',
      ]);
    downloadCsv(`그로잉영어_수납내역_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  const handleSavePin = () => {
    const trimmed = pinInput.trim();
    if (!/^\d{4,8}$/.test(trimmed)) {
      setPinStatus('PIN은 4~8자리 숫자로 입력해 주세요.');
      return;
    }
    onChangeKioskPin(trimmed);
    setPinInput('');
    setPinStatus('키오스크 복귀 PIN이 변경되었습니다.');
    setTimeout(() => setPinStatus(null), 4000);
  };

  const handleResetClick = () => {
    if (
      window.confirm('경고: 클라우드에 저장된 이 계정의 모든 학원 데이터(학생/반/출결/수납/상담)가 영구 삭제됩니다.\n이 작업은 되돌릴 수 없습니다. 진행하시겠습니까?')
    ) {
      if (window.confirm('정말 진행하시겠습니까? (삭제 전 백업 파일을 먼저 받으시길 권장합니다)')) {
        onResetData();
        setImportStatus({
          success: true,
          message: '모든 학원 데이터가 삭제되었습니다.',
        });
        setTimeout(() => setImportStatus(null), 4000);
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Introduction Card */}
      <div className="card" style={{ borderLeft: '5px solid var(--color-primary)', order: 50 }}>
        <h3 className="card-title">🌱 AI·알림·백업 설정 안내</h3>
        <p style={{ fontSize: '0.92rem', color: 'var(--color-text-secondary)', lineHeight: '1.7' }}>
          데이터는 로그인 계정 기준으로 클라우드에 저장됩니다. 중요한 변경 전에는 백업 파일을 받아두세요.
        </p>
      </div>

      {/* Main Operations Grid */}
      <div className="grid-container cols-2" style={{ order: 51 }}>
        
        {/* Export Data */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1.5rem' }}>
          <div>
            <h4 style={{ fontWeight: 700, color: 'var(--color-primary-dark)', fontSize: '1.1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Download size={18} /> 데이터 백업하기 (내보내기)
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              학생, 반, 출결, 수납, 상담 데이터를 파일로 저장합니다.
            </p>
          </div>
          <button className="btn btn-primary" onClick={handleExport} style={{ width: '100%' }}>
            컴퓨터에 백업 파일 다운로드 (.json)
          </button>
        </div>

        {/* Import Data */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1.5rem' }}>
          <div>
            <h4 style={{ fontWeight: 700, color: 'var(--color-primary-dark)', fontSize: '1.1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Upload size={18} /> 데이터 복원하기 (가져오기)
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              백업 파일(.json)로 데이터를 복원합니다.
              <strong> 기존 클라우드 데이터가 대체됩니다.</strong>
            </p>
          </div>
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            onChange={handleImport}
            style={{ display: 'none' }}
          />
          <button className="btn btn-secondary" onClick={triggerFileInput} style={{ width: '100%', borderColor: 'var(--color-primary)' }}>
            백업 파일 업로드하여 복원하기
          </button>
        </div>
      </div>

      {/* CSV Export */}
      <div className="card" style={{ order: 52 }}>
        <h4 style={{ fontWeight: 700, color: 'var(--color-primary-dark)', fontSize: '1.1rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Download size={18} /> CSV 내보내기 (엑셀 호환)
        </h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
          학생, 출결, 수납 데이터를 엑셀에서 바로 열 수 있는 CSV 형식으로 다운로드합니다.
        </p>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleExportStudentsCsv} style={{ gap: '0.35rem' }}>
            <Download size={14} /> 학생 목록
          </button>
          <button className="btn btn-secondary" onClick={handleExportAttendanceCsv} style={{ gap: '0.35rem' }}>
            <Download size={14} /> 출결 기록
          </button>
          <button className="btn btn-secondary" onClick={handleExportPaymentsCsv} style={{ gap: '0.35rem' }}>
            <Download size={14} /> 수납 내역
          </button>
        </div>
      </div>

      {/* Kiosk Security PIN Setting */}
      <div className="card" style={{ borderLeft: '5px solid var(--color-secondary, #f59e0b)' }}>
        <h4 style={{ fontWeight: 700, color: 'var(--color-primary-dark)', fontSize: '1.1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <KeyRound size={18} /> 키오스크 복귀 PIN 설정
        </h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
          자율출결 키오스크 모드에서 관리자 화면으로 돌아올 때 사용하는 비밀번호입니다.
          외부에 노출되지 않도록 기본값(1234)에서 변경하여 사용하시길 권장합니다.
          <strong> 현재 설정: {'•'.repeat(kioskPin.length)} ({kioskPin.length}자리)</strong>
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="password"
            inputMode="numeric"
            className="form-control"
            style={{ maxWidth: '240px' }}
            placeholder="새 PIN (4~8자리 숫자)"
            value={pinInput}
            onChange={e => setPinInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSavePin(); }}
          />
          <button className="btn btn-primary" onClick={handleSavePin}>
            PIN 변경하기
          </button>
        </div>
        {pinStatus && (
          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)', marginTop: '0.75rem' }}>
            {pinStatus}
          </p>
        )}
      </div>

      {/* Operation Status Feedbacks */}
      {importStatus && (
        <div
          className="alert-banner"
          style={{
            backgroundColor: importStatus.success ? 'var(--color-success-light)' : 'var(--color-danger-light)',
            color: importStatus.success ? 'var(--color-primary)' : 'var(--color-danger)',
            border: `1px solid ${importStatus.success ? '#a3e2c9' : '#fee2e2'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
          }}
        >
          {importStatus.success ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
          <span>{importStatus.message}</span>
        </div>
      )}

      {/* 아이비 기억 설정 */}
      <div className="card" style={{ borderLeft: '5px solid var(--color-primary)' }}>
        <h4 style={{ fontWeight: 700, color: 'var(--color-primary-dark)', fontSize: '1.1rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BrainCircuit size={18} /> 아이비 기억 설정
        </h4>
        <p style={{ fontSize: '0.83rem', color: 'var(--color-text-secondary)', marginBottom: '0.9rem', lineHeight: 1.65 }}>
          아이비가 참고할 <strong>말투·운영 기준·학부모 안내 스타일</strong>을 자유롭게 입력하세요.
          학생 데이터를 저장하는 기능이 아니며, 아이비가 답변·안내문을 작성할 때 일관되게 따를 원칙만 적어두시면 됩니다.
          최대 {MEMORY_MAX.toLocaleString()}자 이내.
        </p>
        {memoryLoading ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>불러오는 중...</p>
        ) : (
          <>
            <textarea
              className="form-control"
              style={{ resize: 'vertical', minHeight: '160px', fontFamily: 'inherit', fontSize: '0.85rem', lineHeight: 1.7, marginBottom: '0.5rem' }}
              maxLength={MEMORY_MAX}
              value={memoryText}
              onChange={e => setMemoryText(e.target.value)}
              placeholder="예: 미납 안내는 압박하지 않고 확인 요청 형태로 작성한다."
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', color: memoryText.length >= MEMORY_MAX ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                {memoryText.length.toLocaleString()} / {MEMORY_MAX.toLocaleString()}자
              </span>
              <button
                className="btn btn-primary"
                onClick={() => void handleSaveMemory()}
                disabled={memorySaving}
                style={{ minWidth: '100px' }}
              >
                {memorySaving ? '저장 중...' : '기억 저장'}
              </button>
            </div>
            {memoryStatus && (
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  marginTop: '0.6rem', fontSize: '0.85rem', fontWeight: 600,
                  color: memoryStatus.success ? 'var(--color-primary)' : 'var(--color-danger)',
                }}
              >
                {memoryStatus.success ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
                {memoryStatus.message}
              </div>
            )}
          </>
        )}
      </div>

      {/* 아이비 자가학습 메모 목록 */}
      <div className="card">
        <h4 style={{ fontWeight: 700, color: 'var(--color-primary-dark)', fontSize: '1.1rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BookOpen size={18} /> 아이비가 스스로 학습한 메모
        </h4>
        <p style={{ fontSize: '0.83rem', color: 'var(--color-text-secondary)', marginBottom: '1rem', lineHeight: 1.65 }}>
          대화 중 아이비가 자동으로 저장한 메모입니다. <strong>학원 전반(academy)</strong> 노트는 매번 아이비 답변에 반영되고,
          <strong> 학생별(student)</strong> 노트는 해당 학생 관련 질문 시에만 불러옵니다. 잘못된 내용은 삭제하세요.
        </p>
        {notesLoading ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>불러오는 중...</p>
        ) : notes.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>
            🌱 아직 아이비가 학습한 메모가 없습니다. 대화를 나눠보세요.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '360px', overflowY: 'auto' }}>
            {notes.map(note => (
              <div
                key={note.id}
                style={{
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto',
                  alignItems: 'center', gap: '0.65rem',
                  padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)', backgroundColor: '#fafcfb',
                  fontSize: '0.83rem',
                }}
              >
                <span
                  className={note.scope === 'academy' ? 'badge badge-present' : 'badge badge-late'}
                  style={{ fontSize: '0.68rem', whiteSpace: 'nowrap' }}
                >
                  {note.scope === 'academy' ? '학원' : (note.studentName || '학생')}
                </span>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginRight: '0.4rem' }}>
                    [{note.category}]
                  </span>
                  <span style={{ color: 'var(--color-text-primary)', wordBreak: 'break-word' }}>{note.content}</span>
                </div>
                <button
                  className="btn-icon-only"
                  title="메모 삭제"
                  disabled={deletingId === note.id}
                  onClick={() => void handleDeleteNote(note.id)}
                  style={{ color: 'var(--color-danger)', opacity: deletingId === note.id ? 0.5 : 1 }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 알림 메시지 템플릿 설정 */}
      <div className="card" style={{ borderLeft: '5px solid var(--color-secondary, #f59e0b)' }}>
        <h4 style={{ fontWeight: 700, color: 'var(--color-primary-dark)', fontSize: '1.1rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MessageSquare size={18} /> 알림 메시지 템플릿
        </h4>
        <p style={{ fontSize: '0.83rem', color: 'var(--color-text-secondary)', marginBottom: '1rem', lineHeight: 1.65 }}>
          출결 관리·알림장 발송에서 사용하는 학부모 알림 문구를 직접 수정할 수 있습니다.
          <strong> {'{학생명}'}, {'{시간}'}, {'{날짜}'}, {'{평가명}'}, {'{점수}'}</strong> 토큰은 전송 시 실제 값으로 자동 치환됩니다.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {TEMPLATE_META.map(({ key, label, tokens }) => (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.3rem' }}>
                <label style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--color-primary-dark)' }}>
                  {label}
                  <span style={{ marginLeft: '0.5rem', fontWeight: 500, fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>
                    사용 가능: {tokens.join(', ')}
                  </span>
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem', gap: '0.25rem' }}
                  onClick={() => handleResetTemplate(key)}
                  disabled={templateDraft[key] === DEFAULT_TEMPLATES[key]}
                  title="이 문구를 기본값으로 되돌립니다"
                >
                  <RotateCcw size={12} /> 기본값
                </button>
              </div>
              <textarea
                className="form-control"
                style={{ resize: 'vertical', minHeight: '92px', fontFamily: 'inherit', fontSize: '0.83rem', lineHeight: 1.6 }}
                value={templateDraft[key]}
                onChange={e => setTemplateDraft(prev => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem', marginTop: '1rem' }}>
          {templateStatus && (
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <CheckCircle size={15} /> {templateStatus}
            </span>
          )}
          <button className="btn btn-primary" onClick={handleSaveTemplates} style={{ minWidth: '120px' }}>
            템플릿 저장
          </button>
        </div>
      </div>

      {/* Danger Zone Reset Data */}
      <div className="card" style={{ border: '1px solid #fca5a5', backgroundColor: '#fffbfb', order: 40 }}>
        <h4 style={{ fontWeight: 700, color: 'var(--color-danger)', fontSize: '1.05rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={18} /> 위험 영역 (초기화)
        </h4>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', maxWidth: '500px' }}>
            이 계정의 모든 학원 데이터(학생/반/출결/수납/상담)를 한 번에 비울 수 있습니다.
            <strong>주의: 클라우드의 실제 데이터가 모두 영구 삭제되므로 필요시 꼭 백업 파일을 먼저 받으세요.</strong>
          </p>
          <button
            className="btn btn-danger"
            style={{ backgroundColor: '#fee2e2', color: 'var(--color-danger)', border: '1px solid #fca5a5' }}
            onClick={handleResetClick}
          >
            전체 데이터 삭제
          </button>
        </div>
      </div>
    </div>
  );
};
