import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import {
  Sparkles, Users, BookOpen, FileText, GraduationCap, Gauge, ChevronDown,
  Check, AlignLeft, Lock, Settings, X, List, Calendar, Pencil,
  Trash2, CheckCircle2, Eye, EyeOff, Printer, Save, QrCode, Send, Plus, Minus,
  Link2, Copy, Play, Square, Tablet, BarChart3,
  Award, TrendingUp, ChevronRight, MessageCircle, Sprout,
  Clock, ArrowRight, RotateCw, User, Hand, AlertTriangle,
} from 'lucide-react';
import type { Class, Student } from '../types';
import { examsApi, type ExamQuestion as SdkQuestion, type ExamStatus, type ExamListItem, type ExamSubmission as DbSubmission, type ExamAnswer as DbAnswer, type ExamAiChatMessage } from '../lib/exams';
import { buildClasscardPasteText } from '../lib/classcardExport';
import { inspectExamQuestions, type ExamQualityIssue } from '../lib/examQuality';
import './Exams.css';

/* ===========================================================================
   평가관리 (온라인 시험) — 선생님 출제 흐름
   시험 목록 → 시험 만들기 → 생성 중 → 미리보기(+AI 편집·인쇄)
   디자인/흐름은 Growing 시험 출제 프로토타입(v2)을 그대로 옮긴 것.
   =========================================================================== */

// ----- 타입 -----
type QType = 'vocab' | 'grammar' | 'reading' | 'writing';

interface Question {
  id: string;
  type: QType;
  points: number;
  prompt: string;
  choices: string[] | null;
  answer: number | string;
  explanation: string;
  source?: string;
  passage?: string;
}

interface Exam {
  id: string;
  name: string;
  target: string;
  topic: string;
  date: string;
  difficulty: string;
  types: QType[];
  questions: Question[];
  // 백엔드 연동용 메타
  classId?: string;
  status?: ExamStatus;
  shortCode?: string;
  materialText?: string;
}

// SDK 문항(orderNo 기반) ↔ 컴포넌트 문항(id 기반) 변환
const fromSdkQuestions = (qs: SdkQuestion[]): Question[] =>
  qs.map((q, i) => ({
    id: q.id ?? 'q' + (q.orderNo ?? i + 1),
    type: q.type,
    points: q.points,
    prompt: q.prompt,
    choices: q.choices,
    answer: q.answer,
    explanation: q.explanation,
    source: q.source || undefined,
    passage: q.passage || undefined,
  }));

const toSdkQuestions = (qs: Question[]): SdkQuestion[] =>
  qs.map((q, i) => ({
    id: /^[0-9a-f-]{36}$/i.test(q.id) ? q.id : undefined,
    orderNo: i + 1,
    type: q.type,
    points: q.points,
    source: q.source ?? '',
    prompt: q.prompt,
    passage: q.passage ?? null,
    choices: q.choices,
    answer: q.answer,
    explanation: q.explanation,
  }));

interface ExamCard {
  id: string;
  classId: string | null;
  name: string;
  target: string;
  topic: string;
  count: number;
  date: string;
  types: QType[];
  difficulty: string;
  totalPoints: number;
  status: ExamStatus;
}

type MaterialKind = 'text';
interface Material {
  id: string;
  kind: MaterialKind;
  name: string;
  meta: string;
  label: string;
}

interface GenMeta {
  classId: string;
  targetLabel: string;
  topic: string;
  count: number;
  types: QType[];
  diff: string;
  materialText: string;
  instruction?: string;
}

interface CreateExamDraft {
  mats: Material[];
  pasteText: string;
  optOpen: boolean;
  classId: string;
  scope: string;
  teacherRequest: string;
  count: number;
  types: QType[];
  difficulty: string;
}

interface PersistedExamDraft {
  screen: 'create' | 'preview';
  form: CreateExamDraft;
  meta: GenMeta | null;
  exam: Exam | null;
  updatedAt: number;
}

const examDraftKey = (ownerId: string) => `growing_exam_draft_v1_${ownerId}`;

const defaultCreateExamDraft = (classes: Class[]): CreateExamDraft => ({
  mats: [],
  pasteText: '',
  optOpen: true,
  classId: classes[0]?.id ?? '',
  scope: '',
  teacherRequest: '',
  count: 8,
  types: ['vocab', 'grammar', 'reading', 'writing'],
  difficulty: '보통',
});

