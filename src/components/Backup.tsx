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
  const [settingsTab, setSettingsTab] = useState<'data' | 'files' | 'kiosk' | 'ai' | 'manual'>('data');

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

      <div className="ka-tabs" role="tablist" aria-label="설정 분류">
        {([
          ['data', '데이터 관리'],
          ['files', '파일·백업'],
          ['kiosk', '키오스크'],
          ['ai', '알림·AI'],
          ['manual', '사용 매뉴얼'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={settingsTab === key}
            className={`ka-tab${settingsTab === key ? ' on' : ''}`}
            onClick={() => setSettingsTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {settingsTab === 'data' && (
        <>
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
        </>
      )}

      {settingsTab === 'files' && (
      <>
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
      </>
      )}

      {settingsTab === 'kiosk' && (
      <>
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
      </>
      )}

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

      {settingsTab === 'ai' && (
      <>
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
        <textarea
          className="set-memo"
          readOnly
          style={{ minHeight: 90, fontSize: '0.83rem' }}
          value={`[그로잉영어] {학생명} 학생의 {날짜} 일일 종합알림장입니다.\n\n출결: {출결상태} / 등원 {등원시간} · 하원 {하원시간}\n과제: {숙제상태}\n보강·보충: {보강}`}
        />
      </div>
      </>
      )}

      {settingsTab === 'manual' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="gd-card">
            <h4 className="set-h"><BookOpen size={18} /> 그로잉영어 사용 매뉴얼</h4>
            <p className="set-p">주요 기능별 사용 방법을 안내합니다.</p>
          </div>

          <div className="gd-card">
            <h4 className="set-h">1. 학생 관리</h4>
            <div className="manual-section">
              <p className="set-p"><b>학생 추가</b> — 학생 탭 → 학생 추가 버튼 → 이름·학년·학교·학부모 연락처 입력 후 저장</p>
              <p className="set-p"><b>상태 변경</b> — 학생 카드의 상태 버튼으로 <span className="manual-pill active">재원</span> / <span className="manual-pill paused">휴원</span> / <span className="manual-pill inactive">퇴원</span> 전환</p>
              <p className="set-p"><b>학생 삭제</b> — 학생 상세 화면 하단의 삭제 버튼 (삭제 시 관련 출결·수납 기록도 함께 삭제됩니다)</p>
            </div>
          </div>

          <div className="gd-card">
            <h4 className="set-h">2. 반 관리</h4>
            <div className="manual-section">
              <p className="set-p"><b>반 만들기</b> — 반 탭 → 반 추가 → 반 이름·수업 요일·시간 설정</p>
              <p className="set-p"><b>학생 배정</b> — 반 상세 → 학생 추가 버튼으로 재원 중인 학생을 반에 배정</p>
              <p className="set-p">한 학생이 여러 반에 동시에 속할 수 있습니다. 각 반별로 독립적인 출결이 기록됩니다.</p>
            </div>
          </div>

          <div className="gd-card">
            <h4 className="set-h">3. 출결 기록</h4>
            <div className="manual-section">
              <p className="set-p"><b>날짜 선택</b> — 출결 탭 상단 날짜 버튼 또는 화살표로 날짜 이동</p>
              <p className="set-p"><b>출결 상태</b></p>
              <ul className="manual-list">
                <li><span className="manual-pill present">출석</span> — 정상 출석. 처음 클릭 시 현재 시각이 등원 시간으로 자동 기록됩니다.</li>
                <li><span className="manual-pill absent">결석</span> — 결석 처리. 등·하원 시간이 초기화되고 보강 필요 목록에 추가됩니다.</li>
                <li><span className="manual-pill makeup">보강</span> — 이전 결석분을 보강한 날. 보강 탭에서 원래 결석일과 연결할 수 있습니다.</li>
                <li><span className="manual-pill supplement">보충</span> — 정규 수업 외 추가 수업.</li>
                <li><span className="manual-pill late">지각</span> — 지각 처리.</li>
              </ul>
              <p className="set-p"><b>숙제 상태</b> — 출결 상태 아래 숙제 완료·미흡·미제출 버튼으로 기록</p>
              <p className="set-p"><b>등·하원 시간</b> — 출석 첫 클릭 시 자동 입력, 수동 수정도 가능</p>
              <p className="set-p"><b>메모</b> — 학생별 수업 메모 입력 가능 (저장 버튼 필요)</p>
            </div>
          </div>

          <div className="gd-card">
            <h4 className="set-h">4. 보강·보충 관리</h4>
            <div className="manual-section">
              <p className="set-p"><b>보강 처리</b> — 보강 탭 → 보강 필요 목록에서 해당 학생의 보강 처리 버튼 클릭 → 보강 날짜·반 선택 후 저장</p>
              <p className="set-p">추천 보강 후보가 자동으로 표시됩니다 (학생 수업 스케줄 기반).</p>
              <p className="set-p"><b>보충 기록</b> — 보강 탭 → 보충관리 전환 → 날짜·학생·반·분량 입력 후 저장</p>
              <p className="set-p">결석 처리 시 자동으로 보강 필요 목록에 추가되고, 보강이 완료되면 목록에서 제거됩니다.</p>
            </div>
          </div>

          <div className="gd-card">
            <h4 className="set-h">5. 수납 관리</h4>
            <div className="manual-section">
              <p className="set-p"><b>청구 추가</b> — 수납 탭 → 수납 추가 → 학생·청구월·금액 입력</p>
              <p className="set-p"><b>납부 처리</b> — 미납 항목에서 납부 완료 버튼 → 납부일·납부 방법 선택</p>
              <p className="set-p"><b>월별 일괄 청구</b> — 수납 탭 상단에서 청구월 선택 후 학생 전체 일괄 추가 가능</p>
            </div>
          </div>

          <div className="gd-card">
            <h4 className="set-h">6. 키오스크 (자율 출결)</h4>
            <div className="manual-section">
              <p className="set-p"><b>키오스크 모드 진입</b> — 대시보드 또는 출결 탭의 키오스크 버튼 클릭</p>
              <p className="set-p"><b>반 선택</b> — 키오스크 화면 상단 칩으로 반을 선택하면 해당 반 학생만 표시</p>
              <p className="set-p"><b>학생 출결</b> — 학생 카드를 한 번 탭하면 등원 처리, 두 번 탭하면 하원 처리</p>
              <p className="set-p"><b>관리자 화면으로 복귀</b> — 화면 하단의 잠금 해제 버튼 → 설정에서 지정한 PIN 입력</p>
              <p className="set-p">키오스크 복귀 PIN은 설정 → 키오스크 탭에서 변경할 수 있습니다 (기본값: 1234).</p>
            </div>
          </div>

          <div className="gd-card">
            <h4 className="set-h">7. 알림장 발송</h4>
            <div className="manual-section">
              <p className="set-p"><b>알림장 탭</b> — 날짜 선택 → 발송할 학생 선택 → 출결·과제·보강 포함 여부 체크 → 미리보기 확인 → 발송</p>
              <p className="set-p">당일 출결·과제 정보가 자동으로 채워집니다. 보강/보충이 있는 날에는 포함 여부를 선택할 수 있습니다.</p>
            </div>
          </div>

          <div className="gd-card">
            <h4 className="set-h">8. AI 아이비</h4>
            <div className="manual-section">
              <p className="set-p"><b>아이비 탭</b> — 학원 데이터를 기반으로 질문에 답하거나 학부모 안내문을 작성해 줍니다.</p>
              <p className="set-p">예: "이번 달 미납 학생 알려줘", "김민준 이번주 출결 어때?", "보강 필요한 학생 정리해줘"</p>
              <p className="set-p"><b>아이비 기억 설정</b> — 설정 → 알림·AI 탭에서 아이비가 참고할 말투·운영 기준 등록 가능</p>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone Reset Data */}
      {settingsTab === 'data' && (
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
      )}
    </div>
  );
};
