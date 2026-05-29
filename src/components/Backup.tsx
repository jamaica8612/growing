import React, { useRef, useState } from 'react';
import { Download, Upload, AlertTriangle, CheckCircle, KeyRound } from 'lucide-react';
import type { Student, Class, Attendance, Payment, CounselLog } from '../types';

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
  const [importStatus, setImportStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinStatus, setPinStatus] = useState<string | null>(null);

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

        if (window.confirm('기존 브라우저 데이터가 모두 지워지고 백업 파일 데이터로 덮어씌워집니다. 진행하시겠습니까?')) {
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
      } catch (err: any) {
        setImportStatus({
          success: false,
          message: err.message || 'JSON 파일 분석에 실패했습니다. 파일이 손상되었는지 확인하세요.',
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
      window.confirm('경고: 교습소의 모든 데이터가 완전히 초기화되고 기본 샘플 데이터로 리셋됩니다.\n이 작업은 되돌릴 수 없습니다. 진행하시겠습니까?')
    ) {
      if (window.confirm('정말 진행하시겠습니까? (이전 데이터는 모두 삭제됩니다)')) {
        onResetData();
        setImportStatus({
          success: true,
          message: '데이터가 기본 샘플 상태로 리셋되었습니다.',
        });
        setTimeout(() => setImportStatus(null), 4000);
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Introduction Card */}
      <div className="card" style={{ borderLeft: '5px solid var(--color-primary)' }}>
        <h3 className="card-title">🌱 안전한 로컬 저장소 백업 안내</h3>
        <p style={{ fontSize: '0.92rem', color: 'var(--color-text-secondary)', lineHeight: '1.7' }}>
          그로잉영어 교습소 관리 시스템은 **서버 전송이 없는 로컬 브라우저 보안 저장소(`localStorage`)**를 사용하고 있습니다. 
          따라서 입력하신 학생 정보와 수납 내역은 현재 사용 중이신 컴퓨터/브라우저에만 안전하게 저장되며 외부로 유출되지 않습니다.
        </p>
        <p style={{ fontSize: '0.92rem', color: 'var(--color-text-secondary)', lineHeight: '1.7', marginTop: '0.75rem' }}>
          단, 브라우저 캐시를 강제로 청소하거나 다른 컴퓨터에서 접속할 때는 기존 데이터가 보이지 않거나 소실될 수 있습니다. 
          따라서 <strong>매주 또는 매달 한 번씩 데이터를 파일로 다운로드하여 백업하시는 것을 강력히 권장합니다.</strong>
        </p>
      </div>

      {/* Main Operations Grid */}
      <div className="grid-container cols-2">
        
        {/* Export Data */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1.5rem' }}>
          <div>
            <h4 style={{ fontWeight: 700, color: 'var(--color-primary-dark)', fontSize: '1.1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Download size={18} /> 데이터 백업하기 (내보내기)
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              현재 교습소의 학생 명부, 시간표 요일, 출석 이력, 상담일지, 완납/미납 장부 데이터를 하나의 파일로 생성하여 사용자 PC에 다운로드합니다.
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
              컴퓨터에 저장해 둔 그로잉영어 백업 파일(.json)을 업로드하여 데이터를 원래대로 복원합니다. 
              <strong>주의: 현재 브라우저에 등록된 기존 내용이 백업 데이터로 대체됩니다.</strong>
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

      {/* Danger Zone Reset Data */}
      <div className="card" style={{ border: '1px solid #fca5a5', backgroundColor: '#fffbfb' }}>
        <h4 style={{ fontWeight: 700, color: 'var(--color-danger)', fontSize: '1.05rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={18} /> 위험 영역 (초기화)
        </h4>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', maxWidth: '500px' }}>
            프로그램 사용법 학습 및 테스트를 위해 데이터를 초기 샘플 데이터 상태로 재설정할 수 있습니다. 
            <strong>주의: 현재 브라우저의 실제 데이터가 모두 영구 삭제되므로 필요시 꼭 백업 파일을 먼저 받으세요.</strong>
          </p>
          <button
            className="btn btn-danger"
            style={{ backgroundColor: '#fee2e2', color: 'var(--color-danger)', border: '1px solid #fca5a5' }}
            onClick={handleResetClick}
          >
            기본 샘플 데이터로 리셋
          </button>
        </div>
      </div>
    </div>
  );
};