const loadExamDraft = (ownerId: string): PersistedExamDraft | null => {
  try {
    const raw = localStorage.getItem(examDraftKey(ownerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedExamDraft;
    if (!parsed?.form || (parsed.screen !== 'create' && parsed.screen !== 'preview')) return null;
    return parsed;
  } catch {
    return null;
  }
};

const saveExamDraft = (ownerId: string, draft: PersistedExamDraft) => {
  try {
    localStorage.setItem(examDraftKey(ownerId), JSON.stringify(draft));
  } catch {
    // Draft persistence must never interrupt exam creation.
  }
};

const removeExamDraft = (ownerId: string) => {
  try {
    localStorage.removeItem(examDraftKey(ownerId));
  } catch {
    // Storage can be unavailable in restricted browser modes.
  }
};

// ----- 데이터 -----
const TYPE_META: Record<QType, { label: string; cls: string }> = {
  vocab: { label: '어휘', cls: 'badge-vocab' },
  grammar: { label: '문법', cls: 'badge-grammar' },
  reading: { label: '독해', cls: 'badge-reading' },
  writing: { label: '서술형', cls: 'badge-writing' },
};


// 텍스트 붙여넣기로 추가되는 자료 풀
const TEXT_MATERIALS: Omit<Material, 'label'>[] = [
  { id: 'mt1', kind: 'text', name: '붙여넣은 텍스트', meta: '텍스트 · 본문/단어장' },
];
// ----- 배포/응시 데이터 -----
interface RosterStudent { id?: string; no: number; name: string; submitted?: boolean }
const ROSTER: RosterStudent[] = [
  { no: 1, name: '김서연' }, { no: 2, name: '박지훈' }, { no: 3, name: '이도윤' },
  { no: 4, name: '최하은' }, { no: 5, name: '정우진' }, { no: 6, name: '한소라' },
  { no: 7, name: '오민재' }, { no: 8, name: '윤채원' }, { no: 9, name: '강시우' },
  { no: 10, name: '임나윤' },
];
const SHORT_CODE = 'ABC123';
const JOIN_URL = 'growing.kr/t/ABC123';
const getQrImageUrl = (value: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=18&data=${encodeURIComponent(value)}`;

interface PerQ { correct: boolean; partial?: boolean; gained?: number; answer: number | string; feedback?: string | null; type: 'mcq' | 'write'; gradedBy?: 'auto' | 'ai' | 'teacher' }
interface Submission { id?: string; no: number; name: string; time: string; score: number; totalPoints: number; submitted: boolean; perQ: Record<string, PerQ> }

const emptyPerQ = (question: Question): PerQ => ({
  correct: false,
  partial: false,
  gained: 0,
  answer: question.choices ? -1 : '(미응답)',
  feedback: null,
  type: question.choices ? 'mcq' : 'write',
  gradedBy: 'auto',
});

const clampPct = (value: number) => Math.max(0, Math.min(100, value));
const scorePct = (score: number, totalPoints: number) => clampPct(totalPoints > 0 ? Math.round(score / totalPoints * 100) : score);
const submissionPct = (submission: Submission) => scorePct(submission.score, submission.totalPoints);
const choiceAnswerIndex = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : -1;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : -1;
  }
  return -1;
};
const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong style={{ fontWeight: 800 }}>{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em>{children}</em>,
};

function MarkdownText({ text }: { text: string }) {
  return <ReactMarkdown skipHtml components={markdownComponents}>{text}</ReactMarkdown>;
}

function ChoiceAnswerText({ choices, answer, fallback = '(미응답)' }: { choices: string[]; answer: unknown; fallback?: string }) {
  const index = choiceAnswerIndex(answer);
  if (index < 0 || index >= choices.length) return <>{fallback}</>;
  return <>{CIRC[index]} <MarkdownText text={choices[index]} /></>;
}

const CIRC = ['①', '②', '③', '④', '⑤'];

// ===========================================================================
// 공통 작은 컴포넌트
// ===========================================================================
function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const fn = () => setMobile(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return mobile;
}

function Stepper({ value, setValue, min = 4, max = 30 }: { value: number; setValue: (fn: (v: number) => number) => void; min?: number; max?: number }) {
  const bump = (d: number) => () => setValue(v => Math.min(max, Math.max(min, v + d)));
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', border: '1.5px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden', background: '#fff' }}>
      <button onClick={bump(-1)} disabled={value <= min} style={{ width: 46, height: 48, border: 'none', background: '#fff', display: 'grid', placeItems: 'center', color: 'var(--text-2)', opacity: value <= min ? 0.4 : 1 }}><Minus size={18} /></button>
      <div className="num-font" style={{ width: 60, textAlign: 'center', fontSize: 20, fontWeight: 700, borderLeft: '1.5px solid var(--border)', borderRight: '1.5px solid var(--border)', height: 48, lineHeight: '48px' }}>{value}</div>
      <button onClick={bump(1)} disabled={value >= max} style={{ width: 46, height: 48, border: 'none', background: '#fff', display: 'grid', placeItems: 'center', color: 'var(--text-2)', opacity: value >= max ? 0.4 : 1 }}><Plus size={18} /></button>
    </div>
  );
}

function Field({ icon, label, hint, children }: { icon?: React.ReactNode; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="field-label">{icon}{label}{hint && <span className="field-hint" style={{ marginLeft: 'auto', fontWeight: 500 }}>{hint}</span>}</div>
      {children}
    </div>
  );
}

// ===========================================================================
// 화면 1: 시험 목록
// ===========================================================================
const statusMeta: Record<ExamStatus, { label: string; bg: string; color: string }> = {
  draft: { label: '작성중', bg: '#f3f4f6', color: '#4b5563' },
  published: { label: '응시중', bg: 'var(--mint-light)', color: 'var(--primary)' },
  closed: { label: '마감', bg: '#fef3c7', color: '#b45309' },
};

function SavedExamsScreen({ exams, classes, onOpen, onNew }: { exams: ExamCard[]; classes: Class[]; onOpen: (e: ExamCard) => void; onNew: () => void }) {
  const empty = exams.length === 0;
  const classById = new Map(classes.map(cls => [cls.id, cls]));
  const classOrder = new Map(classes.map((cls, index) => [cls.id, index]));
  const sections = Array.from(exams.reduce<Map<string, ExamCard[]>>((map, exam) => {
    const key = exam.classId && classById.has(exam.classId) ? exam.classId : '__none';
    const list = map.get(key) ?? [];
    list.push(exam);
    map.set(key, list);
    return map;
  }, new Map()).entries()).sort(([a], [b]) => {
    if (a === '__none') return 1;
    if (b === '__none') return -1;
    return (classOrder.get(a) ?? 999) - (classOrder.get(b) ?? 999);
  });

  const renderExamCard = (e: ExamCard, i: number) => {
    const status = statusMeta[e.status];
    return (
      <button key={e.id} onClick={() => onOpen(e)} className="card fade-up exam-board-card" style={{ textAlign: 'left', padding: 20, boxShadow: 'var(--shadow-sm)', cursor: 'pointer', border: '1px solid var(--border)', transition: 'transform .12s ease, box-shadow .15s ease, border-color .15s ease', animationDelay: `${i * 35}ms` }}
        onMouseEnter={ev => { ev.currentTarget.style.transform = 'translateY(-2px)'; ev.currentTarget.style.boxShadow = 'var(--shadow-md)'; ev.currentTarget.style.borderColor = '#cfe3d8'; }}
        onMouseLeave={ev => { ev.currentTarget.style.transform = 'none'; ev.currentTarget.style.boxShadow = 'var(--shadow-sm)'; ev.currentTarget.style.borderColor = 'var(--border)'; }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11, flexWrap: 'wrap' }}>
          <span className="badge" style={{ background: status.bg, color: status.color }}>{status.label}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={13} color="var(--muted)" />{e.date}</span>
        </div>
        <h3 className="h-font" style={{ fontSize: 16.5, fontWeight: 700, margin: '0 0 5px', lineHeight: 1.35, color: 'var(--text)' }}>{e.name}</h3>
        <p style={{ margin: '0 0 14px', fontSize: 13.2, color: 'var(--text-2)', minHeight: 18 }}>{e.topic || '범위 미지정'}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingTop: 13, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', minWidth: 0 }}>
            {e.types.slice(0, 3).map(t => <span key={t} className={'badge ' + TYPE_META[t].cls} style={{ fontSize: 10.5, padding: '3px 7px' }}>{TYPE_META[t].label}</span>)}
            {e.types.length > 3 && <span className="badge" style={{ fontSize: 10.5, padding: '3px 7px', background: '#eef3ef', color: 'var(--text-2)' }}>+{e.types.length - 3}</span>}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', flexShrink: 0 }}><FileText size={14} color="var(--muted)" /> {e.count}문항 · {e.totalPoints}점</span>
        </div>
      </button>
    );
  };

  return (
    <div className="fade-up exam-pagepad" style={{ maxWidth: 980, margin: '0 auto', padding: '40px 44px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 26, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 className="h-font exam-h1" style={{ fontSize: 32, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-.02em' }}>반별 시험 게시판</h1>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 15 }}>반마다 진행 중인 시험과 최근 결과를 한곳에서 확인해요. {!empty && <b className="num-font" style={{ color: 'var(--primary)' }}>{exams.length}개</b>}</p>
        </div>
        <button className="btn btn-primary" onClick={onNew} style={{ height: 46 }}><Plus size={18} color="#fff" /> 새 시험 만들기</button>
      </div>

      {!empty && (
        <div className="ex-kpis" style={{ marginBottom: 24 }}>
          {([
            { label: '전체', value: exams.length, bg: '#eef3ef', color: 'var(--primary)' },
            { label: '응시중', value: exams.filter(e => e.status === 'published').length, bg: 'var(--mint-light)', color: '#0c7a55' },
            { label: '마감', value: exams.filter(e => e.status === 'closed').length, bg: '#fef3c7', color: '#b45309' },
            { label: '작성중', value: exams.filter(e => e.status === 'draft').length, bg: '#f3f4f6', color: '#4b5563' },
          ] as { label: string; value: number; bg: string; color: string }[]).map(k => (
            <div key={k.label} className="kpi" style={{ textAlign: 'center', padding: '14px 12px' }}>
              <div className="num-font" style={{ fontSize: 26, fontWeight: 800, color: k.color, marginBottom: 4 }}>{k.value}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {empty ? (
        <div className="card" style={{ padding: '60px 30px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ width: 76, height: 76, borderRadius: 22, margin: '0 auto 20px', background: 'var(--mint-light)', display: 'grid', placeItems: 'center' }}><FileText size={34} color="var(--primary-light)" /></div>
          <h3 className="h-font" style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>아직 만든 시험이 없어요</h3>
          <p style={{ margin: '0 0 22px', color: 'var(--text-2)', fontSize: 14.5, lineHeight: 1.6 }}>첫 시험을 만들어 볼까요?<br />지문이나 자료를 입력하면 아이비가 문항 생성을 도와드려요.</p>
          <button className="btn btn-primary btn-lg" onClick={onNew} style={{ margin: '0 auto' }}><Sparkles size={19} color="#fff" /> 첫 시험 만들기</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {sections.map(([classKey, list]) => {
            const cls = classKey === '__none' ? null : classById.get(classKey);
            const publishedCount = list.filter(exam => exam.status === 'published').length;
            return (
              <section key={classKey} className="card exam-board-section" style={{ padding: 22, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: cls?.color ? cls.color : 'linear-gradient(150deg,#2c6f52,#10b981)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, flexShrink: 0 }}>
                    {cls ? cls.name.slice(0, 1) : <FileText size={19} color="#fff" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <h2 className="h-font" style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>{cls?.name ?? '반 미지정'}</h2>
                    <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 3 }}>{list.length}개 시험{publishedCount > 0 ? ` · 응시중 ${publishedCount}개` : ''}</div>
                  </div>
                  <span className="badge" style={{ background: '#eef3ef', color: 'var(--text-2)' }}>{cls ? `${cls.days.join('·')} ${cls.startTime}` : '게시판'}</span>
                </div>
                <div className="exam-board-grid">
                  {list.map(renderExamCard)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// 화면 2: 시험 만들기 (자료 올리기 — 텍스트 붙여넣기가 가장 먼저)
// ===========================================================================
const MAT_VIS: Record<MaterialKind, { icon: React.ReactNode; bg: string }> = {
  text: { icon: <AlignLeft size={22} color="#6d28d9" />, bg: '#ede9fe' },
};

function MaterialChip({ m, onDel }: { m: Material; onDel: () => void }) {
  return (
    <div className="up-chip slide-in">
      <div className="up-thumb" style={{ background: MAT_VIS[m.kind].bg }}>{MAT_VIS[m.kind].icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--primary)', background: 'var(--mint-light)', padding: '1px 6px', borderRadius: 5 }}>{m.label}</span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{m.name}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, marginTop: 2 }}>{m.meta}</div>
      </div>
      <button onClick={onDel} title="삭제" style={{ marginLeft: 6, border: 'none', background: 'transparent', width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--muted)', flexShrink: 0 }}
        onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = 'var(--danger)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; }}><X size={16} /></button>
    </div>
  );
}

function CreateExam({ classes, draft, onDraftChange, onGenerate }: {
  classes: Class[];
  draft: CreateExamDraft;
  onDraftChange: (draft: CreateExamDraft) => void;
  onGenerate: (m: GenMeta) => void;
}) {
  // 지금 단계에서는 텍스트 자료만 받는다.
  const [tab, setTab] = useState<MaterialKind>('text');
  const [mats, setMats] = useState<Material[]>(draft.mats);
  const [pasteText, setPasteText] = useState(draft.pasteText);
  const [optOpen, setOptOpen] = useState(draft.optOpen);

  const [clsId, setClsId] = useState(draft.classId || classes[0]?.id || '');
  const [scope, setScope] = useState(draft.scope);
  const [teacherRequest, setTeacherRequest] = useState(draft.teacherRequest);
  const [count, setCount] = useState(draft.count);
  const [types, setTypes] = useState<QType[]>(draft.types);
  const [diff, setDiff] = useState(draft.difficulty);
  const className = classes.find(c => c.id === clsId)?.name ?? '';

  useEffect(() => {
    onDraftChange({ mats, pasteText, optOpen, classId: clsId, scope, teacherRequest, count, types, difficulty: diff });
  }, [clsId, count, diff, mats, onDraftChange, optOpen, pasteText, scope, teacherRequest, types]);

  const addText = () => {
    const next = TEXT_MATERIALS[0];
    const chars = pasteText.trim().length;
    setMats(ms => [...ms, { ...next, id: next.id + '-' + Date.now(), label: '자료 ' + (ms.length + 1), meta: `텍스트 · ${chars}자` }]);
  };
  const delMat = (id: string) => setMats(ms => ms.filter(m => m.id !== id).map((m, i) => ({ ...m, label: '자료 ' + (i + 1) })));
  const toggleType = (t: QType) => setTypes(ts => ts.includes(t) ? ts.filter(x => x !== t) : [...ts, t]);

  const canGen = !!clsId && pasteText.trim().length > 0 && types.length > 0;

  // 지금은 텍스트 자료만 사용한다.
  const TABS: { k: MaterialKind; icon: React.ReactNode; label: string }[] = [
    { k: 'text', icon: <AlignLeft size={17} />, label: '텍스트 붙여넣기' },
  ];

  return (
    <div className="fade-up exam-pagepad" style={{ maxWidth: 780, margin: '0 auto', padding: '40px 44px 60px' }}>
      <div style={{ marginBottom: 22 }}>
        <div className="badge" style={{ background: 'var(--mint-light)', color: 'var(--primary)', marginBottom: 12 }}><Sparkles size={13} /> 자료 기반 AI 출제</div>
        <h1 className="h-font exam-h1" style={{ fontSize: 33, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-.02em' }}>새 시험 만들기</h1>
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 15 }}>교재·자료를 올리면 <b style={{ color: 'var(--primary)' }}>그 자료 안에서만</b> 문제를 만들어 드려요.</p>
        <p style={{ margin: '8px 0 0', color: 'var(--primary-light)', fontSize: 12.5, fontWeight: 600 }}>작성 내용은 자동으로 임시 저장됩니다.</p>
      </div>

      {/* ===== 자료 올리기 ===== */}
      <div className="card" style={{ padding: 30, boxShadow: 'var(--shadow-md)', marginBottom: 20, border: '1.5px solid #d6ebe0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(150deg,#2c6f52,#10b981)', display: 'grid', placeItems: 'center', boxShadow: '0 4px 12px rgba(16,185,129,.28)' }}><AlignLeft size={21} color="#fff" /></div>
          <div>
            <div className="h-font" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>자료 올리기</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 500 }}>1단계 — 가장 먼저 자료부터 올려요</div>
          </div>
          {mats.length > 0 && <span className="badge" style={{ background: 'var(--mint-light)', color: 'var(--primary)', marginLeft: 'auto' }}><Check size={12} /> {mats.length}개 올림</span>}
        </div>

        {/* tabs */}
        <div className="up-tabs">
          {TABS.map(t => (
            <button key={t.k} className="up-tab" data-on={tab === t.k} onClick={() => setTab(t.k)}>{t.icon}{t.label}</button>
          ))}
        </div>

        {/* tab body */}
        {tab === 'text' && (
          <div>
            <textarea className="input" value={pasteText} onChange={e => setPasteText(e.target.value)} style={{ minHeight: 130, fontSize: 14, lineHeight: 1.6 }} placeholder="교재 본문이나 단어장을 붙여넣으세요…" />
            <button className="btn btn-soft" style={{ marginTop: 12 }} disabled={!pasteText.trim()} onClick={addText}><Plus size={16} color="var(--primary)" /> 이 텍스트 추가</button>
          </div>
        )}
        {mats.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
            {mats.map(m => <MaterialChip key={m.id} m={m} onDel={() => delMat(m.id)} />)}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 18, padding: '12px 15px', background: '#f3faf6', border: '1px solid #c7ecd9', borderRadius: 12 }}>
          <Lock size={16} color="var(--primary)" />
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--primary)' }}>올린 자료 안에서만 문제를 만들어요 — 자료 밖 내용은 출제되지 않아요.</span>
        </div>
      </div>

      {/* ===== 보조 옵션 (접이식) ===== */}
      <div className="card" style={{ padding: 0, boxShadow: 'var(--shadow-sm)', marginBottom: 20, overflow: 'hidden' }}>
        <button onClick={() => setOptOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none', background: 'transparent', padding: '18px 28px', textAlign: 'left' }}>
          <Settings size={18} color="var(--primary-light)" />
          <div>
            <div className="h-font" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>출제 옵션</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>대상 반 · 범위 · 문항 수 · 유형 · 난이도 <span style={{ color: 'var(--primary-light)', fontWeight: 600 }}>(선택)</span></div>
          </div>
          <ChevronDown size={20} color="var(--muted)" style={{ marginLeft: 'auto', transform: optOpen ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }} />
        </button>

        {optOpen && (
          <div style={{ padding: '4px 28px 28px', borderTop: '1px solid var(--border)' }}>
            <div style={{ height: 12 }} />
            <Field icon={<Users size={16} color="var(--primary-light)" />} label="대상 반 / 학년">
              {classes.length === 0 ? (
                <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>등록된 반이 없어요. 먼저 ‘반/시간표 관리’에서 반을 만들어 주세요.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                  {classes.map(c => (
                    <button key={c.id} className="chip" data-on={c.id === clsId} onClick={() => setClsId(c.id)}>{c.id === clsId && <Check size={14} color="var(--primary)" />}{c.name}</button>
                  ))}
                </div>
              )}
            </Field>

            <Field icon={<BookOpen size={16} color="var(--primary-light)" />} label="세부 범위" hint="선택 — 자료 안에서 좁혀요">
              <input className="input" value={scope} onChange={e => setScope(e.target.value)} placeholder="예: 동명사, 현재완료, 미래 표현" />
            </Field>

            <Field icon={<Sparkles size={16} color="var(--primary-light)" />} label="선생님 요청" hint="선택 — 출제 방식, 강조, 피할 유형 등을 자유롭게 적어요">
              <textarea className="input" value={teacherRequest} onChange={e => setTeacherRequest(e.target.value)} style={{ minHeight: 72, fontSize: 14, lineHeight: 1.55 }} placeholder="예: 동명사 중심으로 출제하고, 보기에는 헷갈리는 오답을 넣어줘" />
            </Field>

            <div className="exam-col2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <Field icon={<FileText size={16} color="var(--primary-light)" />} label="문항 수">
                <Stepper value={count} setValue={setCount} />
              </Field>
              <Field icon={<Gauge size={16} color="var(--primary-light)" />} label="난이도">
                <div className="segment">
                  {['쉬움', '보통', '어려움'].map(d => <button key={d} data-on={diff === d} onClick={() => setDiff(d)}>{d}</button>)}
                </div>
              </Field>
            </div>

            <Field icon={<GraduationCap size={16} color="var(--primary-light)" />} label="문항 유형" hint="복수 선택">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {(Object.keys(TYPE_META) as QType[]).map(k => (
                  <button key={k} className="chip" data-on={types.includes(k)} onClick={() => toggleType(k)}>{types.includes(k) && <Check size={15} color="var(--primary)" />}{TYPE_META[k].label}</button>
                ))}
              </div>
            </Field>
          </div>
        )}
      </div>

      <button className="btn btn-primary btn-lg" disabled={!canGen} style={{ width: '100%' }} onClick={() => onGenerate({ classId: clsId, targetLabel: className, topic: scope, count, types, diff, materialText: pasteText, instruction: teacherRequest })}>
        <Sparkles size={20} color="#fff" /> 이 자료로 문제 생성
      </button>
      {!canGen && <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--muted)', margin: '12px 0 0' }}>{!clsId ? '대상 반을 선택해 주세요' : pasteText.trim().length === 0 ? '텍스트 자료를 붙여넣어 주세요' : '유형을 1개 이상 선택해 주세요'}</p>}
    </div>
  );
}

// ===========================================================================
// 화면 2.5: 생성 중 로딩
// ===========================================================================
function GenLoading({ meta }: { meta: GenMeta | null }) {
  const steps = [
    { t: '자료를 읽고 있어요…', icon: <FileText size={16} color="var(--muted)" /> },
    { t: '핵심 어휘·문법을 뽑는 중…', icon: <Sparkles size={16} color="var(--muted)" /> },
    { t: '문항을 만드는 중…', icon: <Pencil size={16} color="var(--muted)" /> },
    { t: '보기·해설을 다듬는 중…', icon: <Check size={16} color="var(--muted)" /> },
  ];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep(s => Math.min(steps.length - 1, s + 1)), 820);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fade-up exam-pagepad" style={{ maxWidth: 720, margin: '0 auto', padding: '52px 44px' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ width: 66, height: 66, borderRadius: 20, margin: '0 auto 18px', background: 'linear-gradient(150deg,#2c6f52,#10b981)', display: 'grid', placeItems: 'center', boxShadow: '0 10px 26px rgba(16,185,129,.32)', position: 'relative' }}>
          <div className="spin" style={{ position: 'absolute', inset: 6, border: '2.5px solid rgba(255,255,255,.35)', borderTopColor: '#fff', borderRadius: '50%' }} />
          <Sparkles size={26} color="#fff" />
        </div>
        <h2 className="h-font" style={{ fontSize: 25, fontWeight: 700, margin: '0 0 6px' }}>자료에서 문제를 만드는 중이에요</h2>
        <p style={{ margin: '0 0 2px', color: 'var(--muted)', fontSize: 13 }}>{meta?.targetLabel} · {meta?.count}문항 · AI 출제</p>
      </div>

      <div className="card" style={{ padding: 24, boxShadow: 'var(--shadow-sm)', marginBottom: 22 }}>
        {steps.map((s, i) => {
          const done = i < step, cur = i === step;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 4px', opacity: i > step ? 0.45 : 1, transition: 'opacity .3s' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: done ? 'var(--mint)' : cur ? 'var(--mint-light)' : '#eef3ef' }}>
                {done ? <Check size={17} color="#fff" /> : cur ? <div className="spin" style={{ width: 17, height: 17, border: '2.2px solid #bfe3d1', borderTopColor: 'var(--primary)', borderRadius: '50%' }} /> : s.icon}
              </div>
              <span style={{ fontSize: 14.5, fontWeight: cur ? 700 : 600, color: done ? 'var(--text-2)' : cur ? 'var(--primary)' : 'var(--muted)' }}>{s.t}</span>
              {done && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--mint)', fontWeight: 700 }}>완료</span>}
            </div>
          );
        })}
      </div>

      {[0, 1].map(i => (
        <div key={i} className="card" style={{ padding: 22, marginBottom: 14, boxShadow: 'var(--shadow-sm)', opacity: 1 - i * 0.3 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
            <div className="skel" style={{ width: 30, height: 30, borderRadius: 9 }} />
            <div className="skel" style={{ width: 52, height: 22, borderRadius: 99 }} />
            <div className="skel" style={{ width: 90, height: 18, borderRadius: 99, marginLeft: 'auto' }} />
          </div>
          <div className="skel" style={{ width: '90%', height: 14, marginBottom: 10 }} />
          <div className="skel" style={{ width: '60%', height: 14, marginBottom: 20 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{[0, 1, 2, 3].map(j => <div key={j} className="skel" style={{ height: 38, borderRadius: 10 }} />)}</div>
        </div>
      ))}
    </div>
  );
}

// ===========================================================================
// 화면 3: 미리보기 + AI 편집 스튜디오
// ===========================================================================
function ChoiceRow({ idx, text, correct, reveal, editing, onText }: { idx: number; text: string; correct: boolean; reveal: boolean; editing: boolean; onText: (v: string) => void }) {
  const show = reveal && correct;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 12px', borderRadius: 10, background: show ? 'var(--mint-light)' : 'transparent', border: show ? '1.5px solid var(--mint)' : '1.5px solid transparent', transition: 'all .15s ease' }}>
      <span className="num-font" style={{ fontWeight: 700, color: show ? 'var(--primary)' : 'var(--text-2)', fontSize: 15, lineHeight: '22px', flexShrink: 0 }}>{CIRC[idx]}</span>
      {editing
        ? <input value={text} onChange={e => onText(e.target.value)} className="input" style={{ padding: '5px 9px', fontSize: 14, height: 32 }} />
        : <span style={{ fontSize: 14.5, color: show ? 'var(--primary)' : 'var(--text)', fontWeight: show ? 600 : 400, lineHeight: 1.5 }}><MarkdownText text={text} /></span>}
      {show && <CheckCircle2 size={18} color="var(--mint)" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
    </div>
  );
}

function QuestionCard({ q, n, reveal, editing, onEdit, onChange, onDelete, highlight, qualityIssues }: { q: Question; n: number; reveal: boolean; editing: boolean; onEdit: () => void; onChange: (q: Question) => void; onDelete: () => void; highlight: boolean; qualityIssues: ExamQualityIssue[] }) {
  const m = TYPE_META[q.type];
  const upd = (patch: Partial<Question>) => onChange({ ...q, ...patch });
  return (
    <div className={'card' + (highlight ? ' slide-in' : '')} style={{ padding: 26, marginBottom: 16, boxShadow: 'var(--shadow-sm)', borderColor: editing ? 'var(--mint)' : 'var(--border)', scrollMarginTop: 90 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="num-font h-font" style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{n}</div>
        <span className={'badge ' + m.cls}>{m.label}</span>
        <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{q.points}점</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-icon" title="편집" onClick={onEdit} style={{ borderColor: editing ? 'var(--mint)' : 'var(--border)', background: editing ? 'var(--mint-light)' : '#fff' }}><Pencil size={16} color={editing ? 'var(--primary)' : 'var(--text-2)'} /></button>
          <button className="btn btn-danger-ghost btn-icon" title="삭제" onClick={onDelete}><Trash2 size={16} /></button>
        </div>
      </div>

      {qualityIssues.length > 0 && (
        <button type="button" onClick={() => { if (!editing) onEdit(); }} style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14, padding: '10px 12px', textAlign: 'left', borderRadius: 10, border: '1px solid #f4cf8e', background: '#fffbeb', color: '#92400e' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5, lineHeight: 1.5, fontWeight: 600 }}>{qualityIssues.map(issue => issue.message).join(' · ')}</span>
        </button>
      )}

      {q.source && <div style={{ marginBottom: 12 }}><span className="src-tag"><FileText size={12} color="var(--primary-light)" /> 출처 · {q.source}</span></div>}

      {q.passage && (
        <div style={{ background: '#f7faf8', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 14, fontSize: 14, lineHeight: 1.7, color: 'var(--text-2)' }}>
          {editing ? <textarea className="input" value={q.passage} onChange={e => upd({ passage: e.target.value })} style={{ minHeight: 90 }} /> : <MarkdownText text={q.passage} />}
        </div>
      )}

      {editing
        ? <textarea className="input" value={q.prompt} onChange={e => upd({ prompt: e.target.value })} style={{ marginBottom: 14, minHeight: 64, fontWeight: 600 }} />
        : <p style={{ margin: '0 0 16px', fontSize: 15.5, lineHeight: 1.6, color: 'var(--text)', fontWeight: 500, whiteSpace: 'pre-line' }}><MarkdownText text={q.prompt} /></p>}

      {q.choices ? (
        <div className="exam-col2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
          {q.choices.map((c, i) => <ChoiceRow key={i} idx={i} text={c} correct={i === q.answer} reveal={reveal} editing={editing} onText={(v) => upd({ choices: q.choices!.map((x, xi) => xi === i ? v : x) })} />)}
        </div>
      ) : (
        <div style={{ border: '1.5px dashed #cfdad3', borderRadius: 12, padding: '16px', minHeight: 54, display: 'flex', alignItems: 'center', color: 'var(--muted)', fontSize: 13.5 }}><Pencil size={15} style={{ marginRight: 8 }} /> 답안 작성란 (서술형)</div>
      )}

      {reveal && (
        <div className="slide-in" style={{ marginTop: 16, background: '#f3faf6', border: '1px solid #c7ecd9', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: q.explanation ? 8 : 0 }}>
            <CheckCircle2 size={17} color="var(--success)" />
            <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--primary)' }}>정답</span>
            <span style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--text)' }}>{q.choices ? <ChoiceAnswerText choices={q.choices} answer={q.answer} fallback="(정답 없음)" /> : <MarkdownText text={String(q.answer)} />}</span>
          </div>
          {q.explanation && <div style={{ display: 'flex', gap: 8 }}><span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--mint)', flexShrink: 0, marginTop: 1 }}>해설</span><span style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-2)' }}><MarkdownText text={q.explanation} /></span></div>}
        </div>
      )}
    </div>
  );
}

function MetaPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: '#fff', border: '1px solid var(--border)', display: 'grid', placeItems: 'center' }}>{icon}</div>
      <div style={{ lineHeight: 1.25 }}><div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{label}</div><div className="num-font" style={{ fontSize: 15, fontWeight: 700 }}>{value}</div></div>
    </div>
  );
}

interface Chip { label: string; icon: React.ReactNode; act: 'add' | 'harder' | 'reveal'; type?: QType; n?: number }

interface AiChatMessage {
  id: string;
  role: 'teacher' | 'assistant';
  text: string;
  pending?: boolean;
  error?: boolean;
}

function PreviewStudio({ exam, setExam, reveal, setReveal, onPrint, onSave, onDuplicate, onClasscardCopy, onDistribute }: { exam: Exam; setExam: React.Dispatch<React.SetStateAction<Exam | null>>; reveal: boolean; setReveal: React.Dispatch<React.SetStateAction<boolean>>; onPrint: (mode: 'student' | 'teacher') => void; onSave: () => void; onDuplicate: () => void; onClasscardCopy: () => void; onDistribute: () => void }) {
  const isMobile = useIsMobile();
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatIdRef = useRef(0);
  const [dockOpen, setDockOpen] = useState(false);
  const [mode, setMode] = useState<'student' | 'teacher'>('student');
  const [editId, setEditId] = useState<string | null>(null);
  const [printMenu, setPrintMenu] = useState(false);
  const [dockText, setDockText] = useState('');
  const [chatMessages, setChatMessages] = useState<AiChatMessage[]>([
    {
      id: 'hello',
      role: 'assistant',
      text: '시험지를 보면서 같이 다듬을게요. “3번 문제를 더 쉽게”, “서술형 2문항 추가”처럼 편하게 말해 주세요.',
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [newId, setNewId] = useState<string | null>(null);
  const reveals = mode === 'teacher' && reveal;
  const total = exam.questions.reduce((s, q) => s + q.points, 0);
  const qualityIssues = inspectExamQuestions(exam.questions);
  const qualityErrorCount = qualityIssues.filter(issue => issue.severity === 'error').length;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [chatMessages, dockOpen, busy]);

  const makeChatId = () => {
    chatIdRef.current += 1;
    return `chat-${chatIdRef.current}`;
  };
  const toAiHistory = (messages: AiChatMessage[]): ExamAiChatMessage[] => messages
    .filter(message => !message.pending && !message.error)
    .slice(-12)
    .map(message => ({ role: message.role, content: message.text }));

  const appendLocalChat = (teacherText: string, assistantText: string) => {
    setChatMessages(messages => [
      ...messages,
      { id: makeChatId(), role: 'teacher', text: teacherText },
      { id: makeChatId(), role: 'assistant', text: assistantText },
    ]);
  };

  const changeQ = (q: Question) => setExam(e => e ? { ...e, questions: e.questions.map(x => x.id === q.id ? q : x) } : e);
  const delQ = (id: string) => setExam(e => e ? { ...e, questions: e.questions.filter(x => x.id !== id) } : e);

  const materialForRevision = () => exam.materialText?.trim() || exam.questions.map((q, i) => [
    `문항 ${i + 1}`,
    q.source,
    q.passage,
    q.prompt,
    q.choices?.join(' / '),
    q.explanation,
  ].filter(Boolean).join('\n')).join('\n\n');

  const applyAiRevision = async (instruction: string, teacherText = instruction) => {
    if (busy) return;
    const teacherMessage: AiChatMessage = { id: makeChatId(), role: 'teacher', text: teacherText };
    const pendingId = makeChatId();
    const pendingMessage: AiChatMessage = { id: pendingId, role: 'assistant', text: '문항을 다시 읽고 있어요…', pending: true };
    const historySeed = [...chatMessages, teacherMessage];
    setChatMessages([...historySeed, pendingMessage]);
    setBusy(true);
    try {
      const revised = await examsApi.revise({
        materialText: materialForRevision(),
        instruction,
        questions: toSdkQuestions(exam.questions),
        targetLabel: exam.target,
        topic: exam.topic,
        difficulty: exam.difficulty,
        chatHistory: toAiHistory(historySeed),
      });
      const questions = fromSdkQuestions(revised.questions);
      if (questions.length === 0) throw new Error('AI가 문항을 만들지 못했어요. 요청을 조금 더 구체적으로 적어 주세요.');
      setExam(e => e ? {
        ...e,
        questions,
        types: Array.from(new Set(questions.map(q => q.type))) as QType[],
      } : e);
      setEditId(null);
      setNewId(questions[0]?.id ?? null);
      const reply = revised.reply ?? '반영했어요. 이어서 더 다듬고 싶은 부분을 말해 주세요.';
      setChatMessages(messages => messages.map(message => message.id === pendingId ? { ...message, text: reply, pending: false } : message));
    } catch (e) {
      const message = errMsg(e);
      setChatMessages(messages => messages.map(item => item.id === pendingId ? { ...item, text: message, pending: false, error: true } : item));
    } finally {
      setBusy(false);
    }
  };

  const addQuestions = (type: QType, n: number) => {
    const instruction = `${TYPE_META[type].label} ${n}문항을 추가해줘. 기존 좋은 문항은 유지하고, 자료 범위 안에서 새 문항을 자연스럽게 더해줘.`;
    void applyAiRevision(instruction, `${TYPE_META[type].label} ${n}문항 추가해줘`);
  };

  const toggleReveal = () => {
    setReveal(r => {
      const nx = !r;
      if (nx) setMode('teacher');
      return nx;
    });
  };

  const setRevealFromChat = (teacherText: string, desired: boolean) => {
    const reply = reveal === desired
      ? desired ? '이미 정답과 해설이 표시되어 있어요.' : '이미 정답이 숨겨져 있어요.'
      : desired ? '정답과 해설을 표시했어요. 선생님용 보기로 전환했어요.' : '정답을 다시 숨겼어요.';
    appendLocalChat(teacherText, reply);
    if (desired) setMode('teacher');
    setReveal(desired);
  };

  const runChip = (c: Chip) => {
    if (c.act === 'add' && c.type && c.n) addQuestions(c.type, c.n);
    else if (c.act === 'reveal') setRevealFromChat(c.label, !reveal);
    else if (c.act === 'harder') {
      setExam(e => e ? { ...e, difficulty: '어려움' } : e);
      void applyAiRevision('전체 문항의 난이도를 한 단계 높여줘. 단, 자료 밖 내용은 넣지 말고 기존 문항 의도는 유지해줘.', '난이도를 한 단계 높여줘');
    }
  };

  const onDockSend = () => {
    const t = dockText.trim();
    if (!t) return;
    setDockText('');
    if (/정답|해설|답.*보/.test(t) && !/숨/.test(t)) { setRevealFromChat(t, true); return; }
    if (/숨기|가려|숨겨/.test(t)) { setRevealFromChat(t, false); return; }
    void applyAiRevision(t);
  };

  const chips: Chip[] = [
    { label: '어휘 +2', icon: <Plus size={14} color="#9fcfb4" />, act: 'add', type: 'vocab', n: 2 },
    { label: '문법 +2', icon: <Plus size={14} color="#9fcfb4" />, act: 'add', type: 'grammar', n: 2 },
    { label: '독해 지문', icon: <Plus size={14} color="#9fcfb4" />, act: 'add', type: 'reading', n: 1 },
    { label: '서술형 +1', icon: <Plus size={14} color="#9fcfb4" />, act: 'add', type: 'writing', n: 1 },
    { label: '난이도 ↑', icon: <Gauge size={14} color="#9fcfb4" />, act: 'harder' },
    { label: reveal ? '정답 숨기기' : '정답 보기', icon: reveal ? <EyeOff size={14} color="#9fcfb4" /> : <Eye size={14} color="#9fcfb4" />, act: 'reveal' },
  ];

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      {/* sticky toolbar */}
      <div className="exam-toolbar" style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(245,248,245,.88)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)', padding: '14px 44px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="segment">
            <button data-on={mode === 'student'} onClick={() => setMode('student')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Users size={16} color={mode === 'student' ? 'var(--primary)' : 'var(--text-2)'} />학생용</button>
            <button data-on={mode === 'teacher'} onClick={() => setMode('teacher')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><GraduationCap size={16} color={mode === 'teacher' ? 'var(--primary)' : 'var(--text-2)'} />선생님용</button>
          </div>
          {mode === 'teacher' && (
            <button onClick={toggleReveal} className="btn" style={{ height: 38, background: reveal ? 'var(--primary)' : '#fff', color: reveal ? '#fff' : 'var(--text-2)', border: '1px solid ' + (reveal ? 'var(--primary)' : 'var(--border)') }}>{reveal ? <Eye size={16} color="#fff" /> : <EyeOff size={16} />} 정답 보기</button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <button className="btn btn-ghost" onClick={() => setPrintMenu(p => !p)} style={{ height: 38 }}><Printer size={17} /><span className="exam-btn-label">인쇄</span><ChevronDown size={14} color="var(--muted)" /></button>
              {printMenu && (
                <div className="card" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50, boxShadow: 'var(--shadow-lg)', padding: 6, width: 210 }}>
                  <button onClick={() => { setPrintMenu(false); onPrint('student'); }} style={pmI}><Users size={17} color="var(--info)" /><div><div style={pmT}>학생용 시험지</div><div style={pmS}>정답 없음</div></div></button>
                  <button onClick={() => { setPrintMenu(false); onPrint('teacher'); }} style={pmI}><GraduationCap size={17} color="var(--primary)" /><div><div style={pmT}>선생님용 정답지</div><div style={pmS}>정답·해설 포함</div></div></button>
                </div>
              )}
            </div>
            {isSavedId(exam.id) && <button className="btn btn-ghost" onClick={onDuplicate} title="이 시험을 새 초안으로 복제" style={{ height: 38 }}><Copy size={17} /><span className="exam-btn-label">복제</span></button>}
            <button className="btn btn-ghost" onClick={onSave} style={{ height: 38 }}><Save size={17} /><span className="exam-btn-label">저장</span></button>
            <button className="btn btn-ghost" onClick={onClasscardCopy} title="클래스카드 붙여넣기용으로 복사" aria-label="클래스카드 붙여넣기용으로 복사" style={{ height: 38 }}><Copy size={17} /><span className="exam-btn-label">클래스카드 복사</span></button>
            <button className="btn btn-primary" onClick={onDistribute} style={{ height: 38 }}><QrCode size={17} color="#fff" /><span className="exam-btn-label">시험 배포</span></button>
          </div>
        </div>
      </div>

      <div className="exam-pagepad" style={{ maxWidth: 840, margin: '0 auto', padding: '26px 44px 60px' }}>
        <div className="card fade-up" style={{ padding: 30, marginBottom: 18, boxShadow: 'var(--shadow-md)', background: 'linear-gradient(135deg,#ffffff,#f3faf6)' }}>
          <div className="badge" style={{ background: 'var(--mint-light)', color: 'var(--primary)', marginBottom: 10 }}>{exam.target}</div>
          <h1 className="h-font" style={{ fontSize: 27, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-.01em', lineHeight: 1.25 }}>{exam.name}</h1>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>{exam.topic}</p>
          <div style={{ display: 'flex', gap: 30, marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <MetaPill icon={<FileText size={17} color="var(--primary-light)" />} label="문항" value={`${exam.questions.length}문항`} />
            <MetaPill icon={<Gauge size={17} color="var(--primary-light)" />} label="총점" value={`${total}점`} />
            <MetaPill icon={<Calendar size={17} color="var(--primary-light)" />} label="출제일" value={exam.date} />
            <MetaPill icon={<Gauge size={17} color="var(--primary-light)" />} label="난이도" value={exam.difficulty} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 16px', borderRadius: 12, marginBottom: 18, background: reveals ? '#f3faf6' : '#eef4fb', border: '1px solid ' + (reveals ? '#c7ecd9' : '#cfe0f5') }}>
          {reveals ? <GraduationCap size={17} color="var(--primary)" /> : <Eye size={17} color="var(--info)" />}
          <span style={{ fontSize: 13.5, fontWeight: 600, color: reveals ? 'var(--primary)' : 'var(--info)' }}>{mode === 'student' ? '학생용 보기 — 정답과 해설이 숨겨져 있어요.' : (reveal ? '선생님용 보기 — 정답·해설이 표시됩니다.' : '선생님용 보기 — “정답 보기”를 켜면 정답이 표시돼요.')}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 16px', borderRadius: 12, marginBottom: 18, background: qualityIssues.length > 0 ? '#fffbeb' : '#f3faf6', border: `1px solid ${qualityIssues.length > 0 ? '#f4cf8e' : '#c7ecd9'}` }}>
          {qualityIssues.length > 0 ? <AlertTriangle size={17} color="#b45309" /> : <CheckCircle2 size={17} color="var(--success)" />}
          <span style={{ fontSize: 13.5, fontWeight: 650, color: qualityIssues.length > 0 ? '#92400e' : 'var(--primary)' }}>
            {qualityIssues.length > 0 ? `자동 검수: 오류 ${qualityErrorCount}개 · 확인 ${qualityIssues.length - qualityErrorCount}개` : '자동 검수 완료: 발견된 구조 오류가 없습니다.'}
          </span>
        </div>

        {exam.questions.map((q, i) => (
          <div id={'q-' + q.id} key={q.id}>
            <QuestionCard q={q} n={i + 1} reveal={reveals} editing={editId === q.id} highlight={q.id === newId}
              qualityIssues={qualityIssues.filter(issue => issue.questionIndex === i)}
              onEdit={() => setEditId(id => id === q.id ? null : q.id)} onChange={changeQ} onDelete={() => delQ(q.id)} />
          </div>
        ))}
      </div>

      {/* AI 편집 스튜디오 dock — 모바일에서는 기본 접힘 */}
      <div className="studio-dock">
        <div style={{ maxWidth: 840, margin: '0 auto' }}>
          {isMobile && !dockOpen ? (
            <button onClick={() => setDockOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none', background: 'transparent', padding: '2px 0' }}>
              <div style={{ width: 28, height: 28, borderRadius: 9, background: 'linear-gradient(150deg,#2c6f52,#10b981)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Sparkles size={15} color="#fff" /></div>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>AI로 문제 편집하기</span>
              <ChevronDown size={18} color="#9fcfb4" style={{ marginLeft: 'auto', transform: 'rotate(180deg)' }} />
            </button>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
                <div style={{ width: 28, height: 28, borderRadius: 9, background: 'linear-gradient(150deg,#2c6f52,#10b981)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{busy ? <div className="spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%' }} /> : <Sparkles size={15} color="#fff" />}</div>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#cfe7da', fontWeight: 500, lineHeight: 1.4 }}>AI 편집 대화</span>
                {isMobile && <button onClick={() => setDockOpen(false)} title="접기" style={{ flexShrink: 0, border: 'none', background: 'transparent', display: 'grid', placeItems: 'center', width: 28, height: 28 }}><ChevronDown size={18} color="#9fcfb4" /></button>}
              </div>
              <div className="dock-chat-log" role="log" aria-live="polite">
                {chatMessages.map(message => (
                  <div key={message.id} className={`dock-msg ${message.role}${message.pending ? ' pending' : ''}${message.error ? ' error' : ''}`}>
                    <MarkdownText text={message.text} />
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="dock-chip-row">
                {chips.map((c, i) => <button key={i} className="dock-chip" onClick={() => runChip(c)} disabled={busy && c.act !== 'reveal'}>{c.icon}{c.label}</button>)}
              </div>
              <div className="dock-compose">
                <textarea
                  className="dock-input dock-textarea"
                  value={dockText}
                  onChange={e => setDockText(e.target.value)}
                  placeholder="예: 3번 문제를 더 쉽게 바꿔줘 / 독해 2문항 추가해줘"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      onDockSend();
                    }
                  }}
                  disabled={busy}
                />
                <button className="dock-send" onClick={onDockSend} disabled={busy || !dockText.trim()}><Send size={20} color="#06281a" /></button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const pmI: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', borderRadius: 10, padding: '10px 11px' };
const pmT: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: 'var(--text)' };
const pmS: React.CSSProperties = { fontSize: 12, color: 'var(--muted)' };

// ===========================================================================
// 인쇄 뷰
// ===========================================================================
function PrintView({ exam, mode }: { exam: Exam; mode: 'student' | 'teacher' }) {
  const isTeacher = mode === 'teacher';
  const total = exam.questions.reduce((s, q) => s + q.points, 0);
  return (
    <div className="exam-print-doc preview-on">
      <div className="print-page">
        <div className="pr-head">
          <div className="pr-head-top">
            <div className="pr-brand">Growing · 그로잉영어 교습소</div>
            <div className="pr-kind">{isTeacher ? '정답 및 해설 (선생님용)' : '시험지 (학생용)'}</div>
          </div>
          <h1 className="pr-title">{exam.name}</h1>
          <div className="pr-meta">
            <span>대상 <b>{exam.target}</b></span>
            <span>범위 <b>{exam.topic}</b></span>
            <span>총점 <b>{total}점</b></span>
            <span>난이도 <b>{exam.difficulty}</b></span>
            <span>출제일 <b>{exam.date}</b></span>
          </div>
          {!isTeacher && (
            <div className="pr-namebar">
              <span>학년 / 반 ____________</span>
              <span>이름 ____________</span>
              <span>점수 ________ / {total}</span>
            </div>
          )}
        </div>

        <ol className="pr-qlist">
          {exam.questions.map((q, i) => (
            <li key={q.id} className="pr-q">
              <div className="pr-q-head">
                <span className="pr-q-num">{i + 1}</span>
                <span className="pr-q-type">[{TYPE_META[q.type].label}]</span>
                <span className="pr-q-prompt"><MarkdownText text={q.prompt} /></span>
                <span className="pr-q-pts">({q.points}점)</span>
              </div>
              {q.passage && <div className="pr-passage"><MarkdownText text={q.passage} /></div>}
              {q.choices ? (
                <div className="pr-choices">
                  {q.choices.map((c, ci) => (
                    <span key={ci} className={'pr-choice' + (isTeacher && ci === choiceAnswerIndex(q.answer) ? ' pr-correct' : '')}>{CIRC[ci]} <MarkdownText text={c} /></span>
                  ))}
                </div>
              ) : (isTeacher ? null : <div className="pr-write" />)}
              {isTeacher && (
                <div className="pr-ans">
                  <span className="pr-ans-tag">정답</span>
                  <span className="pr-ans-val">{q.choices ? <ChoiceAnswerText choices={q.choices} answer={q.answer} fallback="(정답 없음)" /> : <MarkdownText text={String(q.answer)} />}</span>
                  {q.explanation && <span className="pr-ans-exp"><b>해설</b> <MarkdownText text={q.explanation} /></span>}
                </div>
              )}
            </li>
          ))}
        </ol>

        <div className="pr-foot">Growing · 그로잉영어 교습소 — {exam.name}</div>
      </div>
    </div>
  );
}

// ===========================================================================
// 화면 4: 시험 배포 (QR + 응시코드 + 실시간 현황)
// ===========================================================================
function Distribute({ exam, published, code, roster, onToggleStatus, submissions, onGoResults, onRefresh, onGoStudent, flash }: { exam: Exam; published: boolean; code: string; roster: RosterStudent[]; onToggleStatus: () => void; submissions: Submission[]; onGoResults: () => void | Promise<void>; onRefresh: () => void | Promise<void>; onGoStudent: () => void; flash: (m: string) => void }) {
  const joinUrl = `${window.location.origin}${window.location.pathname}#/exam/${code}`;
  const isMobile = useIsMobile();
  const rosterList = roster;
  const submittedNos = new Set(submissions.map(s => s.no));
  const doneCount = submittedNos.size;
  const avg = submissions.length ? Math.round(submissions.reduce((a, s) => a + s.score, 0) / submissions.length) : 0;

  return (
    <div className="fade-up exam-pagepad" style={{ maxWidth: 960, margin: '0 auto', padding: '40px 44px 60px' }}>
      <div style={{ marginBottom: 22 }}>
        <div className="badge" style={{ background: 'var(--mint-light)', color: 'var(--primary)', marginBottom: 12 }}><QrCode size={13} /> 시험 배포</div>
        <h1 className="h-font exam-h1" style={{ fontSize: 32, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-.02em' }}>{exam.name}</h1>
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 15 }}>학생은 QR 코드나 응시코드로 <b style={{ color: 'var(--primary)' }}>로그인 없이</b> 태블릿에서 바로 시작해요.</p>
      </div>

      <div className="exam-distgrid" style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 18, alignItems: 'start' }}>
        {/* QR 카드 */}
        <div className="card" style={{ padding: 28, boxShadow: 'var(--shadow-md)', textAlign: 'center', position: isMobile ? 'static' : 'sticky', top: 20 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 14px', borderRadius: 999, marginBottom: 18, background: published ? 'var(--mint-light)' : '#f3f4f6', color: published ? 'var(--primary)' : 'var(--muted)', fontSize: 13, fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: published ? 'var(--mint)' : 'var(--muted)', boxShadow: published ? '0 0 0 4px rgba(16,185,129,.18)' : 'none' }} />
            {published ? '응시 진행 중' : '마감됨'}
          </div>

          <div style={{ width: 304, maxWidth: '100%', margin: '0 auto 18px', position: 'relative', filter: published ? 'none' : 'grayscale(1) opacity(.45)', transition: 'filter .2s' }}>
            <div style={{ padding: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow-sm)' }}>
              <img src={getQrImageUrl(joinUrl)} alt={`${exam.name} 응시 QR`} style={{ width: 280, height: 280, maxWidth: '100%', display: 'block' }} />
            </div>
            {!published && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><div style={{ background: 'rgba(15,46,33,.86)', color: '#fff', fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 999 }}>마감됨</div></div>}
          </div>

          <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>응시코드</div>
          <div className="code-pill">{code}</div>
          <button onClick={() => { void copyText(joinUrl).then(() => flash('응시 링크를 복사했어요')).catch(e => flash(errMsg(e))); }} className="btn btn-ghost" style={{ width: '100%', marginTop: 14, justifyContent: 'space-between' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Link2 size={16} /> {joinUrl}</span><Copy size={16} />
          </button>

          <button onClick={onToggleStatus} className="btn" style={{ width: '100%', marginTop: 10, height: 48, background: published ? '#fff' : 'var(--primary)', color: published ? 'var(--danger)' : '#fff', border: '1px solid ' + (published ? '#f3d4d4' : 'var(--primary)') }}>
            {published ? <><Square size={16} color="var(--danger)" /> 시험 마감</> : <><Play size={15} color="#fff" /> 시험 시작</>}
          </button>
          <button onClick={onGoStudent} className="btn btn-soft" style={{ width: '100%', marginTop: 8 }}><Tablet size={16} color="var(--primary)" /> 학생 화면으로 응시해보기</button>
        </div>

        {/* 실시간 현황 */}
        <div className="card" style={{ padding: 24, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <div>
              <div className="h-font" style={{ fontSize: 18, fontWeight: 700 }}>응시 현황</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>실시간으로 제출이 들어와요</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
              <div style={{ textAlign: 'right' }}><div className="num-font" style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>{doneCount}<span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 600 }}>/{rosterList.length}</span></div><div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>제출</div></div>
              <div style={{ textAlign: 'right' }}><div className="num-font" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{avg}<span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 600 }}>점</span></div><div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>평균</div></div>
            </div>
          </div>

          <div style={{ height: 8, background: '#eef3ef', borderRadius: 99, overflow: 'hidden', marginBottom: 18 }}>
            <div style={{ height: '100%', width: `${rosterList.length ? doneCount / rosterList.length * 100 : 0}%`, background: 'linear-gradient(90deg,#84cc16,#10b981)', borderRadius: 99, transition: 'width .5s' }} />
          </div>

          <div>
            {rosterList.length === 0 && (
              <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--muted)', fontSize: 14, fontWeight: 600 }}>
                반 학생 명단이 비어 있어요.
              </div>
            )}
            {rosterList.map(st => {
              const sub = submissions.find(s => s.no === st.no);
              const done = !!sub;
              const pct = sub ? submissionPct(sub) : 0;
              return (
                <div key={st.no} className="sub-row">
                  <div className="sub-av" style={{ background: done ? 'var(--mint-light)' : '#f1f3f2', color: done ? 'var(--primary)' : 'var(--muted)' }}>{st.name[0]}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)' }}>{st.name} <span className="num-font" style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· {st.no}번</span></div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{done ? `제출 ${sub!.time}` : '아직 풀고 있어요'}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    {done
                      ? <span className="num-font" style={{ fontSize: 15, fontWeight: 800, color: pct >= 80 ? 'var(--primary)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)' }}>{sub!.score}점</span>
                      : <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', background: '#f1f3f2', padding: '4px 10px', borderRadius: 999 }}>미제출</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)', gap: 10, marginTop: 18 }}>
            <button onClick={() => void onRefresh()} className="btn btn-soft" style={{ width: '100%' }}><RotateCw size={16} color="var(--primary)" /> 현황 새로고침</button>
            <button onClick={() => void onGoResults()} className="btn btn-primary" style={{ width: '100%' }}><BarChart3 size={17} color="#fff" /> 결과 자세히 보기</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// 화면 5: 결과 (대시보드 + 개별 상세 + 학부모 안내문)
// ===========================================================================
function Ring({ score, totalPoints = 100, size = 92, stroke = 9 }: { score: number; totalPoints?: number; size?: number; stroke?: number }) {
  const pct = scorePct(score, totalPoints);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  const col = pct >= 80 ? 'var(--mint)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef3ef" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset .7s cubic-bezier(.22,.61,.36,1)' }} />
    </svg>
  );
}

function ParentGuideModal({ exam, sub, onClose, onSendGuideToMessaging }: { exam: Exam; sub: Submission; onClose: () => void; onSendGuideToMessaging?: (content: string) => void }) {
  const canCreateResultLink = Boolean(sub.id && isSavedId(exam.id));
  const buildGuideText = async () => {
    let resultUrl = '';
    if (canCreateResultLink && sub.id) {
      const token = await examsApi.createResultLink(exam.id, sub.id);
      resultUrl = `${window.location.origin}${window.location.pathname}#/exam-result/${token}`;
    }
    return [
      `${sub.name} 학생, ${exam.name} 결과 안내드립니다.`,
      `점수: ${sub.score}/${sub.totalPoints}점`,
      `응시일: ${exam.date}`,
      resultUrl ? `결과 상세: ${resultUrl}` : '문항별 정오표와 해설은 선생님 안내 화면에서 확인해 주세요.',
    ].join('\n');
  };

  const copyGuide = async () => {
    try {
      const text = await buildGuideText();
      await copyText(text);
      onClose();
    } catch (e) {
      alert(errMsg(e));
    }
  };

  const copyAndOpenMessaging = async () => {
    try {
      const text = await buildGuideText();
      await copyText(text);
      onClose();
      onSendGuideToMessaging?.(text);
    } catch (e) {
      alert(errMsg(e));
    }
  };

  return createPortal((
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(15,46,33,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} className="exam-app slide-in" style={{ width: 'min(420px, 100%)', background: '#fff', borderRadius: 22, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fee500', display: 'grid', placeItems: 'center' }}><MessageCircle size={19} color="#3c1e1e" /></div>
          <div style={{ minWidth: 0 }}><div className="h-font" style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap' }}>학부모 안내문 미리보기</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{sub.name} 학부모님께 직접 전달할 초안</div></div>
          <button onClick={onClose} className="btn btn-ghost btn-icon" style={{ marginLeft: 'auto' }}><X size={16} /></button>
        </div>
        <div style={{ padding: 24, background: '#b2c7d9' }}>
          <div style={{ background: '#fff', borderRadius: '4px 16px 16px 16px', padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, background: 'linear-gradient(150deg,#2c6f52,#10b981)', display: 'grid', placeItems: 'center' }}><Sprout size={14} color="#fff" /></div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Growing 그로잉영어</span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>
              <b>{sub.name}</b> 학생, <b>{exam.name}</b> 결과를 안내드립니다.<br />
              · 점수 <b style={{ color: 'var(--primary)' }}>{sub.score}점</b> / {sub.totalPoints}점<br />
              · 응시일 {exam.date}<br /><br />
              {canCreateResultLink ? '안내문에는 문항별 정오와 해설을 확인할 수 있는 결과 링크가 포함됩니다.' : '문항별 정오와 해설은 선생님 안내 화면에서 확인해 주세요.'}
            </div>
            <div style={{ marginTop: 14, padding: '12px', textAlign: 'center', background: 'var(--mint-light)', borderRadius: 10, fontSize: 13.5, fontWeight: 700, color: 'var(--primary)' }}>{canCreateResultLink ? '결과 상세 링크 포함' : '안내문 초안 복사'}</div>
          </div>
        </div>
        <div style={{ padding: '16px 24px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: '1 1 88px' }}>취소</button>
          <button onClick={() => void copyGuide()} className="btn btn-primary" style={{ flex: '2 1 150px' }}><Copy size={16} color="#fff" /> 안내문 복사</button>
          {onSendGuideToMessaging && <button onClick={() => void copyAndOpenMessaging()} className="btn btn-soft" style={{ flex: '2 1 150px' }}><MessageCircle size={16} color="var(--primary)" /> 메시징 초안으로</button>}
        </div>
      </div>
    </div>
  ), document.body);
}

function ResultDetail({ exam, sub, onBack, onGradeUpdate, onSendGuideToMessaging }: { exam: Exam; sub: Submission; onBack: () => void; onGradeUpdate: (sub: Submission, question: Question, gainedPoints: number) => Promise<void>; onSendGuideToMessaging?: (content: string) => void }) {
  const [modal, setModal] = useState(false);
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, string>>({});
  const [savingGradeId, setSavingGradeId] = useState<string | null>(null);

  const saveGrade = async (question: Question, current: PerQ) => {
    const raw = gradeDrafts[question.id] ?? String(current.gained ?? (current.correct ? question.points : 0));
    const next = Math.max(0, Math.min(question.points, Math.round(Number(raw))));
    if (!Number.isFinite(next)) return;
    setSavingGradeId(question.id);
    try {
      await onGradeUpdate(sub, question, next);
    } finally {
      setSavingGradeId(null);
    }
  };

  return (
    <div className="fade-up exam-pagepad" style={{ maxWidth: 820, margin: '0 auto', padding: '28px 44px 60px' }}>
      <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 18, height: 38, paddingLeft: 10 }}><ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} /> 결과 목록</button>

      <div className="card" style={{ padding: 28, marginBottom: 18, boxShadow: 'var(--shadow-md)', display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap', background: 'linear-gradient(135deg,#ffffff,#f3faf6)' }}>
        <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
          <Ring score={sub.score} totalPoints={sub.totalPoints} />
          <div style={{ position: 'absolute', textAlign: 'center' }}><div className="ring-num" style={{ fontSize: 26, color: 'var(--text)' }}>{sub.score}</div><div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>/ {sub.totalPoints}</div></div>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="badge" style={{ background: 'var(--mint-light)', color: 'var(--primary)', marginBottom: 8 }}>{exam.target} · {sub.no}번</div>
          <h1 className="h-font" style={{ fontSize: 26, fontWeight: 700, margin: '0 0 4px' }}>{sub.name}</h1>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>{exam.name} · 제출 {sub.time}</p>
        </div>
        <button onClick={() => setModal(true)} className="btn btn-primary" style={{ height: 46 }}><MessageCircle size={17} color="#fff" /> 학부모 안내문 만들기</button>
      </div>

      {exam.questions.map((q, i) => {
        const pq = sub.perQ[q.id] ?? emptyPerQ(q);
        const ok = pq.correct, partial = pq.partial;
        return (
          <div key={q.id} className="card graded-paper" style={{ padding: 24, marginBottom: 14, boxShadow: 'var(--shadow-sm)', borderLeft: '4px solid ' + (ok ? 'var(--mint)' : partial ? 'var(--warning)' : 'var(--danger)') }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div className="num-font h-font" style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700 }}>{i + 1}</div>
              <span className={'badge ' + TYPE_META[q.type].cls}>{TYPE_META[q.type].label}</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: ok ? 'var(--success)' : partial ? 'var(--warning)' : 'var(--danger)' }}>
                {ok ? '정답' : partial ? `부분 정답 ${pq.gained}/${q.points}점` : '오답'}
              </span>
              {sub.id && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
                  점수
                  <input
                    type="number"
                    min={0}
                    max={q.points}
                    value={gradeDrafts[q.id] ?? String(pq.gained ?? (ok ? q.points : 0))}
                    onChange={e => setGradeDrafts(prev => ({ ...prev, [q.id]: e.target.value }))}
                    style={{ width: 58, height: 30, border: '1px solid var(--border)', borderRadius: 8, padding: '0 8px', fontWeight: 800 }}
                  />
                  <button className="btn btn-soft" style={{ height: 30, padding: '0 10px', fontSize: 12 }} disabled={savingGradeId === q.id} onClick={() => void saveGrade(q, pq)}>
                    수정
                  </button>
                </label>
              )}
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 14.5, lineHeight: 1.55, color: 'var(--text)', fontWeight: 500, whiteSpace: 'pre-line' }}><MarkdownText text={q.prompt} /></p>

            <div className="exam-col2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ padding: '11px 14px', borderRadius: 11, background: ok ? '#f3faf6' : '#fef2f2', border: '1px solid ' + (ok ? '#c7ecd9' : '#f3d4d4') }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>학생 답</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: ok ? 'var(--primary)' : 'var(--danger)' }}>{q.choices ? <ChoiceAnswerText choices={q.choices} answer={pq.answer} /> : <MarkdownText text={String(pq.answer)} />}</div>
              </div>
              <div style={{ padding: '11px 14px', borderRadius: 11, background: '#f3faf6', border: '1px solid #c7ecd9' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>정답</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)' }}>{q.choices ? <ChoiceAnswerText choices={q.choices} answer={q.answer} fallback="(정답 없음)" /> : <MarkdownText text={String(q.answer)} />}</div>
              </div>
            </div>

            {pq.type === 'write' && pq.feedback && (
              <div style={{ marginTop: 12, display: 'flex', gap: 9, padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 11 }}>
                <Sparkles size={16} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
                <div><span style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>{pq.gradedBy === 'ai' ? 'AI 초안 채점 · 선생님 확인 권장 · ' : '자동 첨삭 · '}</span><span style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.55 }}>{pq.feedback}</span></div>
              </div>
            )}
            {q.explanation && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}><span style={{ fontWeight: 700, fontSize: 12, color: 'var(--mint)', flexShrink: 0, marginTop: 2 }}>해설</span><span style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-2)' }}><MarkdownText text={q.explanation} /></span></div>
            )}
          </div>
        );
      })}
      {modal && <ParentGuideModal exam={exam} sub={sub} onClose={() => setModal(false)} onSendGuideToMessaging={onSendGuideToMessaging} />}
    </div>
  );
}

