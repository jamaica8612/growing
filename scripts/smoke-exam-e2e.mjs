import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRef = 'xrrdokcjhjqdfvwtbenl';
const ownerId = '0f7a58e2-9dc3-4f16-af78-6fee6fa62ac8';
let created = null;

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function parseCliJson(value) {
  const clean = stripAnsi(value);
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`No JSON payload in CLI output: ${clean.slice(0, 200)}`);
  return JSON.parse(clean.slice(start, end + 1));
}

function runSupabase(args) {
  const result = process.platform === 'win32'
    ? spawnSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `& ${['npx', 'supabase', ...args].map(arg => `'${String(arg).replaceAll("'", "''")}'`).join(' ')}`,
    ], {
      encoding: 'utf8',
      windowsHide: true,
    })
    : spawnSync('npx', ['supabase', ...args], {
      encoding: 'utf8',
      windowsHide: true,
    });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status !== 0) throw new Error(output.trim() || result.error?.message || `supabase exited with status ${result.status}`);
  return parseCliJson(output);
}

function dbQuery(sql) {
  const file = join(tmpdir(), `growing-exam-e2e-${process.pid}-${Date.now()}.sql`);
  writeFileSync(file, sql, 'utf8');
  try {
    return runSupabase(['db', 'query', '--linked', '--file', file]).rows ?? [];
  } finally {
    try {
      unlinkSync(file);
    } catch {
      // ignore temp-file cleanup failures
    }
  }
}

function readEnv(name) {
  const line = readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .find(item => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^"|"$/g, '') ?? '';
}

async function callPublic(body) {
  const supabaseUrl = readEnv('VITE_SUPABASE_URL');
  const publishableKey = readEnv('VITE_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !publishableKey) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.');
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

function q(value) {
  return String(value).replaceAll("'", "''");
}

function setupSql() {
  return `
with seed as (
  select
    '${ownerId}'::uuid as owner_id,
    gen_random_uuid() as student_id,
    gen_random_uuid() as class_id,
    gen_random_uuid() as exam_id,
    upper(substr(md5(random()::text), 1, 6)) as code
),
student_row as (
  insert into public.growing_students (
    id, owner_id, name, school, grade, contact, parent_contact, registration_date, status, memo
  )
  select student_id, owner_id, 'CodexE2E 학생 ' || code, '', '테스트', '', '', current_date, 'active', 'CodexE2E cleanup'
  from seed
  returning id
),
class_row as (
  insert into public.growing_classes (
    id, owner_id, name, days, start_time, end_time, tuition_fee, student_ids
  )
  select class_id, owner_id, 'CodexE2E 반 ' || code, '{}'::text[], '', '', 0, array[student_id]::uuid[]
  from seed
  returning id
),
exam_row as (
  insert into public.growing_exams (
    id, owner_id, class_id, title, target_label, topic, date, difficulty, status, short_code
  )
  select exam_id, owner_id, class_id, 'CodexE2E 온라인 시험 ' || code, 'CodexE2E', '공개 제출 스모크', current_date, 'normal', 'published', code
  from seed
  returning id, short_code
),
question_row as (
  insert into public.growing_exam_questions (
    owner_id, exam_id, order_no, type, points, source, prompt, passage, choices, answer, explanation
  )
  select owner_id, exam_id, 1, 'vocab', 10, 'CodexE2E', '정답 보기를 고르세요.', '', '["오답","정답"]'::jsonb, '1'::jsonb, '정답은 2번입니다.'
  from seed
  returning id
)
select
  seed.owner_id,
  seed.student_id,
  seed.class_id,
  seed.exam_id,
  exam_row.short_code,
  question_row.id as question_id
from seed, exam_row, question_row;`;
}

function cleanupSql(target) {
  return `
delete from public.growing_counsel_logs
where student_id = '${q(target.student_id)}'::uuid
   or title like 'CodexE2E 온라인 시험%';

delete from public.growing_exams
where id = '${q(target.exam_id)}'::uuid
   or title like 'CodexE2E 온라인 시험%';

delete from public.growing_classes
where id = '${q(target.class_id)}'::uuid
   or name like 'CodexE2E 반 %';

delete from public.growing_students
where id = '${q(target.student_id)}'::uuid
   or memo = 'CodexE2E cleanup'
   or name like 'CodexE2E 학생 %';`;
}

try {
  const setupRows = dbQuery(setupSql());
  created = setupRows[0];
  if (!created?.short_code || !created?.student_id || !created?.question_id) {
    throw new Error('Failed to create E2E fixture.');
  }

  const exam = await callPublic({ action: 'get_exam', code: created.short_code });
  if (exam.status !== 200) throw new Error(`get_exam failed: ${exam.status}`);
  if (!Array.isArray(exam.payload.students) || exam.payload.students.length !== 1) {
    throw new Error('get_exam did not return the temporary roster.');
  }

  const submit = await callPublic({
    action: 'submit',
    code: created.short_code,
    studentId: created.student_id,
    answers: { [created.question_id]: 1 },
  });
  if (submit.status !== 200 || submit.payload.score !== 10 || submit.payload.total !== 10) {
    throw new Error(`submit failed: ${submit.status}`);
  }

  const submissionRows = dbQuery(`
select id, score, total_points
from public.growing_exam_submissions
where exam_id = '${q(created.exam_id)}'::uuid
  and student_id = '${q(created.student_id)}'::uuid
limit 1;`);
  const submission = submissionRows[0];
  if (!submission?.id || submission.score !== 10 || submission.total_points !== 10) {
    throw new Error('teacher submission query did not see the public submission.');
  }

  const token = `codexe2e${Date.now()}`;
  dbQuery(`
insert into public.growing_exam_result_links (owner_id, exam_id, submission_id, token)
values ('${q(created.owner_id)}'::uuid, '${q(created.exam_id)}'::uuid, '${q(submission.id)}'::uuid, '${token}');`);

  const result = await callPublic({ action: 'get_result', token });
  if (result.status !== 200 || result.payload.submission?.score !== 10) {
    throw new Error(`get_result failed: ${result.status}`);
  }

  console.log('exam-e2e:ok');
} finally {
  if (created) dbQuery(cleanupSql(created));
}
