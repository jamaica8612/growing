import { readFileSync } from 'node:fs';

function readEnv(name) {
  const line = readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .find(item => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^"|"$/g, '') ?? '';
}

const supabaseUrl = readEnv('VITE_SUPABASE_URL');
const publishableKey = readEnv('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl || !publishableKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.');
}

async function call(body) {
  const response = await fetch(`${supabaseUrl}/functions/v1/exam-public`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${publishableKey}`,
      apikey: publishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

const examResult = await call({ action: 'get_exam', code: 'NOEXAM' });
if (examResult.status === 401) throw new Error('exam-public returned 401 for public exam lookup.');
if (examResult.status !== 404 || !String(examResult.payload.error ?? '').includes('시험')) {
  throw new Error(`unexpected get_exam response: ${examResult.status}`);
}

const resultLink = await call({ action: 'get_result', token: 'not-a-real-token' });
if (resultLink.status === 401) throw new Error('exam-public returned 401 for public result lookup.');
if (resultLink.status !== 404 || !String(resultLink.payload.error ?? '').includes('결과')) {
  throw new Error(`unexpected get_result response: ${resultLink.status}`);
}

console.log('exam-public:ok');