function Results({ exam, submissions, onParentPreview, onRefresh, onGradeUpdate, onSendGuideToMessaging }: { exam: Exam; submissions: Submission[]; onParentPreview: () => void; onRefresh: () => void | Promise<void>; onGradeUpdate: (sub: Submission, question: Question, gainedPoints: number) => Promise<void>; onSendGuideToMessaging?: (content: string) => void }) {
  const isMobile = useIsMobile();
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const detail = detailKey ? submissions.find(sub => (sub.id ?? `no-${sub.no}`) === detailKey) ?? null : null;

  if (detail) return <ResultDetail exam={exam} sub={detail} onBack={() => setDetailKey(null)} onGradeUpdate={onGradeUpdate} onSendGuideToMessaging={onSendGuideToMessaging} />;

  const scores = submissions.map(s => s.score);
  const scoreRates = submissions.map(submissionPct);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const hi = scores.length ? Math.max(...scores) : 0;
  const lo = scores.length ? Math.min(...scores) : 0;

  const buckets: [string, number, number][] = [['~59', 0, 59], ['60~69', 60, 69], ['70~79', 70, 79], ['80~89', 80, 89], ['90~100', 90, 100]];
  const counts = buckets.map(([, lo2, hi2]) => scoreRates.filter(s => s >= lo2 && s <= hi2).length);
  const maxC = Math.max(1, ...counts);

  const qRates = exam.questions.map(q => {
    const arr = submissions.map(s => s.perQ[q.id]);
    const fullOk = arr.filter(p => p && p.correct).length;
    const rate = submissions.length ? Math.round(fullOk / submissions.length * 100) : 0;
    return { q, rate };
  });

  const kpis: [string, string, React.ReactNode][] = [
    ['반 평균', avg + '점', <Gauge size={16} color="var(--primary)" />],
    ['최고점', hi + '점', <Award size={16} color="var(--mint)" />],
    ['최저점', lo + '점', <TrendingUp size={16} color="var(--warning)" />],
    ['응시', submissions.length + '명', <Users size={16} color="var(--info)" />],
  ];

  return (
    <div className="fade-up exam-pagepad" style={{ maxWidth: 960, margin: '0 auto', padding: '40px 44px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="badge" style={{ background: 'var(--mint-light)', color: 'var(--primary)', marginBottom: 12 }}><BarChart3 size={13} /> 결과</div>
          <h1 className="h-font exam-h1" style={{ fontSize: 32, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-.02em' }}>{exam.name}</h1>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 15 }}>{exam.target} · 응시 {submissions.length}명 · 자동 채점 완료</p>
        </div>
        <button className="btn btn-soft" onClick={() => void onRefresh()} style={{ height: 42 }}><RotateCw size={16} color="var(--primary)" /> 결과 새로고침</button>
        <button className="btn btn-ghost" onClick={onParentPreview} disabled={submissions.length === 0} style={{ height: 42, opacity: submissions.length === 0 ? 0.45 : 1, cursor: submissions.length === 0 ? 'not-allowed' : 'pointer' }}><MessageCircle size={16} /> 학부모 안내 페이지</button>
      </div>

      <div className="exam-kpigrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        {kpis.map(([lb, v, ic]) => (
          <div key={lb} className="kpi">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><div style={{ width: 30, height: 30, borderRadius: 9, background: '#f3faf6', display: 'grid', placeItems: 'center' }}>{ic}</div><span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{lb}</span></div>
            <div className="num-font" style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)' }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="exam-col2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18, alignItems: 'start' }}>
        <div className="card" style={{ padding: 24, boxShadow: 'var(--shadow-sm)' }}>
          <div className="h-font" style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>점수 분포</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 18 }}>구간별 학생 수</div>
          <div className="dist-bar">
            {buckets.map(([lb], i) => (
              <div key={lb} className="dist-col">
                <div className="num-font" style={{ fontSize: 13, fontWeight: 700, color: counts[i] ? 'var(--primary)' : 'var(--muted)' }}>{counts[i]}</div>
                <div className="dist-fill" style={{ height: `${counts[i] / maxC * 96}px`, opacity: counts[i] ? 1 : 0.25 }} />
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{lb}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 24, boxShadow: 'var(--shadow-sm)' }}>
          <div className="h-font" style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>문항별 정답률</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>어디서 많이 틀렸는지 한눈에</div>
          <div>
            {qRates.map(({ q, rate }, i) => {
              const col = rate >= 70 ? 'var(--mint)' : rate >= 40 ? 'var(--warning)' : 'var(--danger)';
              return (
                <div key={q.id} className="qrate-row" style={{ borderBottom: i === qRates.length - 1 ? 'none' : '1px solid var(--border)' }}>
                  <span className="num-font" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', width: 22, flexShrink: 0 }}>{i + 1}</span>
                  <span className={'badge ' + TYPE_META[q.type].cls} style={{ fontSize: 10.5, padding: '2px 7px', flexShrink: 0 }}>{TYPE_META[q.type].label}</span>
                  <div className="qrate-track"><div className="qrate-fill" style={{ width: rate + '%', background: col }} /></div>
                  <span className="num-font" style={{ fontSize: 13, fontWeight: 800, color: col, width: 38, textAlign: 'right', flexShrink: 0 }}>{rate}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 22, boxShadow: 'var(--shadow-sm)' }}>
        <div className="h-font" style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, paddingLeft: 4 }}>응시자별 점수 <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>· 눌러서 개별 결과 보기</span></div>
        {submissions.length === 0 && (
          <div style={{ padding: '30px 12px', textAlign: 'center', color: 'var(--muted)', fontSize: 14, fontWeight: 600 }}>
            아직 제출된 답안이 없어요.
          </div>
        )}
        {[...submissions].sort((a, b) => submissionPct(b) - submissionPct(a)).map((s, i) => (
          <button key={s.id ?? `no-${s.no}`} onClick={() => setDetailKey(s.id ?? `no-${s.no}`)} className="sub-row" style={{ width: '100%', border: 'none', cursor: 'pointer' }}>
            <span className="num-font h-font" style={{ width: 26, fontSize: 14, fontWeight: 800, color: i === 0 ? 'var(--mint)' : 'var(--muted)', flexShrink: 0 }}>{i + 1}</span>
            <div className="sub-av" style={{ background: 'var(--mint-light)', color: 'var(--primary)' }}>{s.name[0]}</div>
            <div style={{ minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)' }}>{s.name} <span className="num-font" style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· {s.no}번</span></div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>제출 {s.time}</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ width: isMobile ? 80 : 120, height: 7, background: '#eef3ef', borderRadius: 99, overflow: 'hidden' }}><div style={{ height: '100%', width: submissionPct(s) + '%', background: submissionPct(s) >= 80 ? 'linear-gradient(90deg,#84cc16,#10b981)' : submissionPct(s) >= 60 ? 'var(--warning)' : 'var(--danger)', borderRadius: 99 }} /></div>
              <span className="num-font" style={{ fontSize: 16, fontWeight: 800, width: 48, textAlign: 'right', color: submissionPct(s) >= 80 ? 'var(--primary)' : submissionPct(s) >= 60 ? 'var(--warning)' : 'var(--danger)' }}>{s.score}점</span>
              <ChevronRight size={16} color="var(--muted)" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// 화면 6: 학생 응시 (무로그인 공개 응시)
// ===========================================================================
function gradeSubmission(exam: Exam, answers: Record<string, number | string>, student: RosterStudent): Submission {
  const perQ: Record<string, PerQ> = {};
  let score = 0;
  exam.questions.forEach(q => {
    if (q.choices) {
      const a = answers[q.id];
      const selectedIndex = choiceAnswerIndex(a);
      const correctIndex = choiceAnswerIndex(q.answer);
      const ok = selectedIndex >= 0 && correctIndex >= 0 && selectedIndex === correctIndex;
      perQ[q.id] = { correct: ok, answer: selectedIndex, type: 'mcq', gradedBy: 'auto' };
      if (ok) score += q.points;
    } else {
      const txt = String(answers[q.id] ?? '').trim();
      const ans = String(q.answer ?? '');
      const ok = txt.toLowerCase().replace(/[.\s]+$/, '') === ans.toLowerCase().replace(/[.\s]+$/, '');
      const pts = ok ? q.points : (txt ? Math.round(q.points * 0.5) : 0);
      perQ[q.id] = { correct: ok, partial: !ok && !!txt, gained: pts, answer: txt || '(미응답)', feedback: ok ? null : '정답 문장과 비교해 어순·표현을 다시 확인해 보세요.', type: 'write', gradedBy: 'auto' };
      score += pts;
    }
  });
  return { no: student.no, name: student.name, time: new Date().toTimeString().slice(0, 5), score, totalPoints: exam.questions.reduce((sum, q) => sum + q.points, 0), perQ, submitted: true };
}

type StudentStage = 'enter' | 'identify' | 'solve' | 'confirm' | 'done';

function StudentApp({
  exam,
  published,
  submissions,
  roster = ROSTER,
  code = SHORT_CODE,
  joinUrl = JOIN_URL,
  showExit = true,
  onSubmit,
  onExit,
}: {
  exam: Exam;
  published: boolean;
  submissions: Submission[];
  roster?: RosterStudent[];
  code?: string;
  joinUrl?: string;
  showExit?: boolean;
  onSubmit: (s: Submission, answers: Record<string, number | string>, student: RosterStudent) => void | Promise<void>;
  onExit: () => void;
}) {
  const isMobile = useIsMobile();
  const [stage, setStage] = useState<StudentStage>('enter');
  const [student, setStudent] = useState<RosterStudent | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const land = !isMobile;

  const q = exam.questions[idx];
  const answered = exam.questions.filter(qq => answers[qq.id] != null && answers[qq.id] !== '').length;

  const setAns = (val: number | string) => setAnswers(a => ({ ...a, [q.id]: val }));
  const goIdx = (n: number) => { setIdx(n); if (scrollRef.current) scrollRef.current.scrollTop = 0; };

  const submit = () => {
    if (!student || submitting) return;
    setSubmitting(true);
    const submission = gradeSubmission(exam, answers, student);
    void Promise.resolve(onSubmit(submission, answers, student))
      .then(() => setStage('done'))
      .catch(error => alert(errMsg(error)))
      .finally(() => setSubmitting(false));
  };
  const restart = () => { setStage('enter'); setStudent(null); setIdx(0); setAnswers({}); setSubmitting(false); };

  let body: React.ReactNode;
  if (stage === 'enter') {
    body = (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 30, background: 'linear-gradient(160deg,#0f3023,#1b4b36 70%,#2c6f52)' }}>
        <div style={{ textAlign: 'center', color: '#fff', maxWidth: 460 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, margin: '0 auto 22px', background: 'rgba(255,255,255,.14)', display: 'grid', placeItems: 'center' }}><Sprout size={34} color="#fff" /></div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#9fd3b8', letterSpacing: '.04em', marginBottom: 10 }}>GROWING 온라인 시험</div>
          <h1 className="h-font" style={{ fontSize: 34, fontWeight: 700, margin: '0 0 12px', letterSpacing: '-.02em' }}>{exam.name.split('—').pop()!.trim()}</h1>
          <div style={{ display: 'inline-flex', gap: 22, padding: '14px 26px', background: 'rgba(255,255,255,.1)', borderRadius: 16, marginBottom: 26 }}>
            <div><div className="num-font" style={{ fontSize: 22, fontWeight: 800 }}>{exam.questions.length}</div><div style={{ fontSize: 12, color: '#bfe3d1' }}>문항</div></div>
            <div style={{ width: 1, background: 'rgba(255,255,255,.18)' }} />
            <div><div className="num-font" style={{ fontSize: 22, fontWeight: 800 }}>{exam.questions.reduce((s, x) => s + x.points, 0)}</div><div style={{ fontSize: 12, color: '#bfe3d1' }}>점</div></div>
            <div style={{ width: 1, background: 'rgba(255,255,255,.18)' }} />
            <div><div className="num-font h-font" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '.08em' }}>{code}</div><div style={{ fontSize: 12, color: '#bfe3d1' }}>응시코드</div></div>
          </div>
          {published ? (
            <div><button onClick={() => setStage('identify')} className="btn btn-lg" style={{ background: 'var(--mint)', color: '#06281a', fontSize: 18, height: 60, padding: '0 40px', boxShadow: '0 10px 30px rgba(16,185,129,.4)' }}><Hand size={20} color="#06281a" /> 시험 시작하기</button></div>
          ) : (
            <div style={{ padding: '16px 24px', background: 'rgba(255,255,255,.1)', borderRadius: 14, fontSize: 15, color: '#bfe3d1', fontWeight: 600 }}><Lock size={18} color="#bfe3d1" style={{ verticalAlign: -3, marginRight: 6 }} />선생님이 아직 시험을 시작하지 않았어요</div>
          )}
          <div style={{ marginTop: 22, fontSize: 12.5, color: '#7fb89e' }}>{joinUrl} · 로그인 없이 바로 응시</div>
        </div>
      </div>
    );
  } else if (stage === 'identify') {
    const submittedNos = new Set(submissions.map(s => s.no));
    body = (
      <div style={{ height: '100%', overflowY: 'auto', padding: land ? '36px 48px' : '32px 28px' }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <User size={30} color="var(--primary-light)" style={{ marginBottom: 8 }} />
          <h2 className="h-font" style={{ fontSize: 26, fontWeight: 700, margin: '0 0 6px' }}>본인 이름을 선택하세요</h2>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 15 }}>{exam.target} 명단 · 출석번호 순</p>
        </div>
        {roster.length === 0 ? (
          <div className="card" style={{ maxWidth: 520, margin: '0 auto', padding: 26, textAlign: 'center', color: 'var(--text-2)', fontWeight: 600, boxShadow: 'var(--shadow-sm)' }}>
            응시 명단이 비어 있어요. 선생님께 명단 확인을 요청해 주세요.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: land ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 12, maxWidth: 640, margin: '0 auto' }}>
            {roster.map(st => {
              const done = st.submitted || submittedNos.has(st.no);
              return (
                <button key={st.no} disabled={done} onClick={() => { setStudent(st); setStage('solve'); }} className="t-opt" style={{ padding: '18px 18px', opacity: done ? 0.5 : 1, cursor: done ? 'not-allowed' : 'pointer' }}>
                  <div className="t-opt-mark num-font" style={{ width: 36, height: 36, fontSize: 15 }}>{st.no}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="h-font" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{st.name}</div>
                    {done && <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>제출 완료</div>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div style={{ textAlign: 'center', marginTop: 22, fontSize: 13, color: 'var(--muted)' }}>이름이 없나요? 선생님께 출석번호를 확인해 주세요.</div>
      </div>
    );
  } else if (stage === 'solve') {
    const isLast = idx === exam.questions.length - 1;
    body = (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flexShrink: 0, padding: land ? '16px 36px' : '14px 22px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,.8)', backdropFilter: 'blur(8px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(150deg,#2c6f52,#10b981)', display: 'grid', placeItems: 'center' }}><Sprout size={17} color="#fff" /></div>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{student?.name}</span>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>· {exam.target}</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, color: 'var(--text-2)' }}><Clock size={16} color="var(--muted)" /> 23:40</span>
              <span className="num-font" style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>{idx + 1} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>/ {exam.questions.length}</span></span>
            </div>
          </div>
          <div className="pg-dots">
            {exam.questions.map((qq, i) => <div key={qq.id} className="pg-dot" data-state={i === idx ? 'cur' : (answers[qq.id] != null && answers[qq.id] !== '') ? 'done' : ''} />)}
          </div>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: land ? '30px 48px 20px' : '26px 26px 16px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span className={'badge ' + TYPE_META[q.type].cls} style={{ fontSize: 13, padding: '5px 12px' }}>{TYPE_META[q.type].label}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{q.points}점</span>
            </div>
            {q.passage && <div style={{ background: '#f4f8f5', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', marginBottom: 18, fontSize: land ? 16 : 15, lineHeight: 1.75, color: 'var(--text-2)' }}><MarkdownText text={q.passage} /></div>}
            <p style={{ margin: '0 0 22px', fontSize: land ? 21 : 19, lineHeight: 1.55, fontWeight: 600, color: 'var(--text)', whiteSpace: 'pre-line' }}><MarkdownText text={q.prompt} /></p>

            {q.choices ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {q.choices.map((c, i) => (
                  <button key={i} className="t-opt" data-on={answers[q.id] === i} onClick={() => setAns(i)}>
                    <div className="t-opt-mark">{CIRC[i]}</div>
                    <span style={{ fontSize: land ? 18 : 16.5, fontWeight: answers[q.id] === i ? 700 : 500, color: answers[q.id] === i ? 'var(--primary)' : 'var(--text)' }}><MarkdownText text={c} /></span>
                    {answers[q.id] === i && <CheckCircle2 size={24} color="var(--mint)" style={{ marginLeft: 'auto' }} />}
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <textarea value={(answers[q.id] as string) || ''} onChange={e => setAns(e.target.value)} placeholder="여기에 답을 작성하세요…"
                  style={{ width: '100%', minHeight: 130, border: '2px solid var(--border)', borderRadius: 16, padding: '18px 20px', fontSize: 18, lineHeight: 1.6, fontFamily: 'inherit', resize: 'none', background: '#fff' }} />
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>문장으로 완성해서 작성해 주세요.</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ flexShrink: 0, padding: land ? '16px 48px' : '14px 26px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, background: '#fff' }}>
          <button onClick={() => goIdx(Math.max(0, idx - 1))} disabled={idx === 0} className="btn btn-ghost" style={{ height: 56, padding: '0 24px', fontSize: 16, borderRadius: 16, opacity: idx === 0 ? 0.4 : 1 }}><ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} /> 이전</button>
          {isLast
            ? <button onClick={() => setStage('confirm')} className="btn btn-primary" style={{ flex: 1, height: 56, fontSize: 17, borderRadius: 16 }}><Check size={20} color="#fff" /> 제출하기</button>
            : <button onClick={() => goIdx(idx + 1)} className="btn btn-primary" style={{ flex: 1, height: 56, fontSize: 17, borderRadius: 16 }}>다음 문항 <ArrowRight size={18} color="#fff" /></button>}
        </div>
      </div>
    );
  } else if (stage === 'confirm') {
    const blank = exam.questions.length - answered;
    body = (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 30 }}>
        <div className="card" style={{ width: 'min(460px,100%)', padding: 32, textAlign: 'center', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, margin: '0 auto 18px', background: blank ? '#fffbeb' : 'var(--mint-light)', display: 'grid', placeItems: 'center' }}>{blank ? <Clock size={28} color="var(--warning)" /> : <CheckCircle2 size={30} color="var(--primary-light)" />}</div>
          <h2 className="h-font" style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>제출할까요?</h2>
          <p style={{ margin: '0 0 4px', color: 'var(--text-2)', fontSize: 15 }}><b className="num-font" style={{ color: 'var(--primary)' }}>{answered}</b> / {exam.questions.length} 문항에 답했어요.</p>
          {blank > 0 && <p style={{ margin: '0 0 18px', color: 'var(--warning)', fontSize: 13.5, fontWeight: 600 }}>아직 {blank}문항이 비어 있어요. 그래도 제출할 수 있어요.</p>}
          <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
            <button onClick={() => setStage('solve')} className="btn btn-ghost" style={{ flex: 1, height: 52, fontSize: 16, borderRadius: 14 }}>더 풀기</button>
            <button onClick={submit} disabled={submitting} className="btn btn-primary" style={{ flex: 1, height: 52, fontSize: 16, borderRadius: 14, opacity: submitting ? 0.65 : 1 }}>{submitting ? '제출 중...' : '제출하기'}</button>
          </div>
        </div>
      </div>
    );
  } else {
    body = (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 30, background: 'linear-gradient(160deg,#0f3023,#1b4b36 70%,#2c6f52)' }}>
        <div style={{ textAlign: 'center', color: '#fff', maxWidth: 420 }}>
          <div className="slide-in" style={{ width: 84, height: 84, borderRadius: 26, margin: '0 auto 22px', background: 'var(--mint)', display: 'grid', placeItems: 'center', boxShadow: '0 12px 36px rgba(16,185,129,.5)' }}><Check size={42} color="#fff" /></div>
          <h1 className="h-font" style={{ fontSize: 32, fontWeight: 700, margin: '0 0 10px' }}>제출 완료!</h1>
          <p style={{ margin: '0 0 24px', fontSize: 16, color: '#cfe7da', lineHeight: 1.6 }}>{student?.name} 학생, 수고했어요.<br />답안이 선생님께 안전하게 전달됐어요.</p>
          <div style={{ padding: '18px 24px', background: 'rgba(255,255,255,.1)', borderRadius: 16, fontSize: 14.5, color: '#bfe3d1', lineHeight: 1.6 }}>
            <Lock size={17} color="#9fd3b8" style={{ verticalAlign: -3, marginRight: 6 }} />
            점수는 선생님이 공개하면 확인할 수 있어요.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 22 }}>
            <button onClick={restart} className="btn" style={{ background: 'rgba(255,255,255,.12)', color: '#fff', height: 48, padding: '0 24px' }}><RotateCw size={16} color="#fff" /> 처음으로</button>
            {showExit && <button onClick={onExit} className="btn" style={{ background: '#fff', color: 'var(--primary)', height: 48, padding: '0 24px' }}>배포 화면으로</button>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="student-fullscreen">
      {showExit && (
      <div className="student-exitbar">
        <button className="btn btn-ghost" onClick={onExit} style={{ height: 36 }}><ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} /> 배포 화면으로</button>
      </div>
      )}
      <div className="student-screen-full">{body}</div>
    </div>
  );
}

// ===========================================================================
// 화면 7: 학부모용 읽기전용 결과 페이지 — 데모
// ===========================================================================
function PRing({ score, totalPoints = 100, size = 132, stroke = 12 }: { score: number; totalPoints?: number; size?: number; stroke?: number }) {
  const pct = scorePct(score, totalPoints);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'grid', placeItems: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fff" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.22,.61,.36,1)' }} />
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center', color: '#fff' }}>
        <div className="ring-num" style={{ fontSize: 40, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 12, color: '#bfe3d1', fontWeight: 600, marginTop: 2 }}>/ {totalPoints}점</div>
      </div>
    </div>
  );
}

function ParentResult({ exam, submissions, onExit, showExit = true }: { exam: Exam; submissions: Submission[]; onExit: () => void; showExit?: boolean }) {
  const [pickNo, setPickNo] = useState<number | null>((submissions.find(s => s.name === '윤채원') || submissions[0])?.no ?? null);
  const pick = submissions.find(s => s.no === pickNo) || submissions[0] || null;

  if (!pick) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '28px 16px 48px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', marginBottom: 16 }}>
            {showExit && <button className="btn btn-ghost" onClick={onExit} style={{ height: 36 }}><ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} /> 결과로</button>}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)', background: '#fff', border: '1px solid var(--border)', padding: '6px 13px', borderRadius: 999, boxShadow: 'var(--shadow-sm)' }}><Lock size={13} color="var(--muted)" /> 읽기 전용 · 학부모 안내</span>
          </div>
          <div className="card" style={{ padding: 30, textAlign: 'center', boxShadow: 'var(--shadow-sm)', color: 'var(--text-2)', fontWeight: 600 }}>
            아직 제출된 답안이 없어요.
          </div>
        </div>
      </div>
    );
  }
  const sub = pick;
  const correctCount = exam.questions.filter(q => sub.perQ[q.id]?.correct).length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '28px 16px 48px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', marginBottom: 16 }}>
          {showExit && <button className="btn btn-ghost" onClick={onExit} style={{ height: 36 }}><ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} /> 결과로</button>}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)', background: '#fff', border: '1px solid var(--border)', padding: '6px 13px', borderRadius: 999, boxShadow: 'var(--shadow-sm)' }}><Lock size={13} color="var(--muted)" /> 읽기전용 · 학부모 안내용</span>
        </div>

        <div style={{ display: 'flex', gap: 7, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
          {submissions.slice(0, 5).map(s => (
            <button key={s.no} onClick={() => setPickNo(s.no)} className="chip" data-on={s.no === sub.no} style={{ padding: '6px 12px', fontSize: 12.5 }}>{s.name}</button>
          ))}
        </div>

        <div style={{ borderRadius: 22, overflow: 'hidden', boxShadow: 'var(--shadow-md)', marginBottom: 18 }}>
          <div style={{ background: 'linear-gradient(150deg,#0f3023,#1b4b36 65%,#2c6f52)', padding: '28px 26px 30px', color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 20 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,.14)', display: 'grid', placeItems: 'center' }}><Sprout size={18} color="#fff" /></div>
              <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 15 }}>Growing · 그로잉영어 교습소</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <PRing score={sub.score} totalPoints={sub.totalPoints} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#9fd3b8', fontWeight: 700, marginBottom: 6 }}>{exam.target}</div>
                <div className="h-font" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25, marginBottom: 8 }}>{sub.name} 학생</div>
                <div style={{ fontSize: 14, color: '#cfe7da', lineHeight: 1.6 }}>{exam.name}<br />응시일 {exam.date}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
              <div style={{ flex: 1, background: 'rgba(255,255,255,.1)', borderRadius: 13, padding: '13px 16px' }}><div style={{ fontSize: 12, color: '#bfe3d1' }}>맞힌 문항</div><div className="num-font" style={{ fontSize: 20, fontWeight: 800 }}>{correctCount} <span style={{ fontSize: 13, color: '#9fd3b8', fontWeight: 600 }}>/ {exam.questions.length}</span></div></div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,.1)', borderRadius: 13, padding: '13px 16px' }}><div style={{ fontSize: 12, color: '#bfe3d1' }}>총점</div><div className="num-font" style={{ fontSize: 20, fontWeight: 800 }}>{sub.score}<span style={{ fontSize: 13, color: '#9fd3b8', fontWeight: 600 }}> / {sub.totalPoints}점</span></div></div>
            </div>
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', padding: '0 4px 12px' }}>문항별 결과</div>
        {exam.questions.map((q, i) => {
          const pq = sub.perQ[q.id] ?? emptyPerQ(q);
          const ok = pq.correct, partial = pq.partial;
          return (
            <div key={q.id} className="card graded-paper" style={{ padding: 20, marginBottom: 12, boxShadow: 'var(--shadow-sm)', borderLeft: '4px solid ' + (ok ? 'var(--mint)' : partial ? 'var(--warning)' : 'var(--danger)') }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11, flexWrap: 'wrap' }}>
                <div className="num-font h-font" style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13.5, fontWeight: 700 }}>{i + 1}</div>
                <span className={'badge ' + TYPE_META[q.type].cls}>{TYPE_META[q.type].label}</span>
                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: ok ? 'var(--success)' : partial ? 'var(--warning)' : 'var(--danger)' }}>
                  {ok ? '정답' : partial ? `부분 정답 ${pq.gained}/${q.points}점` : '오답'}
                </span>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 14.5, lineHeight: 1.55, fontWeight: 500, color: 'var(--text)', whiteSpace: 'pre-line' }}><MarkdownText text={q.prompt} /></p>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '9px 13px', borderRadius: 10, background: ok ? '#f3faf6' : '#fef2f2', border: '1px solid ' + (ok ? '#c7ecd9' : '#f3d4d4') }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', flexShrink: 0, width: 44 }}>학생 답</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0, color: ok ? 'var(--primary)' : 'var(--danger)' }}>{q.choices ? <ChoiceAnswerText choices={q.choices} answer={pq.answer} /> : <MarkdownText text={String(pq.answer)} />}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '9px 13px', borderRadius: 10, background: '#f3faf6', border: '1px solid #c7ecd9' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', flexShrink: 0, width: 44 }}>정답</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0, color: 'var(--primary)' }}>{q.choices ? <ChoiceAnswerText choices={q.choices} answer={q.answer} fallback="(정답 없음)" /> : <MarkdownText text={String(q.answer)} />}</span>
                </div>
              </div>
              {pq.type === 'write' && pq.feedback && (
                <div style={{ marginTop: 11, display: 'flex', gap: 8, padding: '11px 13px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
                  <Sparkles size={15} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div><span style={{ fontSize: 11.5, fontWeight: 700, color: '#b45309' }}>{pq.gradedBy === 'ai' ? 'AI 초안 채점 · 선생님 확인 권장 · ' : '자동 첨삭 · '}</span><span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{pq.feedback}</span></div>
                </div>
              )}
              {q.explanation && <div style={{ marginTop: 11, display: 'flex', gap: 7 }}><span style={{ fontWeight: 700, fontSize: 11.5, color: 'var(--mint)', flexShrink: 0, marginTop: 1 }}>해설</span><span style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}><MarkdownText text={q.explanation} /></span></div>}
            </div>
          );
        })}

        <div style={{ textAlign: 'center', padding: '24px 0 8px', fontSize: 12.5, color: 'var(--muted)' }}>Growing · 그로잉영어 교습소 — 본 페이지는 읽기전용 안내용입니다.</div>
      </div>
    </div>
  );
}

