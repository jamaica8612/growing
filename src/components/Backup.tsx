import React, { useRef, useState, useEffect } from 'react';
import { Download, Upload, AlertTriangle, CheckCircle, KeyRound, BrainCircuit, Trash2, BookOpen, MessageSquare, FolderOpen, FileSpreadsheet, FileArchive, File, X } from 'lucide-react';
import type { Student, Class, Attendance, Payment, CounselLog } from '../types';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';

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
}

// Verify each record is an object carrying a string id, so a corrupt or
// foreign JSON file is rejected before it overwrites real data.
const isRecordArray = (value: unknown): value is { id: unknown }[] =>
  Array.isArray(value) &&
  value.every(item => typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string');

export const Backup: React.FC<BackupProps> = ({ onImportData, onResetData, getAllData, kioskPin, onChangeKioskPin }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinStatus, setPinStatus] = useState<string | null>(null);

  // ---- 파일 보관함 (Supabase Storage) ----
  interface StoredFile { name: string; size: number; updated_at: string; }
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(true); // 초기값 true → 마운트 즉시 로딩 표시
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const BUCKET = 'academy-files';
  const ALLOWED_EXT = ['.xlsx', '.xls', '.csv', '.zip', '.pdf'];

  const loadStoredFiles = () => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setFilesLoading(false); return; }
      supabase.storage.from(BUCKET)
        .list(`${user.id}/`, { sortBy: { column: 'updated_at', order: 'desc' } })
        .then(({ data, error }) => {
          setStoredFiles(!error && data ? data.map(f => ({ name: f.name, size: f.metadata?.size ?? 0, updated_at: f.updated_at ?? '' })) : []);
          setFilesLoading(false);
        });
    });
  };

  // setState는 모두 .then() 콜백(비동기) 안에서만 호출 — set-state-in-effect 규칙 준수.
  useEffect(loadStoredFiles, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!uploadInputRef.current) return;
    uploadInputRef.current.value = '';
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      alert(`지원하지 않는 형식입니다. (허용: ${ALLOWED_EXT.join(', ')})`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('파일 크기는 최대 10MB까지 가능합니다.');
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert('로그인이 필요합니다.'); return; }
    setUploadProgress(`${file.name} 올리는 중...`);
    const path = `${user.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file);
    setUploadProgress(null);
    if (error) { alert(`업로드 실패: ${error.message}`); return; }
    await loadStoredFiles();
  };

  const handleDownload = async (fileName: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.storage.from(BUCKET).download(`${user.id}/${fileName}`);
    if (error || !data) { alert('다운로드 실패: ' + error?.message); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteFile = async (fileName: string) => {
    if (!window.confirm(`"${fileName}" 파일을 삭제하시겠습니까?`)) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.storage.from(BUCKET).remove([`${user.id}/${fileName}`]);
    if (error) { alert('삭제 실패: ' + error.message); return; }
    setStoredFiles(prev => prev.filter(f => f.name !== fileName));
  };

  const fileIcon = (name: string) => {
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) return <FileSpreadsheet size={16} style={{ color: '#16a34a' }} />;
    if (ext === '.zip') return <FileArchive size={16} style={{ color: '#ca8a04' }} />;
    return <File size={16} style={{ color: 'var(--color-text-secondary)' }} />;
  };

  const fmtSize = (bytes: number) =>
    bytes < 1024 ? `${bytes}B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;

  const fmtDate = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // 업로드할 때 서버에 저장된 파일명 앞 타임스탬프를 제거해 표시용 이름을 추출.
  const displayName = (stored: string) => stored.replace(/^\d+_/, '');

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
    const statusLabel: Record<string, string> = { present: '출석', absent: '결석', makeup: '보강', supplement: '보충', late: '지각' };
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
    <div className="gd-root">

      {/* ── 안내 배너 ── */}
      <div className="set-intro">
        <span className="set-intro-ic">🌱</span>
        <p>데이터는 로그인 계정 기준으로 클라우드에 저장됩니다. 중요한 변경 전에는 백업 파일을 받아두세요.</p>
      </div>

      {/* ── 백업/복원 2열 ── */}
      <div className="set-grid2">
        <div className="gd-card set-tile">
          <div className="set-tile-ic ok"><Download size={20} /></div>
          <div className="set-tile-t">데이터 백업하기</div>
          <div className="set-tile-d">학생, 반, 출결, 수납, 상담 데이터를 파일로 저장합니다.</div>
          <button className="btn btn-primary set-w" onClick={handleExport}>컴퓨터에 백업 파일 다운로드 (.json)</button>
        </div>

        <div className="gd-card set-tile">
          <div className="set-tile-ic info"><Upload size={20} /></div>
          <div className="set-tile-t">데이터 복원하기</div>
          <div className="set-tile-d">백업 파일(.json)로 데이터를 복원합니다. <b>기존 데이터가 대체됩니다.</b></div>
          <input type="file" accept=".json" ref={fileInputRef} onChange={handleImport} style={{ display: 'none' }} />
          <button className="btn btn-secondary set-w" style={{ borderColor: 'var(--color-primary)' }} onClick={triggerFileInput}>백업 파일 업로드하여 복원하기</button>
        </div>
      </div>

      {/* CSV Export */}
      <div className="gd-card set-accent">
        <h4 className="set-h">
          <Download size={18} /> CSV 내보내기 (엑셀 호환)
        </h4>
        <p className="set-p">
          학생, 출결, 수납 데이터를 엑셀에서 바로 열 수 있는 CSV 형식으로 다운로드합니다.
        </p>
        <div className="set-csv">
          <button className="pay-btn ghost" onClick={handleExportStudentsCsv}>
            <Download size={14} /> 학생 목록
          </button>
          <button className="pay-btn ghost" onClick={handleExportAttendanceCsv}>
            <Download size={14} /> 출결 기록
          </button>
          <button className="pay-btn ghost" onClick={handleExportPaymentsCsv}>
            <Download size={14} /> 수납 내역
          </button>
        </div>
      </div>

      {/* 파일 보관함 */}
      <div className="gd-card">
        <div className="set-section-head">
          <div>
            <h4 className="set-h">
              <FolderOpen size={18} /> 참고 파일 보관함
            </h4>
            <p className="set-p tight">
              학원 양식·리포트·장부 파일을 올려두세요. 엑셀, ZIP, PDF 허용 (최대 10MB)
            </p>
          </div>
          <div className="set-inline-actions">
            {uploadProgress && (
              <span className="set-status-text">{uploadProgress}</span>
            )}
            <input
              ref={uploadInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.zip,.pdf"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <button className="pay-btn primary" onClick={() => uploadInputRef.current?.click()} disabled={!!uploadProgress}>
              <Upload size={15} /> 파일 올리기
            </button>
          </div>
        </div>

        {filesLoading ? (
          <p className="set-muted">불러오는 중...</p>
        ) : storedFiles.length === 0 ? (
          <div className="set-empty">
            아직 올린 파일이 없습니다.<br />
            <span>월말 리포트, 수납 장부, 기존 양식 등을 올려두면 나중에 기능 설계에 활용할 수 있습니다.</span>
          </div>
        ) : (
          <div className="set-file-list">
            {storedFiles.map(f => (
              <div key={f.name} className="set-file-row">
                {fileIcon(f.name)}
                <span className="set-file-name" title={displayName(f.name)}>
                  {displayName(f.name)}
                </span>
                <span className="set-file-meta">
                  {fmtSize(f.size)} · {fmtDate(f.updated_at)}
                </span>
                <button
                  className="pay-btn ghost sm"
                  onClick={() => handleDownload(f.name)}
                  title="다운로드"
                >
                  <Download size={13} />
                </button>
                <button
                  className="btn-icon-only"
                  style={{ color: 'var(--color-danger)' }}
                  onClick={() => handleDeleteFile(f.name)}
                  title="삭제"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Kiosk Security PIN Setting */}
      <div className="gd-card set-accent-warn">
        <h4 className="set-h">
          <KeyRound size={18} /> 키오스크 복귀 PIN 설정
        </h4>
        <p className="set-p">
          자율출결 키오스크 모드에서 관리자 화면으로 돌아올 때 사용하는 비밀번호입니다.
          외부에 노출되지 않도록 기본값(1234)에서 변경하여 사용하시길 권장합니다.
          <strong> 현재 설정: {'•'.repeat(kioskPin.length)} ({kioskPin.length}자리)</strong>
        </p>
        <div className="set-pin">
          <input
            type="password"
            inputMode="numeric"
            className="form-control set-pin-in"
            placeholder="새 PIN (4~8자리 숫자)"
            value={pinInput}
            onChange={e => setPinInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSavePin(); }}
          />
          <button className="pay-btn primary" onClick={handleSavePin}>
            PIN 변경하기
          </button>
        </div>
        {pinStatus && (
          <p className="set-success">
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
      <div className="gd-card set-accent">
        <h4 className="set-h">
          <BrainCircuit size={18} /> 아이비 기억 설정
        </h4>
        <p className="set-p">
          아이비가 참고할 <strong>말투·운영 기준·학부모 안내 스타일</strong>을 자유롭게 입력하세요.
          학생 데이터를 저장하는 기능이 아니며, 아이비가 답변·안내문을 작성할 때 일관되게 따를 원칙만 적어두시면 됩니다.
          최대 {MEMORY_MAX.toLocaleString()}자 이내.
        </p>
        {memoryLoading ? (
          <p className="set-muted">불러오는 중...</p>
        ) : (
          <>
            <textarea
              className="set-memo settings-memory-textarea"
              maxLength={MEMORY_MAX}
              value={memoryText}
              onChange={e => setMemoryText(e.target.value)}
              placeholder="예: 미납 안내는 압박하지 않고 확인 요청 형태로 작성한다."
            />
            <div className="set-memo-foot">
              <span className={memoryText.length >= MEMORY_MAX ? 'over' : ''}>
                {memoryText.length.toLocaleString()} / {MEMORY_MAX.toLocaleString()}자
              </span>
              <button
                className="pay-btn primary"
                onClick={() => void handleSaveMemory()}
                disabled={memorySaving}
              >
                {memorySaving ? '저장 중...' : '기억 저장'}
              </button>
            </div>
            {memoryStatus && (
              <div className={memoryStatus.success ? 'set-feedback ok' : 'set-feedback danger'}>
                {memoryStatus.success ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
                {memoryStatus.message}
              </div>
            )}
          </>
        )}
      </div>

      {/* 아이비 자가학습 메모 목록 */}
      <div className="gd-card">
        <h4 className="set-h">
          <BookOpen size={18} /> 아이비가 스스로 학습한 메모
        </h4>
        <p className="set-p">
          대화 중 아이비가 자동으로 저장한 메모입니다. <strong>학원 전반(academy)</strong> 노트는 매번 아이비 답변에 반영되고,
          <strong> 학생별(student)</strong> 노트는 해당 학생 관련 질문 시에만 불러옵니다. 잘못된 내용은 삭제하세요.
        </p>
        {notesLoading ? (
          <p className="set-muted">불러오는 중...</p>
        ) : notes.length === 0 ? (
          <p className="set-empty">
            🌱 아직 아이비가 학습한 메모가 없습니다. 대화를 나눠보세요.
          </p>
        ) : (
          <div className="set-notes scroll">
            {notes.map(note => (
              <div key={note.id} className="set-note">
                <span
                  className={`set-note-scope ${note.scope === 'academy' ? 'academy' : 'student'}`}
                >
                  {note.scope === 'academy' ? '학원' : (note.studentName || '학생')}
                </span>
                <div className="set-note-body">
                  <span className="set-note-cat">
                    [{note.category}]
                  </span>
                  <span>{note.content}</span>
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

      {/* 일일 종합알림장 설정 안내 */}
      <div className="gd-card set-accent-warn">
        <h4 className="set-h">
          <MessageSquare size={18} /> 일일 종합알림장 발송 설정
        </h4>
        <p className="set-p">
          현재 학부모 안내는 알림장 발송 화면에서 선택한 날짜의 출결/과제를 자동으로 모아
          <strong> Aligo `custom` 타입의 일일 종합알림장</strong>으로 발송합니다.
          출결/과제는 기본 포함되고, 보강/보충은 해당 날짜 기록이 있을 때 선생님이 선택해 포함합니다.
        </p>
        <div className="set-notice-grid">
          <div>
            <span>필수 Secret</span>
            <b>ALIGO_TPL_CUSTOM</b>
          </div>
          <div>
            <span>템플릿명</span>
            <b>일일 종합알림장</b>
          </div>
          <div>
            <span>발송 화면</span>
            <b>알림장 발송</b>
          </div>
        </div>
        <div className="set-template-preview">
          <span>[그로잉영어]</span>
          <span>{'{학생명}'} 학생의 {'{날짜}'} 일일 종합알림장입니다.</span>
          <span>출결 / 등원·하원 / 과제 / 보강·보충</span>
        </div>
      </div>

      {/* Danger Zone Reset Data */}
      <div className="gd-card set-danger">
        <h4 className="set-h danger">
          <AlertTriangle size={18} /> 위험 영역 (초기화)
        </h4>
        <div className="set-danger-row">
          <p>
            이 계정의 모든 학원 데이터(학생/반/출결/수납/상담)를 한 번에 비울 수 있습니다.
            <b> 주의: 클라우드의 실제 데이터가 모두 영구 삭제되므로 필요시 꼭 백업 파일을 먼저 받으세요.</b>
          </p>
          <button
            className="set-danger-btn"
            onClick={handleResetClick}
          >
            전체 데이터 삭제
          </button>
        </div>
      </div>
    </div>
  );
};
