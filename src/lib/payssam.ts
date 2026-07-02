import type { Cell, CellValue, Row } from 'exceljs';
import type { PaymentMethod } from '../types';

export interface PayssamRow {
  name: string;
  month: string; // YYYY-MM
  amount: number;
  isPaid: boolean;
  paymentDate: string; // YYYY-MM-DD or ''
  paymentMethod: PaymentMethod;
  item: string;
  rawStatus: string;
}

export interface PayssamParseResult {
  rows: PayssamRow[];
  skippedVoid: number;
  errors: string[];
}

function extractMonth(item: string, sendDt: string): string {
  const months = Array.from(item.matchAll(/(\d{1,2})\s*월/g))
    .map(match => Number(match[1]))
    .filter(month => month >= 1 && month <= 12);
  const month = months.length > 0 ? Math.max(...months) : null;
  const year = sendDt.length >= 4 ? sendDt.substring(0, 4) : String(new Date().getFullYear());
  if (month) return `${year}-${String(month).padStart(2, '0')}`;
  if (sendDt.length >= 7) return sendDt.substring(0, 7);
  return '';
}

function extractDate(value: string): string {
  const text = value.trim();
  return text.length >= 10 ? text.substring(0, 10) : '';
}

function mapMethod(status: string, voidReason: string | null): PaymentMethod {
  if (status === '수납') return 'card';
  if (status === '파기' && voidReason === '현장수납') return 'cash';
  return '';
}

// exceljs 셀 값을 표시용 텍스트로 변환. Excel 날짜 셀은 UTC Date로 파싱되므로
// toISOString 기준으로 'YYYY-MM-DD HH:mm:ss' 형태를 만든다.
function cellText(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().replace('T', ' ').substring(0, 19);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map(part => part.text).join('').trim();
    if ('result' in value) return cellText(value.result as CellValue);
    if ('text' in value) return String(value.text).trim();
    if ('error' in value) return '';
    return '';
  }
  return String(value).trim();
}

function getCell(row: Row, headerMap: Map<string, number>, column: string): string {
  const index = headerMap.get(column);
  if (index === undefined) return '';
  return cellText(row.getCell(index).value);
}

export async function parsePayssamExcel(buffer: ArrayBuffer): Promise<PayssamParseResult> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.getWorksheet('발송수납내역') ?? workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 2) return { rows: [], skippedVoid: 0, errors: ['파일이 비어 있습니다.'] };

  const headerMap = new Map<string, number>();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell: Cell, colNumber: number) => {
    const label = cellText(cell.value);
    if (label && !headerMap.has(label)) headerMap.set(label, colNumber);
  });

  const required = ['발송일시', '이름', '금액(원)', '품목', '수납상태'];
  const missing = required.filter(column => !headerMap.has(column));
  if (missing.length > 0) {
    return {
      rows: [],
      skippedVoid: 0,
      errors: [`결제선생 형식이 아닙니다. 누락된 컬럼: ${missing.join(', ')}`],
    };
  }

  const rows: PayssamRow[] = [];
  let skippedVoid = 0;
  const errors: string[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row: Row, rowNumber: number) => {
    if (rowNumber === 1) return;
    const name = getCell(row, headerMap, '이름');
    if (!name) return;

    const sendDt = getCell(row, headerMap, '발송일시');
    const amount = Number(getCell(row, headerMap, '금액(원)').replaceAll(',', '')) || 0;
    const item = getCell(row, headerMap, '품목');
    const status = getCell(row, headerMap, '수납상태');
    const payDt = extractDate(getCell(row, headerMap, '결제일시'));
    const voidDt = extractDate(getCell(row, headerMap, '파기일시'));
    const voidReason = getCell(row, headerMap, '파기사유') || null;
    const isCashPaid = status === '파기' && voidReason === '현장수납';

    if (status === '파기' && !isCashPaid) {
      skippedVoid += 1;
      return;
    }

    const month = extractMonth(item, sendDt);
    if (!month) {
      errors.push(`${rowNumber}행(${name}): 청구월을 파악할 수 없습니다.`);
      return;
    }

    const isPaid = status === '수납' || isCashPaid;
    const paymentDate = status === '수납' ? payDt : isCashPaid ? voidDt : '';

    rows.push({
      name,
      month,
      amount,
      isPaid,
      paymentDate,
      paymentMethod: mapMethod(status, voidReason),
      item,
      rawStatus: isCashPaid ? '현장수납' : status || '미수납',
    });
  });

  return { rows, skippedVoid, errors };
}