// ===========================================================================
// 메인: 평가관리 (화면 전환 + 토스트 + 인쇄)
// ===========================================================================
type Screen = 'list' | 'create' | 'loading' | 'preview' | 'distribute' | 'results' | 'student' | 'parent';

const isSavedId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : '오류가 발생했어요.');
const toCards = (items: ExamListItem[]): ExamCard[] => items.map(it => ({
  id: it.id, classId: it.classId, name: it.title, target: it.targetLabel, topic: it.topic, count: it.count,
  date: it.date, types: it.types as QType[], difficulty: it.difficulty, totalPoints: it.totalPoints, status: it.status,
}));

const rosterForClass = (classes: Class[], students: Student[], classId?: string | null): RosterStudent[] => {
  const cls = classes.find(item => item.id === classId);
  const ids = cls?.studentIds ?? [];
  const byId = new Map(students.map(student => [student.id, student]));
  return ids.reduce<RosterStudent[]>((list, id, index) => {
    const student = byId.get(id);
    if (student && student.status === 'active') list.push({ id: student.id, no: index + 1, name: student.name });
    return list;
  }, []);
};

const submissionsFromDb = (exam: Exam, dbSubmissions: DbSubmission[], dbAnswers: DbAnswer[], roster: RosterStudent[]): Submission[] => {
  const examTotalPoints = exam.questions.reduce((sum, question) => sum + question.points, 0);
  const rosterNoByStudentId = new Map(roster.filter(student => student.id).map(student => [student.id as string, student.no]));
  const answersBySubmission = new Map<string, DbAnswer[]>();
  dbAnswers.forEach(answer => {
    const list = answersBySubmission.get(answer.submissionId) ?? [];
    list.push(answer);
    answersBySubmission.set(answer.submissionId, list);
  });

  return dbSubmissions.map((submission, index) => {
    const perQ: Record<string, PerQ> = {};
    const answerRows = new Map((answersBySubmission.get(submission.id) ?? []).map(answer => [answer.questionId, answer]));
    exam.questions.forEach(question => {
      const answer = answerRows.get(question.id);
      const rawAnswer = answer?.answer ?? '';
      perQ[question.id] = {
        correct: Boolean(answer?.isCorrect),
        partial: Boolean(answer?.isPartial),
        gained: Number(answer?.gainedPoints ?? 0),
        answer: question.choices ? choiceAnswerIndex(rawAnswer) : String(rawAnswer || '(미응답)'),
        feedback: answer?.feedback || null,
        type: question.choices ? 'mcq' : 'write',
        gradedBy: answer?.gradedBy ?? 'auto',
      };
    });
    return {
      id: submission.id,
      no: rosterNoByStudentId.get(submission.studentId) ?? index + 1,
      name: submission.studentName,
      time: submission.submittedAt ? submission.submittedAt.slice(11, 16) : '',
      score: submission.score,
      totalPoints: submission.totalPoints || examTotalPoints,
      perQ,
      submitted: true,
    };
  });
};

