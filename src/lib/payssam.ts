import * as XLSX from 'xlsx';
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

function extractDate(value: unknown): string {
  if (!value) return '';
  const text = String(value).trim();
  return text.length >= 10 ? text.substring(0, 10) : '';
}

function mapMethod(status: string, voidReason: string | null): PaymentMethod {
  if (status === '수납') return 'card';
  if (status === '파기' && voidReason === '현장수납') return 'cash';
  return '';
}

function getCell(row: (string | number | null)[], headerMap: Map<string, number>, column: string): string {
  const index = headerMap.get(column);
  if (index === undefined) return '';
  return String(row[index] ?? '').trim();
}

export function parsePayssamExcel(buffer: ArrayBuffer): PayssamParseResult {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames.includes('발송수납내역')
    ? '발송수납내역'
    : workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const data = XLSX.utils.sheet_to_json<(string | number | null)[]>(worksheet, {
    header: 1,
    defval: null,
    raw: false,
  });

  if (data.length < 2) return { rows: [], skippedVoid: 0, errors: ['파일이 비어 있습니다.'] };

  const header = (data[0] as (string | number | null)[]).map(cell => String(cell ?? '').trim());
  const headerMap = new Map(header.map((column, index) => [column, index]));
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

  for (let i = 1; i < data.length; i += 1) {
    const row = data[i] as (string | number | null)[];
    const name = getCell(row, headerMap, '이름');
    if (!name) continue;

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
      continue;
    }

    const month = extractMonth(item, sendDt);
    if (!month) {
      errors.push(`${i + 1}행(${name}): 청구월을 파악할 수 없습니다.`);
      continue;
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
  }

  return { rows, skippedVoid, errors };
}
