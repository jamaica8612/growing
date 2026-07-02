import { describe, expect, it } from 'vitest';
import { Workbook } from 'exceljs';
import { parsePayssamExcel } from '../src/lib/payssam';

const HEADER = ['발송일시', '이름', '금액(원)', '품목', '수납상태', '결제일시', '파기일시', '파기사유'];

async function buildXlsx(rows: (string | number | Date | null)[][], sheetName = '발송수납내역'): Promise<ArrayBuffer> {
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  rows.forEach(row => worksheet.addRow(row));
  return await workbook.xlsx.writeBuffer() as ArrayBuffer;
}

describe('parsePayssamExcel', () => {
  it('수납 행을 카드 결제로 파싱한다', async () => {
    const buffer = await buildXlsx([
      HEADER,
      ['2026-06-01 10:00:00', '김테스트', '150,000', '6월 수강료', '수납', '2026-06-03 11:22:33', null, null],
    ]);
    const result = await parsePayssamExcel(buffer);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      name: '김테스트',
      month: '2026-06',
      amount: 150000,
      isPaid: true,
      paymentDate: '2026-06-03',
      paymentMethod: 'card',
      rawStatus: '수납',
    });
  });

  it('파기+현장수납은 현금 수납으로, 그 외 파기는 건너뛴다', async () => {
    const buffer = await buildXlsx([
      HEADER,
      ['2026-06-01 10:00:00', '이현장', 200000, '6월 수강료', '파기', null, '2026-06-05 09:00:00', '현장수납'],
      ['2026-06-01 10:00:00', '박취소', 200000, '6월 수강료', '파기', null, '2026-06-05 09:00:00', '중복발송'],
    ]);
    const result = await parsePayssamExcel(buffer);
    expect(result.skippedVoid).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      name: '이현장',
      isPaid: true,
      paymentDate: '2026-06-05',
      paymentMethod: 'cash',
      rawStatus: '현장수납',
    });
  });

  it('날짜 셀(Date 타입)도 YYYY-MM-DD로 읽는다', async () => {
    const buffer = await buildXlsx([
      HEADER,
      [new Date(Date.UTC(2026, 5, 1, 10, 0, 0)), '김날짜', 100000, '6월 수강료', '수납', new Date(Date.UTC(2026, 5, 3, 11, 0, 0)), null, null],
    ]);
    const result = await parsePayssamExcel(buffer);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].month).toBe('2026-06');
    expect(result.rows[0].paymentDate).toBe('2026-06-03');
  });

  it('미수납 행은 isPaid=false로 남는다', async () => {
    const buffer = await buildXlsx([
      HEADER,
      ['2026-06-01 10:00:00', '최미납', 150000, '6월 수강료', '미수납', null, null, null],
    ]);
    const result = await parsePayssamExcel(buffer);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ isPaid: false, paymentDate: '', paymentMethod: '', rawStatus: '미수납' });
  });

  it('필수 컬럼이 없으면 형식 오류를 반환한다', async () => {
    const buffer = await buildXlsx([
      ['이름', '금액(원)'],
      ['김테스트', 100000],
    ]);
    const result = await parsePayssamExcel(buffer);
    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toContain('결제선생 형식이 아닙니다');
    expect(result.errors[0]).toContain('발송일시');
  });

  it('청구월을 알 수 없는 행은 행 번호와 함께 오류로 보고한다', async () => {
    const buffer = await buildXlsx([
      HEADER,
      ['', '오월없', 100000, '수강료', '수납', null, null, null],
    ]);
    const result = await parsePayssamExcel(buffer);
    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toContain('2행(오월없)');
  });

  it('발송수납내역 시트가 없으면 첫 시트를 사용한다', async () => {
    const buffer = await buildXlsx([
      HEADER,
      ['2026-06-01 10:00:00', '김시트', '90,000', '6월 교재비', '수납', '2026-06-02 10:00:00', null, null],
    ], 'Sheet1');
    const result = await parsePayssamExcel(buffer);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('김시트');
  });
});