type PublicExamPayload = Awaited<ReturnType<typeof examsApi.publicGetExam>>;
type PublicResultPayload = Awaited<ReturnType<typeof examsApi.publicGetResult>>;

const publicQuestionToExamQuestion = (row: PublicExamPayload['questions'][number]): Question => ({
  id: String(row.id),
  type: String(row.type ?? 'vocab') as QType,
  points: Number(row.points ?? 0),
  prompt: String(row.prompt ?? ''),
  passage: row.passage ? String(row.passage) : undefined,
  choices: Array.isArray(row.choices) ? row.choices.map(String) : null,
  answer: '',
  explanation: '',
  source: String(row.source ?? ''),
});

const publicPayloadToExam = (payload: PublicExamPayload, code: string): Exam => {
  const exam = payload.exam;
  return {
    id: String(exam.id),
    name: String(exam.title ?? '온라인 시험'),
    target: String(exam.targetLabel ?? ''),
    topic: String(exam.topic ?? ''),
    date: String(exam.date ?? ''),
    difficulty: '보통',
    types: Array.from(new Set(payload.questions.map(row => String(row.type ?? 'vocab') as QType))),
    questions: payload.questions.map(publicQuestionToExamQuestion),
    status: 'published',
    shortCode: String(exam.shortCode ?? code),
  };
};

