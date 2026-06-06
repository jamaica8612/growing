import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const QUESTION_TYPES = ['vocab', 'grammar', 'reading', 'writing'] as const;

type QuestionType = typeof QUESTION_TYPES[number];

interface ExamQuestionDraft {
  orderNo: number;
  type: QuestionType;
  points: number;
  source: string;
  prompt: string;
  passage?: string | null;
  choices?: string[] | null;
  answer: number | string;
  explanation: string;
}

interface ChatMessage {
  role: 'teacher' | 'assistant';
  content: string;
}

interface AiResult {
  questions: ExamQuestionDraft[];
  reply?: string;
}

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function stripFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : text.trim();
}

function parseQuestions(text: string): AiResult {
  const raw = stripFence(text);
  const parsed = JSON.parse(raw) as { questions?: ExamQuestionDraft[]; reply?: string } | ExamQuestionDraft[];
  const questions = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(questions)) throw new Error('AI 응답에 questions 배열이 없습니다.');
  const normalized = questions.map((q, index) => {
    const type = QUESTION_TYPES.includes(q.type) ? q.type : 'vocab';
    const choices = type === 'writing' ? null : Array.isArray(q.choices) ? q.choices.map(String).slice(0, 5) : null;
    const rawAnswer = Number(q.answer);
    const answer = choices
      ? Number.isInteger(rawAnswer) && rawAnswer >= 0 && rawAnswer < choices.length ? rawAnswer : 0
      : String(q.answer || '').trim();
    return {
      orderNo: index + 1,
      type,
      points: Number.isFinite(Number(q.points)) ? Math.max(1, Number(q.points)) : type === 'writing' || type === 'reading' ? 15 : 10,
      source: String(q.source || '자료 1 · 텍스트 자료').trim(),
      prompt: String(q.prompt || '').trim(),
      passage: q.passage ? String(q.passage) : null,
      choices,
      answer,
      explanation: String(q.explanation || '').trim(),
    };
  }).filter(q => q.prompt && q.source && String(q.answer).length > 0 && (q.type === 'writing' || (Array.isArray(q.choices) && q.choices.length >= 2)));
  return {
    questions: normalized,
    reply: !Array.isArray(parsed) && typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : undefined,
  };
}

async function callGemini(prompt: string): Promise<AiResult> {
  const apiKey = requiredEnv('GEMINI_API_KEY');
  let lastError: unknown = null;
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationConfig: {
            temperature: 0.35,
            responseMimeType: 'application/json',
          },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? `Gemini ${res.status}`);
      const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('\n') ?? '';
      if (!text.trim()) throw new Error('Gemini 응답이 비어 있습니다.');
      return parseQuestions(text);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AI 출제에 실패했습니다.');
}

function buildPrompt(payload: {
  mode: 'generate' | 'revise';
  materialText: string;
  title: string;
  targetLabel: string;
  topic: string;
  difficulty: string;
  count: number;
  types: QuestionType[];
  instruction?: string;
  questions?: ExamQuestionDraft[];
  chatHistory?: ChatMessage[];
}) {
  const count = Math.max(1, Math.min(Number(payload.count) || 8, 16));
  const types = payload.types.length ? payload.types : QUESTION_TYPES;
  const chat = (payload.chatHistory ?? [])
    .slice(-12)
    .map(message => `${message.role === 'teacher' ? 'Teacher' : 'AI'}: ${message.content}`)
    .join('\n') || 'No prior conversation.';
  return `
You are an English academy exam writer for Korean middle-school students.
Return ONLY valid JSON in this shape:
{
  "reply": "Korean one-sentence reply to the teacher about what you changed",
  "questions": [
    {
      "orderNo": 1,
      "type": "vocab" | "grammar" | "reading" | "writing",
      "points": 10,
      "source": "자료 1 · exact sentence/paragraph reference",
      "prompt": "Korean exam question text",
      "passage": "optional passage for reading questions or null",
      "choices": ["choice1", "choice2", "choice3", "choice4"] or null,
      "answer": 0 for multiple choice OR "model answer" for writing,
      "explanation": "Korean explanation"
    }
  ]
}

Rules:
- Use ONLY the provided material. Do not invent facts, names, grammar points, or vocabulary that are not grounded in the material.
- Follow the teacher instruction flexibly unless it conflicts with the material-only rule, JSON schema, or requested question count/types.
- Treat this as an ongoing teacher-AI conversation. Use the recent conversation for references like "아까", "그 수준", "방금", or "3번만". The latest teacher instruction has priority.
- Every question MUST include a concrete Korean source label in "source".
- Multiple-choice answers use 0-based index.
- Writing questions must use choices: null and answer: a model answer string.
- Make questions look like real Korean English academy test questions.
- Keep explanations concise and useful for teacher review.
- The "reply" must be short, conversational Korean. Mention the main edit and invite the teacher to continue. Do not include any extra text outside JSON.
- You may use Markdown emphasis like **important expression** in prompt, passage, choices, answer, or explanation when the teacher asks for emphasis or when it improves readability. Do not use HTML.
- Difficulty: ${payload.difficulty}
- Target: ${payload.targetLabel}
- Topic: ${payload.topic || payload.title}
- Desired question count: ${count}
- Desired types: ${types.join(', ')}

${payload.mode === 'revise' ? `
Current draft questions:
${JSON.stringify(payload.questions ?? [], null, 2)}

Recent teacher-AI conversation:
${chat}

Teacher chat instruction:
${payload.instruction ?? ''}

Revise the full draft according to the instruction. Preserve good existing questions unless the instruction says otherwise.
` : `
Create a new draft from the material.
Teacher generation instruction:
${payload.instruction?.trim() || 'No additional teacher instruction.'}
`}

Material:
${payload.materialText.slice(0, 16000)}
`.trim();
}

function cleanChatHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const row = item as { role?: unknown; content?: unknown };
      const role = row.role === 'teacher' || row.role === 'assistant' ? row.role : null;
      const content = typeof row.content === 'string' ? row.content.trim() : '';
      if (!role || !content) return null;
      return { role, content: content.slice(0, 800) };
    })
    .filter((item): item is ChatMessage => item !== null)
    .slice(-12);
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);

  const payload = await req.json().catch(() => null) as {
    mode?: 'generate' | 'revise';
    materialText?: string;
    title?: string;
    targetLabel?: string;
    topic?: string;
    difficulty?: string;
    count?: number;
    types?: QuestionType[];
    instruction?: string;
    questions?: ExamQuestionDraft[];
    chatHistory?: ChatMessage[];
  } | null;
  if (!payload?.materialText?.trim()) return jsonResponse({ error: '자료 텍스트가 필요합니다.' }, 400);

  try {
    const result = await callGemini(buildPrompt({
      mode: payload.mode ?? 'generate',
      materialText: payload.materialText,
      title: payload.title ?? 'Online exam',
      targetLabel: payload.targetLabel ?? '',
      topic: payload.topic ?? '',
      difficulty: payload.difficulty ?? 'normal',
      count: payload.count ?? 8,
      types: (payload.types ?? []).filter(type => QUESTION_TYPES.includes(type)),
      instruction: payload.instruction,
      questions: payload.questions,
      chatHistory: cleanChatHistory(payload.chatHistory),
    }));
    return jsonResponse({ questions: result.questions, reply: result.reply });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'AI 출제에 실패했습니다.' }, 500);
  }
});
