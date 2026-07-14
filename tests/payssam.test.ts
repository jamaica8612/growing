import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parsePayssamExcel } from '../src/lib/payssam';

function workbookBuffer(rows: unknown[][]): ArrayBuffer {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '발송수납내역');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
}

describe('결제선생 엑셀 가져오기', () => {
  it('SheetJS 보안 업데이트 후에도 기존 수납 파일을 동일하게 해석한다', () => {
    const buffer = workbookBuffer([
      ['발송일시', '이름', '금액(원)', '품목', '수납상태', '결제일시', '파기일시', '파기사유'],
      ['2026-07-01 10:00', '김연아', '120,000', '7월 수강료', '수납', '2026-07-02 11:30', '', ''],
      ['2026-07-01 10:00', '박학생', '100,000', '7월 수강료', '파기', '', '2026-07-03 09:00', '현장수납'],
      ['2026-07-01 10:00', '취소학생', '90,000', '7월 수강료', '파기', '', '2026-07-03 09:00', '결제취소'],
    ]);

    expect(parsePayssamExcel(buffer)).toEqual({
      rows: [
        {
          name: '김연아',
          month: '2026-07',
          amount: 120_000,
          isPaid: true,
          paymentDate: '2026-07-02',
          paymentMethod: 'card',
          item: '7월 수강료',
          rawStatus: '수납',
        },
        {
          name: '박학생',
          month: '2026-07',
          amount: 100_000,
          isPaid: true,
          paymentDate: '2026-07-03',
          paymentMethod: 'cash',
          item: '7월 수강료',
          rawStatus: '현장수납',
        },
      ],
      skippedVoid: 1,
      errors: [],
    });
  });

  it('필수 열이 없는 파일은 가져오지 않는다', () => {
    const result = parsePayssamExcel(workbookBuffer([
      ['이름', '금액(원)'],
      ['김연아', 120_000],
    ]));

    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toContain('누락된 컬럼');
  });
});
