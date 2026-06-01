// 결제선생 발송수납내역 Excel 파일 파서
// 컬럼 순서: 발송일시 이름 전화번호 금액(원) 품목 안내메시지 발송인 재발송횟수
//            수납상태 결제수단 카드 결제일시 승인번호 취소일시 취소승인번호 파기일시 파기사유
import * as XLSX from 'xlsx';
import type { PaymentMethod } from '../types';

export interface PayssamRow {
  name: string;
  month: string;          // YYYY-MM
  amount: number;
  isPaid: boolean;
  paymentDate: string;    // YYYY-MM-DD or ''
  paymentMethod: PaymentMethod;
  item: string;           // 품목 원문 (UI 표시용)
  rawStatus: string;      // 수납상태 원문
}

export interface PayssamParseResult {
  rows: PayssamRow[];
  skippedVoid: number;    // 파기(현장납부 아닌) 건너뛴 수
  errors: string[];
}

// "5월 교습비", "4월&5월 교습비" 등에서 청구월 추출.
// 여러 월이 있으면 가장 큰 값(최근 월) 사용.
function extractMonth(item: string, sendDt: string): string {
  const nums: number[] = [];
  for (const m of item.matchAll(/(\d{1,2})월/g)) nums.push(parseInt(m[1], 10));
  const mon = nums.length > 0 ? Math.max(...nums) : null;
  const year = sendDt.length >= 4 ? sendDt.substring(0, 4) : String(new Date().getFullYear());
  if (mon) return `${year}-${String(mon).padStart(2, '0')}`;
  if (sendDt.length >= 7) return sendDt.substring(0, 7);
  return '';
}

function extractDate(dt: unknown): string {
  if (!dt || typeof dt !== 'string') return '';
  const s = dt.trim();
  return s.length >= 10 ? s.substring(0, 10) : '';
}

function mapMethod(status: string, voidReason: string | null): PaymentMethod {
  if (status === '수납') return 'card';
  if (status === '파기' && voidReason === '현장납부') return 'cash';
  return '';
}

export function parsePayssamExcel(buffer: ArrayBuffer): PayssamParseResult {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames.includes('발송수납내역')
    ? '발송수납내역'
    : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  const data = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
    header: 1,
    defval: null,
    raw: false, // keep dates as strings
  });

  if (data.length < 2) return { rows: [], skippedVoid: 0, errors: ['파일이 비어있습니다.'] };

  const header = data[0] as string[];
  const required = ['발송일시', '이름', '금액(원)', '품목', '수납상태'];
  const missing = required.filter(c => !header.includes(c));
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

  for (let i = 1; i < data.length; i++) {
    const r = data[i] as (string | number | null)[];
    const name = String(r[1] ?? '').trim();
    if (!name) continue;

    const sendDt = String(r[0] ?? '');
    const amount = Number(r[3] ?? 0);
    const item = String(r[4] ?? '');
    const status = String(r[8] ?? '');
    const payDt = extractDate(r[11]);
    const voidDt = extractDate(r[15]);
    const voidReason = r[16] ? String(r[16]).trim() : null;

    const isHyunjang = status === '파기' && voidReason === '현장납부';

    if (status === '파기' && !isHyunjang) {
      skippedVoid++;
      continue;
    }

    const month = extractMonth(item, sendDt);
    if (!month) {
      errors.push(`${i + 1}행 (${name}): 청구월을 파악할 수 없습니다.`);
      continue;
    }

    const isPaid = status === '수납' || isHyunjang;
    const paymentDate = status === '수납' ? payDt : isHyunjang ? voidDt : '';

    rows.push({
      name,
      month,
      amount,
      isPaid,
      paymentDate,
      paymentMethod: mapMethod(status, voidReason),
      item,
      rawStatus: status === '파기' ? '현장납부' : '카드수납',
    });
  }

  return { rows, skippedVoid, errors };
}