const publicResultQuestionToExamQuestion = (row: PublicResultPayload['questions'][number]): Question => ({
  id: String(row.id),
  type: String(row.type ?? 'vocab') as QType,
  points: Number(row.points ?? 0),
  prompt: String(row.prompt ?? ''),
  passage: row.passage ? String(row.passage) : undefined,
  choices: Array.isArray(row.choices) ? row.choices.map(String) : null,
  answer: (row.answer as number | string) ?? '',
  explanation: String(row.explanation ?? ''),
  source: String(row.source ?? ''),
});

const publicResultPayloadToView = (payload: PublicResultPayload): { exam: Exam; submission: Submission } => {
  const questions = payload.questions.map(publicResultQuestionToExamQuestion);
  const examTotalPoints = questions.reduce((sum, question) => sum + question.points, 0);
  const answersByQuestion = new Map(payload.answers.map(answer => [String(answer.question_id), answer]));
  const perQ: Record<string, PerQ> = {};
  questions.forEach(question => {
    const answer = answersByQuestion.get(question.id);
    const rawAnswer = answer?.answer ?? '';
    const gradedBy = String(answer?.graded_by ?? 'auto');
    perQ[question.id] = {
      correct: Boolean(answer?.is_correct),
      partial: Boolean(answer?.is_partial),
      gained: Number(answer?.gained_points ?? 0),
      answer: question.choices ? choiceAnswerIndex(rawAnswer) : String(rawAnswer || '(미응답)'),
      feedback: answer?.feedback ? String(answer.feedback) : null,
      type: question.choices ? 'mcq' : 'write',
      gradedBy: gradedBy === 'ai' || gradedBy === 'teacher' ? gradedBy : 'auto',
    };
  });
  const examRow = payload.exam;
  const submissionRow = payload.submission;
  return {
    exam: {
      id: 'public-result',
      name: String(examRow.title ?? '온라인 시험'),
      target: String(examRow.target_label ?? ''),
      topic: String(examRow.topic ?? ''),
      date: String(examRow.date ?? ''),
      difficulty: '보통',
      types: Array.from(new Set(questions.map(question => question.type))),
      questions,
      status: 'closed',
    },
    submission: {
      id: String(submissionRow.id ?? ''),
      no: 1,
      name: String(submissionRow.student_name_snapshot ?? ''),
      time: submissionRow.submitted_at ? String(submissionRow.submitted_at).slice(11, 16) : '',
      score: Number(submissionRow.score ?? 0),
      totalPoints: Number(submissionRow.total_points ?? 0) || examTotalPoints,
      perQ,
      submitted: true,
    },
  };
};

