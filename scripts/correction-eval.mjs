// 해석·영작 AI 첨삭 품질 점검.
// 앱(correction-public)과 같은 프롬프트·파서로 예시 답안을 채점해 보여 준다.
//
//   OpenAI API (실제 앱과 같은 모델):
//     GROWING_OPENAI_API_KEY=sk-... node --experimental-strip-types scripts/correction-eval.mjs
//   Codex CLI (codex에 설정된 모델로):
//     node --experimental-strip-types scripts/correction-eval.mjs --codex
//
// 모델은 GROWING_OPENAI_MODEL로 바꿀 수 있다(기본 gpt-6-luna).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildGradePrompt, parseGradeResult, summarize } from '../supabase/functions/correction-public/logic.ts';

const CASES = [
  {
    name: '해석 — 중학생 수준',
    mode: 'translate',
    sentences: [
      'Tom went to the park with his dog yesterday.',
      'She has lived in Seoul since she was ten.',
      'If it rains tomorrow, we will stay home.',
      'The book that I borrowed from the library was interesting.',
      'He was too tired to finish his homework.',
      'I am looking forward to seeing you again.',
    ],
    answers: [
      '톰은 어제 그의 개와 함께 공원에 갔다.', // 정답
      '그녀는 열 살 때 서울에 살았다.', // 현재완료 계속 의미 누락
      '내일 비가 오면 우리는 집에 있을 것이다.', // 정답
      '나는 도서관에서 책을 빌렸다.', // 관계절 구조 놓침, '흥미로웠다' 누락
      '그는 너무 피곤해서 숙제를 끝냈다.', // too~to 의미 반대
      '', // 빈칸
    ],
  },
  {
    name: '영작 — 중학생 수준',
    mode: 'compose',
    sentences: [
      '나는 매일 아침 7시에 일어난다.',
      '그는 어제 친구들과 축구를 했다.',
      '이 가방은 저 가방보다 더 무겁다.',
      '나는 영어를 공부하기 위해 도서관에 갔다.',
      '그녀는 피아노를 칠 수 있니?',
      '우리는 3년 동안 서로 알고 지냈다.',
    ],
    answers: [
      'I get up at 7 every morning.', // 정답
      'He play soccer with his friends yesterday.', // 시제 오류
      'This bag is heavyer than that bag.', // 비교급 철자
      'I went to library for study English.', // 관사·to부정사 오류
      'asdf qwer', // 무의미
      'We know each other for three years.', // 현재완료 필요
    ],
  },
];

function codexRespond(prompt) {
  const dir = mkdtempSync(join(tmpdir(), 'correction-eval-'));
  const out = join(dir, 'last.txt');
  try {
    execFileSync('codex', ['exec', '--skip-git-repo-check', '--output-last-message', out, prompt], {
      stdio: ['ignore', 'ignore', 'inherit'],
      maxBuffer: 10 * 1024 * 1024,
    });
    return readFileSync(out, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function openAIRespond(prompt) {
  const apiKey = process.env.GROWING_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('GROWING_OPENAI_API_KEY(또는 OPENAI_API_KEY)를 설정하거나 --codex로 실행하세요.');
  const model = process.env.GROWING_OPENAI_MODEL || 'gpt-6-luna';
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: prompt,
      store: false,
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_object' } },
      max_output_tokens: 12_000,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data.output ?? [])
    .filter(item => item.type === 'message')
    .flatMap(item => item.content ?? [])
    .filter(part => part.type === 'output_text')
    .map(part => part.text)
    .join('\n');
}

const useCodex = process.argv.includes('--codex');
console.log(useCodex ? '모드: Codex CLI' : `모드: OpenAI API (${process.env.GROWING_OPENAI_MODEL || 'gpt-6-luna'})`);

for (const testCase of CASES) {
  const prompt = buildGradePrompt(testCase.mode, testCase.sentences, testCase.answers);
  const started = Date.now();
  const text = useCodex ? codexRespond(prompt) : await openAIRespond(prompt);
  const items = parseGradeResult(text, testCase.answers);
  const scores = summarize(items);
  console.log(`\n==== ${testCase.name} (${((Date.now() - started) / 1000).toFixed(1)}초) — 완성도 ${scores.completeness}% · 정확도 ${scores.accuracy}%`);
  testCase.sentences.forEach((sentence, index) => {
    const item = items[index];
    console.log(`\n${index + 1}. ${sentence}`);
    console.log(`   학생: ${item.answer || '(빈칸)'}`);
    console.log(`   첨삭: ${item.corrected}`);
    console.log(`   설명: ${item.explanation}`);
    console.log(`   완성도 ${item.completeness}% · 정확도 ${item.accuracy}%`);
  });
}
