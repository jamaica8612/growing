import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const attendanceSource = readFileSync(
  new URL('../src/components/Attendance.tsx', import.meta.url),
  'utf8',
);

describe('출결 보강 날짜 입력', () => {
  it('보강을 먼저 하는 예정 결석도 연결할 수 있도록 결석일 상한을 두지 않는다', () => {
    expect(attendanceSource).not.toContain('max={selectedDate}');
  });
});