export function PublicResultRoute({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<{ exam: Exam; submission: Submission } | null>(null);
  const cleanToken = token.trim();

  useEffect(() => {
    void (async () => {
      try {
        const payload = await examsApi.publicGetResult(cleanToken);
        setView(publicResultPayloadToView(payload));
        setError(null);
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [cleanToken]);

  if (loading) {
    return (
      <div className="exam-app tablet-stage">
        <div className="card" style={{ padding: 28, boxShadow: 'var(--shadow-md)', color: 'var(--text-2)' }}>결과를 불러오는 중...</div>
      </div>
    );
  }

  if (error || !view) {
    return (
      <div className="exam-app tablet-stage">
        <div className="card" style={{ padding: 28, boxShadow: 'var(--shadow-md)', maxWidth: 460 }}>
          <div className="h-font" style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>결과를 볼 수 없어요</div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-2)' }}>{error ?? '결과 링크를 찾을 수 없습니다.'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="exam-app">
      <ParentResult exam={view.exam} submissions={[view.submission]} onExit={() => window.history.back()} showExit={false} />
    </div>
  );
}

export function PublicExamRoute({ code }: { code: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const upperCode = code.trim().toUpperCase();

  useEffect(() => {
    void (async () => {
      try {
        const payload = await examsApi.publicGetExam(upperCode);
        setExam(publicPayloadToExam(payload, upperCode));
        setRoster(payload.students.map(student => ({
          id: student.id,
          no: student.no,
          name: student.name,
          submitted: student.submitted,
        })));
        setError(null);
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [upperCode]);

  if (loading) {
    return (
      <div className="exam-app tablet-stage">
        <div className="card" style={{ padding: 28, boxShadow: 'var(--shadow-md)', color: 'var(--text-2)' }}>시험을 불러오는 중...</div>
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="exam-app tablet-stage">
        <div className="card" style={{ padding: 28, boxShadow: 'var(--shadow-md)', maxWidth: 460 }}>
          <div className="h-font" style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>응시할 수 없어요</div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-2)' }}>{error ?? '시험 정보를 찾을 수 없습니다.'}</div>
        </div>
      </div>
    );
  }

  const joinUrl = `${window.location.origin}${window.location.pathname}#/exam/${upperCode}`;

  return (
    <div className="exam-app">
      <StudentApp
        exam={exam}
        published
        submissions={[]}
        roster={roster}
        code={upperCode}
        joinUrl={joinUrl}
        showExit={false}
        onExit={() => undefined}
        onSubmit={async (_submission, answers, student) => {
          if (!student.id) throw new Error('학생 정보를 찾을 수 없습니다.');
          await examsApi.publicSubmit(upperCode, student.id, answers);
          setRoster(list => list.map(item => item.id === student.id ? { ...item, submitted: true } : item));
        }}
      />
    </div>
  );
}

export const Exams: React.FC<{ ownerId: string; classes: Class[]; students: Student[]; onSendGuideToMessaging?: (content: string) => void }> = ({ ownerId, classes, students, onSendGuideToMessaging }) => {
  const [restoredDraft] = useState<PersistedExamDraft | null>(() => loadExamDraft(ownerId));
  const [screen, setScreen] = useState<Screen>(restoredDraft?.screen ?? 'list');
  const [saved, setSaved] = useState<ExamCard[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [exam, setExam] = useState<Exam | null>(restoredDraft?.exam ?? null);
  const [genMeta, setGenMeta] = useState<GenMeta | null>(restoredDraft?.meta ?? null);
  const [createDraft, setCreateDraft] = useState<CreateExamDraft>(restoredDraft?.form ?? defaultCreateExamDraft(classes));
  const [reveal, setReveal] = useState(false);
  const [printMode, setPrintMode] = useState<'student' | 'teacher' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [published, setPublished] = useState(true);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentRoster = exam ? rosterForClass(classes, students, exam.classId) : [];
  const rosterList = currentRoster.length > 0 ? currentRoster : (exam && isSavedId(exam.id) ? [] : ROSTER);

  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2600); };
  const go = (s: Screen) => { setScreen(s); if (scrollRef.current) scrollRef.current.scrollTop = 0; };
  const clearLocalDraft = () => removeExamDraft(ownerId);

  useEffect(() => {
    const hasUnsavedExam = Boolean(exam && !isSavedId(exam.id));
    if (screen !== 'create' && screen !== 'loading' && !(screen === 'preview' && hasUnsavedExam)) return;
    const persisted: PersistedExamDraft = {
      screen: screen === 'preview' && hasUnsavedExam ? 'preview' : 'create',
      form: createDraft,
      meta: genMeta,
      exam: hasUnsavedExam ? exam : null,
      updatedAt: Date.now(),
    };
    saveExamDraft(ownerId, persisted);
  }, [createDraft, exam, genMeta, ownerId, screen]);

  // 저장된 시험 목록을 실제 DB에서 불러온다.
  const refreshList = useCallback(async () => {
    try {
      const items = await examsApi.list();
      setSaved(toCards(items));
      setListError(null);
    } catch (e) {
      setListError(errMsg(e));
    } finally {
      setListLoading(false);
    }
  }, []);
  // 마운트 시 1회 로드 — setState는 await 이후에만 일어나도록 effect 안에서 직접 처리.
  useEffect(() => {
    void (async () => {
      try {
        const items = await examsApi.list();
        setSaved(toCards(items));
        setListError(null);
      } catch (e) {
        setListError(errMsg(e));
      } finally {
        setListLoading(false);
      }
    })();
  }, []);

  // 미저장 시험이면 DB에 생성하고, 저장된 시험 객체를 반환한다.
  const persistExam = async (): Promise<Exam | null> => {
    if (!exam) return null;
    if (isSavedId(exam.id)) return exam;
    if (!exam.classId) { flash('대상 반 정보가 없어 저장할 수 없어요.'); return null; }
    const savedExam = await examsApi.create({
      classId: exam.classId, targetLabel: exam.target, title: exam.name,
      topic: exam.topic, date: exam.date, difficulty: exam.difficulty,
      questions: toSdkQuestions(exam.questions),
    });
    const updated: Exam = { ...exam, id: savedExam.id, shortCode: savedExam.shortCode, status: savedExam.status, questions: fromSdkQuestions(savedExam.questions) };
    setExam(updated);
    clearLocalDraft();
    await refreshList();
    return updated;
  };

  const saveExam = async () => {
    try {
      if (exam && isSavedId(exam.id)) {
        const savedExam = await examsApi.update({
          id: exam.id,
          classId: exam.classId ?? null,
          targetLabel: exam.target,
          title: exam.name,
          topic: exam.topic,
          date: exam.date,
          difficulty: exam.difficulty,
          questions: toSdkQuestions(exam.questions),
        });
        const updated: Exam = { ...exam, id: savedExam.id, shortCode: savedExam.shortCode, status: savedExam.status, questions: fromSdkQuestions(savedExam.questions) };
        setExam(updated);
        await refreshList();
        flash('시험 수정 내용을 저장했어요');
        return;
      }
      const u = await persistExam();
      if (u) flash('시험이 저장되었어요');
    } catch (e) { flash(errMsg(e)); }
  };

  const loadSubmissions = useCallback(async (targetExam: Exam) => {
    if (!isSavedId(targetExam.id)) return [];
    const roster = rosterForClass(classes, students, targetExam.classId);
    const data = await examsApi.submissions(targetExam.id);
    const mapped = submissionsFromDb(targetExam, data.submissions, data.answers, roster);
    setSubmissions(mapped);
    return mapped;
  }, [classes, students]);

  useEffect(() => {
    if (screen !== 'distribute' || !exam || !isSavedId(exam.id)) return;
    const intervalId = window.setInterval(() => {
      void loadSubmissions(exam).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [exam, loadSubmissions, screen]);

  const goDistribute = async () => {
    if (!exam) return;
    try {
      const u = await persistExam();
      if (!u) return;
      await loadSubmissions(u);
      setPublished(u.status === 'published');
      go('distribute');
    } catch (e) { flash(errMsg(e)); }
  };

  const goResults = async () => {
    if (!exam) return;
    try {
      await loadSubmissions(exam);
      go('results');
    } catch (e) { flash(errMsg(e)); }
  };

  const refreshSubmissions = async () => {
    if (!exam) return;
    try {
      await loadSubmissions(exam);
      flash('제출 현황을 새로고침했어요');
    } catch (e) { flash(errMsg(e)); }
  };

  const handleTeacherGradeUpdate = async (sub: Submission, question: Question, gainedPoints: number) => {
    if (!exam || !sub.id || !isSavedId(exam.id) || !isSavedId(question.id)) return;
    try {
      await examsApi.updateAnswerGrade({
        examId: exam.id,
        submissionId: sub.id,
        questionId: question.id,
        gainedPoints,
        questionPoints: question.points,
      });
      await loadSubmissions(exam);
      flash('선생님 채점으로 점수를 수정했어요.');
    } catch (e) { flash(errMsg(e)); }
  };

  const toggleStatus = async () => {
    if (!exam || !isSavedId(exam.id)) return;
    const next: ExamStatus = exam.status === 'published' ? 'closed' : 'published';
    try {
      await examsApi.setStatus(exam.id, next);
      setExam(e => (e ? { ...e, status: next } : e));
      setPublished(next === 'published');
      flash(next === 'published' ? '시험을 시작했어요' : '시험을 마감했어요');
    } catch (e) { flash(errMsg(e)); }
  };

  const handleStudentSubmit = (sub: Submission) => {
    setSubmissions(list => {
      const idx = list.findIndex(s => s.no === sub.no);
      if (idx >= 0) { const cp = [...list]; cp[idx] = sub; return cp; }
      return [...list, sub];
    });
    flash(`${sub.name} 학생의 답안이 제출됐어요`);
  };

  // AI 출제 (exam-generate). 자료 텍스트 기반으로 실제 문항 생성.
  const handleGenerate = async (meta: GenMeta) => {
    setGenMeta(meta);
    setReveal(false);
    go('loading');
    try {
      const drafts = await examsApi.generate({
        materialText: meta.materialText,
        title: `${meta.targetLabel} 온라인 시험`,
        targetLabel: meta.targetLabel,
        topic: meta.topic,
        difficulty: meta.diff,
        count: meta.count,
        types: meta.types,
        instruction: meta.instruction,
      });
      const questions = fromSdkQuestions(drafts);
      if (questions.length === 0) throw new Error('AI가 문항을 만들지 못했어요. 자료를 더 구체적으로 넣어 주세요.');
      setExam({
        id: 'draft',
        name: `${meta.targetLabel} — ${meta.topic || '단원 평가'}`,
        target: meta.targetLabel,
        topic: meta.topic || '자료 기반 평가',
        date: new Date().toISOString().slice(0, 10),
        difficulty: meta.diff,
        types: meta.types,
        questions,
        classId: meta.classId,
        status: 'draft',
        materialText: meta.materialText,
      });
      go('preview');
    } catch (e) {
      flash(errMsg(e));
      go('create');
    }
  };

  const openSaved = async (card: ExamCard) => {
    setReveal(false);
    try {
      const full = await examsApi.get(card.id);
      clearLocalDraft();
      setExam({
        id: full.id, name: full.title, target: full.targetLabel, topic: full.topic,
        date: full.date, difficulty: full.difficulty,
        types: Array.from(new Set(full.questions.map(q => q.type))) as QType[],
        questions: fromSdkQuestions(full.questions),
        classId: full.classId ?? undefined, status: full.status, shortCode: full.shortCode,
      });
      go('preview');
    } catch (e) { flash(errMsg(e)); }
  };

  // 인쇄: 브라우저 print 다이얼로그. <body>에 클래스를 붙여 #root를 숨기고 인쇄 문서만 출력.
  const doPrint = (mode: 'student' | 'teacher') => {
    setPrintMode(mode);
    window.setTimeout(() => {
      document.body.classList.add('exam-printing');
      window.print();
    }, 80);
  };
  useEffect(() => {
    const fn = () => { setPrintMode(null); document.body.classList.remove('exam-printing'); };
    window.addEventListener('afterprint', fn);
    return () => window.removeEventListener('afterprint', fn);
  }, []);

  const copyForClasscard = async () => {
    if (!exam || exam.questions.length === 0) return;
    try {
      await copyText(buildClasscardPasteText(exam.questions));
      flash(`${exam.questions.length}문항을 클래스카드용으로 복사했어요.`);
    } catch (e) {
      flash(errMsg(e));
    }
  };

  const duplicateExam = () => {
    if (!exam || !isSavedId(exam.id)) return;
    const duplicated: Exam = {
      ...exam,
      id: 'draft',
      name: `${exam.name} 복사본`,
      date: new Date().toISOString().slice(0, 10),
      status: 'draft',
      shortCode: undefined,
      questions: exam.questions.map((question, index) => ({ ...question, id: `copy-${Date.now()}-${index}` })),
    };
    setExam(duplicated);
    setReveal(false);
    go('preview');
    flash('새 시험 초안으로 복제했어요. 수정 후 저장해 주세요.');
  };

  return (
    <div className="exam-app">
      <div ref={scrollRef}>
        {screen === 'list' && (
          listLoading ? (
            <div className="fade-up exam-pagepad" style={{ maxWidth: 880, margin: '0 auto', padding: '60px 44px', textAlign: 'center', color: 'var(--text-2)' }}>
              <div className="spin" style={{ width: 26, height: 26, border: '3px solid #cfe3d8', borderTopColor: 'var(--primary)', borderRadius: '50%', margin: '0 auto 14px' }} />
              시험 목록을 불러오는 중…
            </div>
          ) : listError ? (
            <div className="fade-up exam-pagepad" style={{ maxWidth: 880, margin: '0 auto', padding: '60px 44px', textAlign: 'center' }}>
              <p style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: 14 }}>목록을 불러오지 못했어요.<br />{listError}</p>
              <button className="btn btn-primary" onClick={() => { setListLoading(true); void refreshList(); }}>다시 시도</button>
            </div>
          ) : (
            <SavedExamsScreen exams={saved} classes={classes} onOpen={card => void openSaved(card)} onNew={() => go('create')} />
          )
        )}
        {screen === 'create' && <CreateExam classes={classes} draft={createDraft} onDraftChange={setCreateDraft} onGenerate={meta => void handleGenerate(meta)} />}
        {screen === 'loading' && <GenLoading meta={genMeta} />}
        {screen === 'preview' && exam && (
          <div>
            <div className="exam-pagepad" style={{ padding: '0 44px', marginTop: 18 }}>
              <button className="btn btn-ghost" onClick={() => go('list')} style={{ height: 38 }}><List size={16} /> 시험 목록</button>
            </div>
            <PreviewStudio exam={exam} setExam={setExam} reveal={reveal} setReveal={setReveal} onPrint={doPrint} onSave={() => void saveExam()} onDuplicate={duplicateExam} onClasscardCopy={() => void copyForClasscard()} onDistribute={() => void goDistribute()} />
          </div>
        )}
        {screen === 'distribute' && exam && (
          <div>
            <div className="exam-pagepad" style={{ padding: '0 44px', marginTop: 18 }}>
              <button className="btn btn-ghost" onClick={() => go('preview')} style={{ height: 38 }}><Pencil size={16} /> 미리보기로</button>
            </div>
            <Distribute exam={exam} published={published} code={exam.shortCode || SHORT_CODE} roster={rosterList} onToggleStatus={() => void toggleStatus()} submissions={submissions} onGoResults={goResults} onRefresh={refreshSubmissions} onGoStudent={() => go('student')} flash={flash} />
          </div>
        )}
        {screen === 'results' && exam && (
          <div>
            <div className="exam-pagepad" style={{ padding: '0 44px', marginTop: 18 }}>
              <button className="btn btn-ghost" onClick={() => go('distribute')} style={{ height: 38 }}><QrCode size={16} /> 배포 화면으로</button>
            </div>
            <Results exam={exam} submissions={submissions} onParentPreview={() => go('parent')} onRefresh={refreshSubmissions} onGradeUpdate={handleTeacherGradeUpdate} onSendGuideToMessaging={onSendGuideToMessaging} />
          </div>
        )}
        {screen === 'student' && exam && (
          <StudentApp exam={exam} published={published} submissions={submissions} roster={rosterList} code={exam.shortCode || SHORT_CODE} joinUrl={`${window.location.origin}${window.location.pathname}#/exam/${exam.shortCode || SHORT_CODE}`} onSubmit={handleStudentSubmit} onExit={() => go('distribute')} />
        )}
        {screen === 'parent' && exam && (
          <ParentResult exam={exam} submissions={submissions} onExit={() => go('results')} />
        )}
      </div>

      {toast && (
        <div className="slide-in" style={{ position: 'fixed', bottom: 78, left: '50%', transform: 'translateX(-50%)', zIndex: 3000, background: 'var(--primary-dark)', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600, boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <Check size={17} color="var(--mint)" /> {toast}
        </div>
      )}

      {printMode && exam && createPortal(<PrintView exam={exam} mode={printMode} />, document.body)}
    </div>
  );
};
