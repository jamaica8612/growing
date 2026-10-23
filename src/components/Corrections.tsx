import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Languages,
  Lock,
  PenLine,
  Printer,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Scissors,
  Send,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import {
  LoginRequiredError,
  MAX_SENTENCES,
  MODE_LABELS,
  autoMarkCorrection,
  averageScores,
  buildCorrectionPrintHtml,
  correctionBoardUrl,
  correctionsApi,
  formatCorrectionForCopy,
  isValidPin,
  parseMarks,
  setMarkRange,
  splitSentences,
  stripMarks,
  toggleMarkWord,
  withAutoMarks,
  type BoardSet,
  type CorrectionItem,
  type CorrectionMode,
  type CorrectionSet,
  type CorrectionStudent,
  type CorrectionSubmission,
  type MySubmission,
  type PublicCorrectionSet,
} from '../lib/corrections';
import './Corrections.css';

type Feedback = { tone: 'success' | 'error'; message: string } | null;

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return '잠시 후 다시 시도해 주세요.';
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
};

const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy copy path for restricted browser contexts.
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  try {
    textarea.select();
    if (!document.execCommand('copy')) throw new Error('복사하지 못했습니다. 직접 선택해 복사해 주세요.');
  } finally {
    textarea.remove();
  }
};

// 평가 관리(Exams)의 시험 QR과 같은 생성 서비스를 쓴다.
const qrImageUrl = (value: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=16&data=${encodeURIComponent(value)}`;

// 인쇄용 문서를 새 창에 쓰고, 이미지·글꼴이 다 불러와지면 인쇄 창을 연다.
// 새 창은 앱 CSP(script-src 'self')를 물려받아 문서 안 인라인 스크립트가 막히므로 여기서 print를 부른다.
function printDocument(html: string) {
  const win = window.open('', '_blank');
  if (!win) {
    window.alert('팝업이 막혀 있어요. 브라우저에서 팝업을 허용해 주세요.');
    return;
  }
  win.document.write(html);
  win.document.close();
  let printed = false;
  const print = () => {
    if (printed || win.closed) return;
    printed = true;
    win.focus();
    win.print();
  };
  const whenReady = () => {
    void Promise.resolve(win.document.fonts?.ready).finally(() => window.setTimeout(print, 150));
  };
  if (win.document.readyState === 'complete') whenReady();
  else win.addEventListener('load', whenReady, { once: true });
  window.setTimeout(print, 4000);
}

// 교실에 붙일 A4 안내지. QR 이미지가 다 불러와지면 인쇄 창을 연다.
function printBoardQr(boardUrl: string) {
  printDocument(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>해석·영작 게시판 QR</title>
<style>
  body { margin: 0; font-family: 'Pretendard', 'Noto Sans KR', sans-serif; color: #0f3023; text-align: center; }
  .page { padding: 18mm 12mm; }
  .brand { color: #2c6f52; font-size: 22pt; margin: 0; }
  h1 { font-size: 36pt; margin: 4mm 0 10mm; }
  img { width: 130mm; height: 130mm; }
  .main { font-size: 20pt; margin: 10mm 0 4mm; color: #1f2937; }
  .sub { font-size: 14pt; margin: 2mm 0; color: #4b5563; }
</style></head><body><div class="page">
  <p class="brand">그로잉영어</p>
  <h1>해석 · 영작 게시판</h1>
  <img src="${qrImageUrl(boardUrl)}" alt="게시판 QR">
  <p class="main">카메라로 QR을 찍어 들어가세요</p>
  <p class="sub">과제 제목 선택 → 이름 + 비번 4자리 → 답 적고 제출</p>
  <p class="sub">첨삭은 선생님이 확인한 뒤 ‘내 제출 보기’에서 볼 수 있어요</p>
</div></body></html>`);
}

const MODE_GUIDE: Record<CorrectionMode, { paste: string; placeholder: string; student: string; answerPlaceholder: string }> = {
  translate: {
    paste: '영어 지문을 붙여 넣으세요.',
    placeholder: 'Tom went to the park. He met his friend there.',
    student: '각 영어 문장을 우리말로 해석해 적어 보세요.',
    answerPlaceholder: '해석을 적어 주세요',
  },
  compose: {
    paste: '영작할 우리말 문장을 붙여 넣으세요.',
    placeholder: '톰은 공원에 갔다. 그는 거기서 친구를 만났다.',
    student: '각 우리말 문장을 영어로 적어 보세요.',
    answerPlaceholder: 'Write in English',
  },
};

function ScorePills({ completeness, accuracy }: { completeness: number; accuracy: number }) {
  return (
    <span className="cr-scores">
      <span className="cr-score">완성도 <b>{completeness}%</b></span>
      <span className="cr-score accuracy">정확도 <b>{accuracy}%</b></span>
    </span>
  );
}

// 첨삭 문장의 빨간 표시(⟦…⟧)를 색으로 보여 준다.
function MarkedText({ value }: { value: string }) {
  return <>{parseMarks(value).map((segment, index) => (segment.red ? <span key={index} className="cr-red">{segment.text}</span> : segment.text))}</>;
}

const charLength = (value: string) => Array.from(value).length;

// 첨삭 칸: 단어를 누르면 빨강/검정이 바뀌고, 드래그로 고른 부분은 버튼으로 칠한다.
// ‘글 고치기’로 문장을 고치면 학생 답과 비교해 빨간색을 자동으로 다시 칠한다.
// 휴대폰은 손잡이로 범위를 조정하고, 버튼을 누르면 선택이 풀리기도 해서
// selectionchange로 마지막에 고른 범위를 기억해 둔다(버튼·단어 누르기·✕로 지운다).
function MarkEditor({ answer, value, onChange }: { answer: string; value: string; onChange: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onSelectionChange = () => {
      const box = boxRef.current;
      const selection = window.getSelection();
      if (!box || !selection || selection.rangeCount === 0 || selection.isCollapsed) return;
      const position = (node: Node | null, nodeOffset: number) => {
        const holder = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node as HTMLElement | null;
        const span = holder?.closest<HTMLElement>('[data-start]');
        if (!span || !box.contains(span)) return null;
        const before = node?.nodeType === Node.TEXT_NODE ? (node.textContent ?? '').slice(0, nodeOffset) : '';
        return Number(span.dataset.start) + charLength(before);
      };
      const a = position(selection.anchorNode, selection.anchorOffset);
      const b = position(selection.focusNode, selection.focusOffset);
      if (a === null || b === null) {
        // 다른 칸에서 글자를 고르면 이 칸의 선택은 잊는다.
        if (!box.contains(selection.anchorNode) && !box.contains(selection.focusNode)) setRange(null);
        return;
      }
      setRange(a === b ? null : { start: Math.min(a, b), end: Math.max(a, b) });
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  const tokens: ReactNode[] = [];
  let offset = 0;
  parseMarks(value).forEach(segment => {
    for (const piece of segment.text.split(/(\s+)/)) {
      if (!piece) continue;
      const start = offset;
      offset += charLength(piece);
      const word = piece.trim() !== '';
      tokens.push(
        <span
          key={`${start}-${piece}`}
          data-start={start}
          className={`${segment.red ? 'cr-red' : ''}${word ? ' cr-word' : ''}`}
          onClick={word ? () => {
            if (window.getSelection()?.isCollapsed === false) return;
            setRange(null);
            onChange(toggleMarkWord(value, start));
          } : undefined}
        >
          {piece}
        </span>,
      );
    }
  });

  const paint = (red: boolean) => {
    if (!range) return;
    onChange(setMarkRange(value, range.start, range.end, red));
    window.getSelection()?.removeAllRanges();
    setRange(null);
  };

  if (editing) {
    return (
      <div className="cr-mark">
        <textarea
          className="form-control"
          value={stripMarks(value)}
          autoFocus
          onChange={event => onChange(autoMarkCorrection(answer, event.target.value))}
        />
        <div className="cr-mark-tools">
          <span>문장을 고치면 학생 답과 다른 부분이 다시 빨갛게 칠해져요.</span>
          <button className="btn btn-secondary" type="button" onClick={() => setEditing(false)}><Check size={14} /> 다 고침</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cr-mark">
      <div ref={boxRef} className="cr-mark-box">
        {tokens.length > 0 ? tokens : <em className="cr-mark-empty">첨삭 없음</em>}
      </div>
      <div className="cr-mark-tools">
        {range ? (
          <span className="cr-mark-picked">
            고른 글자: <b>‘{Array.from(stripMarks(value)).slice(range.start, range.end).join('')}’</b>
            <button type="button" aria-label="고른 글자 지우기" onClick={() => setRange(null)}><X size={13} /></button>
          </span>
        ) : (
          <span>단어를 누르면 빨강 ↔ 검정. 여러 글자는 드래그(휴대폰은 길게 눌러 고르기)한 뒤 버튼을 누르세요.</span>
        )}
        <button className="btn btn-secondary cr-red-btn" type="button" disabled={!range} onPointerDown={event => event.preventDefault()} onClick={() => paint(true)}>선택 → 빨간색</button>
        <button className="btn btn-secondary" type="button" disabled={!range} onPointerDown={event => event.preventDefault()} onClick={() => paint(false)}>선택 → 검정</button>
        <button className="btn btn-secondary" type="button" onClick={() => { setRange(null); onChange(autoMarkCorrection(answer, value)); }}>자동 표시</button>
        <button className="btn btn-secondary" type="button" onClick={() => { setRange(null); setEditing(true); }}><PenLine size={14} /> 글 고치기</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 선생님 화면
// ---------------------------------------------------------------------------

type TeacherTab = CorrectionMode | 'students';

export function Corrections({ ownerId }: { ownerId: string }) {
  const [tab, setTab] = useState<TeacherTab>('translate');
  const mode: CorrectionMode = tab === 'compose' ? 'compose' : 'translate';
  const [sets, setSets] = useState<CorrectionSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selectedSetId, setSelectedSetId] = useState('');

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    correctionsApi.listSets()
      .then(rows => {
        if (!active) return;
        setSets(rows);
        setLoadError('');
      })
      .catch(error => {
        if (active) setLoadError(`과제를 불러오지 못했습니다: ${errorMessage(error)}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const modeSets = useMemo(() => sets.filter(set => set.mode === mode), [sets, mode]);
  const selectedSet = modeSets.find(set => set.id === selectedSetId) ?? null;

  const boardUrl = correctionBoardUrl(ownerId);
  const [showQr, setShowQr] = useState(false);

  const changeTab = (next: TeacherTab) => {
    setTab(next);
    setSelectedSetId('');
    setFeedback(null);
  };

  return (
    <div className="lm-root cr-root">
      <section className="lm-card cr-board-link">
        <div className="cr-board-text">
          <h3>학생용 게시판 링크</h3>
          <p>‘제출 받는 중’인 과제가 모두 보여요. 태블릿 홈 화면에 추가해 두면 편해요.</p>
        </div>
        <div className="cr-board-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              copyText(boardUrl)
                .then(() => setFeedback({ tone: 'success', message: '게시판 링크를 복사했습니다.' }))
                .catch(error => setFeedback({ tone: 'error', message: errorMessage(error) }));
            }}
          >
            <Copy size={16} /> 링크 복사
          </button>
          <a className="btn btn-secondary" href={boardUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> 열기</a>
          <button className="btn btn-secondary" type="button" onClick={() => setShowQr(current => !current)} aria-expanded={showQr}>
            <QrCode size={16} /> {showQr ? 'QR 닫기' : 'QR 보기'}
          </button>
        </div>
        {showQr && (
          <div className="cr-qr">
            <img src={qrImageUrl(boardUrl)} alt="학생용 게시판 QR 코드" width={220} height={220} />
            <div>
              <p>학생이 태블릿·휴대폰 카메라로 찍으면 게시판이 열려요.</p>
              <button className="btn btn-primary" type="button" onClick={() => printBoardQr(boardUrl)}>
                <Printer size={16} /> 안내지 인쇄
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="cr-mode-tabs" role="tablist" aria-label="첨삭 종류">
        {(['translate', 'compose', 'students'] as TeacherTab[]).map(item => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            className={`cr-mode-tab${tab === item ? ' on' : ''}`}
            onClick={() => changeTab(item)}
          >
            {item === 'translate' ? <Languages size={17} /> : item === 'compose' ? <PenLine size={17} /> : <KeyRound size={17} />}
            {item === 'students' ? '학생 비번' : `${MODE_LABELS[item]} 첨삭`}
          </button>
        ))}
      </div>

      <div className="lm-feedback" aria-atomic="true">
        {feedback && (
          <div className={`lm-alert ${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>
            {feedback.tone === 'success' ? <Check size={17} /> : <AlertTriangle size={17} />}
            <span>{feedback.message}</span>
          </div>
        )}
      </div>

      {tab === 'students' ? (
        <StudentsPanel onFeedback={setFeedback} />
      ) : selectedSet ? (
        <SetDetail
          key={selectedSet.id}
          set={selectedSet}
          onBack={() => setSelectedSetId('')}
          onFeedback={setFeedback}
          onSetChange={next => setSets(current => current.map(set => set.id === next.id ? next : set))}
          onSetDeleted={id => {
            setSets(current => current.filter(set => set.id !== id));
            setSelectedSetId('');
          }}
        />
      ) : (
        <div className="lm-layout">
          <NewSetForm
            key={mode}
            mode={mode}
            onCreated={set => {
              setSets(current => [set, ...current]);
              setSelectedSetId(set.id);
              setFeedback({ tone: 'success', message: `‘${set.title}’ 과제를 게시판에 올렸습니다.` });
            }}
            onFeedback={setFeedback}
          />

          <section className="lm-card" aria-labelledby="cr-set-list-heading">
            <div className="lm-card-heading">
              <span className="lm-card-icon mint"><ClipboardCheck size={19} /></span>
              <div>
                <h3 id="cr-set-list-heading">{MODE_LABELS[mode]} 과제 목록</h3>
                <p>과제를 누르면 제출 현황과 첨삭을 볼 수 있어요.</p>
              </div>
            </div>
            {loading ? (
              <div className="lm-empty" role="status"><b>불러오는 중...</b></div>
            ) : loadError ? (
              <div className="lm-empty lm-load-error" role="alert">
                <AlertTriangle size={28} />
                <span>{loadError}</span>
                <button className="btn btn-secondary" type="button" onClick={() => { setLoading(true); setReloadKey(key => key + 1); }}>
                  <RefreshCw size={16} /> 다시 불러오기
                </button>
              </div>
            ) : modeSets.length === 0 ? (
              <div className="lm-empty"><b>아직 만든 과제가 없어요.</b><span>왼쪽에서 지문을 붙여 넣어 만들어 보세요.</span></div>
            ) : (
              <ul className="cr-set-list">
                {modeSets.map(set => (
                  <li key={set.id}>
                    <button type="button" className="cr-set-row" onClick={() => setSelectedSetId(set.id)}>
                      <span className="cr-set-title">{set.title}</span>
                      <span className="cr-set-meta">
                        {set.sentences.length}문장 · {formatDateTime(set.createdAt)}
                      </span>
                      <span className={`cr-badge ${set.status === 'open' ? 'open' : 'closed'}`}>
                        {set.status === 'open' ? '제출 받는 중' : '마감 (게시판에서 숨김)'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function NewSetForm({
  mode,
  onCreated,
  onFeedback,
}: {
  mode: CorrectionMode;
  onCreated: (set: CorrectionSet) => void;
  onFeedback: (feedback: Feedback) => void;
}) {
  const [title, setTitle] = useState('');
  const [passage, setPassage] = useState('');
  const [sentenceText, setSentenceText] = useState('');
  const [saving, setSaving] = useState(false);
  const guide = MODE_GUIDE[mode];
  const sentences = sentenceText.split('\n').map(line => line.trim()).filter(Boolean);
  const tooMany = sentences.length > MAX_SENTENCES;

  const handleSplit = () => {
    setSentenceText(splitSentences(passage).join('\n'));
  };

  const handleCreate = async () => {
    if (!title.trim() || sentences.length === 0 || tooMany) return;
    setSaving(true);
    onFeedback(null);
    try {
      onCreated(await correctionsApi.createSet({ mode, title: title.trim(), sentences }));
    } catch (error) {
      onFeedback({ tone: 'error', message: `과제를 만들지 못했습니다: ${errorMessage(error)}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="lm-card" aria-labelledby="cr-new-heading">
      <div className="lm-card-heading">
        <span className="lm-card-icon"><Plus size={19} /></span>
        <div>
          <h3 id="cr-new-heading">새 {MODE_LABELS[mode]} 과제 만들기</h3>
          <p>{guide.paste} 문장마다 나눠서 학생이 한 줄씩 적게 됩니다.</p>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="cr-title">과제 제목 *</label>
        <input
          id="cr-title"
          className="form-control"
          value={title}
          maxLength={120}
          placeholder="예: 중2 3과 본문"
          onChange={event => setTitle(event.target.value)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="cr-passage">지문 붙여넣기</label>
        <textarea
          id="cr-passage"
          className="form-control cr-passage"
          value={passage}
          placeholder={guide.placeholder}
          onChange={event => setPassage(event.target.value)}
        />
        <button className="btn btn-secondary cr-split" type="button" onClick={handleSplit} disabled={!passage.trim()}>
          <Scissors size={16} /> 문장 나누기
        </button>
      </div>

      <div className="form-group">
        <label htmlFor="cr-sentences">문장 목록 (한 줄에 한 문장 · 직접 고칠 수 있어요)</label>
        <textarea
          id="cr-sentences"
          className="form-control cr-sentences"
          value={sentenceText}
          placeholder="‘문장 나누기’를 누르면 여기에 한 줄씩 들어갑니다."
          onChange={event => setSentenceText(event.target.value)}
        />
        <div className={`lm-counter${tooMany ? ' cr-over' : ''}`}>
          {sentences.length}문장{tooMany ? ` · 최대 ${MAX_SENTENCES}문장까지 가능해요` : ''}
        </div>
      </div>

      <button
        className="btn btn-primary lm-publish"
        type="button"
        onClick={() => void handleCreate()}
        disabled={saving || !title.trim() || sentences.length === 0 || tooMany}
      >
        <Plus size={17} /> {saving ? '올리는 중...' : '게시판에 올리기'}
      </button>
    </section>
  );
}

function SetDetail({
  set,
  onBack,
  onFeedback,
  onSetChange,
  onSetDeleted,
}: {
  set: CorrectionSet;
  onBack: () => void;
  onFeedback: (feedback: Feedback) => void;
  onSetChange: (set: CorrectionSet) => void;
  onSetDeleted: (id: string) => void;
}) {
  const [submissions, setSubmissions] = useState<CorrectionSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [openId, setOpenId] = useState('');
  const [busy, setBusy] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    correctionsApi.listSubmissions(set.id)
      .then(rows => {
        if (!active) return;
        setSubmissions(rows);
        setLoadError('');
      })
      .catch(error => {
        if (active) setLoadError(`제출을 불러오지 못했습니다: ${errorMessage(error)}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [set.id, reloadKey]);

  const toggleStatus = async () => {
    const status = set.status === 'open' ? 'closed' : 'open';
    setBusy(true);
    try {
      await correctionsApi.updateSet(set.id, { status });
      onSetChange({ ...set, status });
      onFeedback({ tone: 'success', message: status === 'open' ? '게시판에 다시 올렸습니다.' : '제출을 마감하고 게시판에서 숨겼습니다. 학생은 ‘내 제출’에서 계속 볼 수 있어요.' });
    } catch (error) {
      onFeedback({ tone: 'error', message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const deleteSet = async () => {
    if (!window.confirm(`‘${set.title}’ 과제와 학생 제출 ${submissions.length}건을 모두 삭제할까요? 복구할 수 없습니다.`)) return;
    setBusy(true);
    try {
      await correctionsApi.deleteSet(set.id);
      onSetDeleted(set.id);
      onFeedback({ tone: 'success', message: '과제를 삭제했습니다.' });
    } catch (error) {
      onFeedback({ tone: 'error', message: errorMessage(error) });
      setBusy(false);
    }
  };

  const openSubmission = submissions.find(item => item.id === openId) ?? null;

  return (
    <div className="cr-detail">
      <section className="lm-card">
        <div className="cr-detail-head">
          <button className="btn btn-secondary" type="button" onClick={onBack}>← 목록</button>
          <div className="cr-detail-title">
            <h3>{set.title}</h3>
            <p>{MODE_LABELS[set.mode]} · {set.sentences.length}문장</p>
          </div>
          <span className={`cr-badge ${set.status === 'open' ? 'open' : 'closed'}`}>{set.status === 'open' ? '제출 받는 중' : '마감 (게시판에서 숨김)'}</span>
        </div>
        <div className="lm-item-actions">
          <button className="btn btn-secondary" type="button" onClick={() => void toggleStatus()} disabled={busy}>
            {set.status === 'open' ? <><Lock size={16} /> 제출 마감</> : <><Unlock size={16} /> 다시 열기</>}
          </button>
          <button className="btn btn-danger lm-delete" type="button" onClick={() => void deleteSet()} disabled={busy}><Trash2 size={16} /> 과제 삭제</button>
        </div>
      </section>

      {openSubmission ? (
        <SubmissionReview
          key={openSubmission.id}
          set={set}
          submission={openSubmission}
          onClose={() => setOpenId('')}
          onFeedback={onFeedback}
          onChange={next => setSubmissions(current => current.map(item => item.id === next.id ? next : item))}
          onDeleted={id => {
            setSubmissions(current => current.filter(item => item.id !== id));
            setOpenId('');
          }}
        />
      ) : (
        <section className="lm-card">
          <div className="cr-list-toolbar">
            <h3>제출 {submissions.length}건</h3>
            <div className="cr-list-tools">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => printDocument(buildCorrectionPrintHtml(set, [...submissions].sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'))))}
                disabled={loading || submissions.length === 0}
              >
                <Printer size={15} /> 전체 인쇄
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => { setLoading(true); setReloadKey(key => key + 1); }} disabled={loading}>
                <RefreshCw size={15} /> 새로고침
              </button>
            </div>
          </div>
          {loading ? (
            <div className="lm-empty" role="status"><b>불러오는 중...</b></div>
          ) : loadError ? (
            <div className="lm-empty lm-load-error" role="alert"><span>{loadError}</span></div>
          ) : submissions.length === 0 ? (
            <div className="lm-empty"><b>아직 제출한 학생이 없어요.</b><span>학생이 코드로 들어와 제출하면 여기에 보입니다.</span></div>
          ) : (
            <ul className="cr-set-list">
              {submissions.map(item => (
                <li key={item.id}>
                  <button type="button" className="cr-set-row" onClick={() => setOpenId(item.id)}>
                    <span className="cr-set-title">{item.studentName}</span>
                    <span className="cr-set-meta">{formatDateTime(item.submittedAt)}</span>
                    <ScorePills completeness={item.completeness} accuracy={item.accuracy} />
                    {item.gradingStatus === 'failed' && <span className="cr-badge failed">AI 첨삭 실패</span>}
                    <span className={`cr-badge ${item.published ? 'open' : 'pending'}`}>{item.published ? '공개함' : '검토 전'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function SubmissionReview({
  set,
  submission,
  onClose,
  onFeedback,
  onChange,
  onDeleted,
}: {
  set: CorrectionSet;
  submission: CorrectionSubmission;
  onClose: () => void;
  onFeedback: (feedback: Feedback) => void;
  onChange: (submission: CorrectionSubmission) => void;
  onDeleted: (id: string) => void;
}) {
  const [items, setItems] = useState<CorrectionItem[]>(() => set.sentences.map((_, index) => withAutoMarks(submission.items[index] ?? {
    answer: '', corrected: '', explanation: '', completeness: 0, accuracy: 0,
  })));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const scores = averageScores(items);

  const updateItem = (index: number, patch: Partial<CorrectionItem>) => {
    setItems(current => current.map((item, i) => i === index ? { ...item, ...patch } : item));
    setDirty(true);
  };

  const save = async (published = submission.published) => {
    setBusy(true);
    try {
      await correctionsApi.updateSubmission(submission.id, { items, published });
      onChange({ ...submission, items, published, ...averageScores(items) });
      setDirty(false);
      onFeedback({
        tone: 'success',
        message: published && !submission.published ? '저장하고 공개했습니다. 학생이 ‘내 제출’에서 볼 수 있어요.' : !published && submission.published ? '공개를 취소했습니다.' : '저장했습니다.',
      });
    } catch (error) {
      onFeedback({ tone: 'error', message: `저장하지 못했습니다: ${errorMessage(error)}` });
    } finally {
      setBusy(false);
    }
  };

  const regrade = async () => {
    if (dirty && !window.confirm('고친 내용이 AI 첨삭으로 덮어써집니다. 계속할까요?')) return;
    setBusy(true);
    try {
      const result = await correctionsApi.regrade(submission.id);
      setItems(result.items.map(withAutoMarks));
      setDirty(false);
      onChange({ ...submission, items: result.items, completeness: result.completeness, accuracy: result.accuracy, gradingStatus: 'graded' });
      onFeedback({ tone: 'success', message: 'AI 첨삭을 다시 받았습니다.' });
    } catch (error) {
      onFeedback({ tone: 'error', message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const copyResult = async () => {
    try {
      await copyText(formatCorrectionForCopy(set, { studentName: submission.studentName, items }));
      onFeedback({ tone: 'success', message: '첨삭 결과를 복사했습니다. 카톡 등에 붙여 넣으세요.' });
    } catch (error) {
      onFeedback({ tone: 'error', message: errorMessage(error) });
    }
  };

  const remove = async () => {
    if (!window.confirm(`${submission.studentName} 학생의 제출을 삭제할까요? 복구할 수 없습니다.`)) return;
    setBusy(true);
    try {
      await correctionsApi.deleteSubmission(submission.id);
      onDeleted(submission.id);
      onFeedback({ tone: 'success', message: '제출을 삭제했습니다.' });
    } catch (error) {
      onFeedback({ tone: 'error', message: errorMessage(error) });
      setBusy(false);
    }
  };

  const close = () => {
    if (dirty && !window.confirm('저장하지 않은 수정이 있습니다. 닫을까요?')) return;
    onClose();
  };

  return (
    <section className="lm-card cr-review">
      <div className="cr-detail-head">
        <button className="btn btn-secondary" type="button" onClick={close}><X size={15} /> 닫기</button>
        <div className="cr-detail-title">
          <h3>{submission.studentName}</h3>
          <p>{formatDateTime(submission.submittedAt)} 제출 · {submission.published ? '학생에게 공개됨' : '아직 공개 전'}</p>
        </div>
        <ScorePills {...scores} />
      </div>

      {submission.gradingStatus === 'failed' && (
        <div className="lm-alert error" role="alert">
          <AlertTriangle size={17} />
          <span>제출할 때 AI 첨삭에 실패했어요. ‘AI 다시 첨삭’을 누르거나 직접 적어 주세요.</span>
        </div>
      )}

      <ol className="cr-review-list">
        {set.sentences.map((sentence, index) => {
          const item = items[index];
          return (
            <li key={index} className="cr-review-item">
              <p className="cr-source"><span>{index + 1}</span>{sentence}</p>
              <p className="cr-answer"><b>학생 답</b>{item.answer || <em>(빈칸)</em>}</p>
              <div className="cr-field">
                <b>첨삭</b>
                <MarkEditor
                  answer={item.answer}
                  value={item.corrected}
                  onChange={corrected => updateItem(index, { corrected, marked: true })}
                />
              </div>
              <label className="cr-field">
                <b>설명</b>
                <textarea className="form-control" value={item.explanation} onChange={event => updateItem(index, { explanation: event.target.value })} />
              </label>
              <div className="cr-percent-row">
                <label>완성도
                  <input type="number" min={0} max={100} className="form-control" value={item.completeness}
                    onChange={event => updateItem(index, { completeness: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} />%
                </label>
                <label>정확도
                  <input type="number" min={0} max={100} className="form-control" value={item.accuracy}
                    onChange={event => updateItem(index, { accuracy: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} />%
                </label>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="lm-item-actions cr-review-actions">
        <button className="btn btn-primary" type="button" onClick={() => void save()} disabled={busy || !dirty}><Save size={16} /> 저장</button>
        {submission.published ? (
          <button className="btn btn-secondary" type="button" onClick={() => void save(false)} disabled={busy}><EyeOff size={16} /> 공개 취소</button>
        ) : (
          <button className="btn btn-accent" type="button" onClick={() => void save(true)} disabled={busy}><Eye size={16} /> 저장하고 학생에게 공개</button>
        )}
        <button className="btn btn-secondary" type="button" onClick={() => void copyResult()}><Copy size={16} /> 첨삭 복사</button>
        <button className="btn btn-secondary" type="button" onClick={() => printDocument(buildCorrectionPrintHtml(set, [{ ...submission, items }]))}><Printer size={16} /> 인쇄</button>
        <button className="btn btn-secondary" type="button" onClick={() => void regrade()} disabled={busy}><RefreshCw size={16} /> AI 다시 첨삭</button>
        <button className="btn btn-danger lm-delete" type="button" onClick={() => void remove()} disabled={busy}><Trash2 size={16} /> 제출 삭제</button>
      </div>
    </section>
  );
}

function StudentsPanel({ onFeedback }: { onFeedback: (feedback: Feedback) => void }) {
  const [students, setStudents] = useState<CorrectionStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    let active = true;
    correctionsApi.listStudents()
      .then(rows => {
        if (!active) return;
        setStudents(rows);
        setLoadError('');
      })
      .catch(error => {
        if (active) setLoadError(`학생 목록을 불러오지 못했습니다: ${errorMessage(error)}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = students.filter(student => student.name.includes(query.trim()));

  const resetPin = async (student: CorrectionStudent) => {
    const pin = window.prompt(`${student.name} 학생의 새 비번(숫자 4자리)을 적어 주세요.`)?.trim();
    if (pin === undefined) return;
    if (!isValidPin(pin)) {
      onFeedback({ tone: 'error', message: '비번은 숫자 4자리예요.' });
      return;
    }
    setBusyId(student.id);
    try {
      await correctionsApi.resetStudentPin(student.id, pin);
      setStudents(current => current.map(item => item.id === student.id ? { ...item, locked: false } : item));
      onFeedback({ tone: 'success', message: `${student.name} 학생 비번을 ${pin}(으)로 바꿨습니다. 학생에게 알려 주세요.` });
    } catch (error) {
      onFeedback({ tone: 'error', message: errorMessage(error) });
    } finally {
      setBusyId('');
    }
  };

  const remove = async (student: CorrectionStudent) => {
    if (!window.confirm(`${student.name} 학생 계정과 제출한 답안을 모두 삭제할까요? 복구할 수 없습니다.`)) return;
    setBusyId(student.id);
    try {
      await correctionsApi.deleteStudent(student.id);
      setStudents(current => current.filter(item => item.id !== student.id));
      onFeedback({ tone: 'success', message: `${student.name} 학생을 삭제했습니다.` });
    } catch (error) {
      onFeedback({ tone: 'error', message: errorMessage(error) });
    } finally {
      setBusyId('');
    }
  };

  return (
    <section className="lm-card">
      <div className="lm-card-heading">
        <span className="lm-card-icon"><KeyRound size={19} /></span>
        <div>
          <h3>게시판 학생 비번</h3>
          <p>학생이 처음 제출할 때 이름과 4자리 비번을 직접 정해요. 비번을 잊으면 여기서 새 비번으로 바꿔 주세요.</p>
        </div>
      </div>
      <input className="form-control cr-student-search" value={query} placeholder="이름 검색" onChange={event => setQuery(event.target.value)} />
      {loading ? (
        <div className="lm-empty" role="status"><b>불러오는 중...</b></div>
      ) : loadError ? (
        <div className="lm-empty lm-load-error" role="alert"><span>{loadError}</span></div>
      ) : filtered.length === 0 ? (
        <div className="lm-empty"><b>{students.length === 0 ? '아직 등록한 학생이 없어요.' : '검색 결과가 없어요.'}</b></div>
      ) : (
        <ul className="cr-set-list">
          {filtered.map(student => {
            return (
              <li key={student.id} className="cr-student-row">
                <span className="cr-set-title">{student.name}</span>
                <span className="cr-set-meta">{formatDateTime(student.createdAt)} 등록</span>
                {student.locked && <span className="cr-badge failed">비번 오류로 잠김</span>}
                <button className="btn btn-secondary" type="button" onClick={() => void resetPin(student)} disabled={Boolean(busyId)}>
                  <KeyRound size={15} /> 비번 바꾸기
                </button>
                <button className="btn btn-danger" type="button" onClick={() => void remove(student)} disabled={Boolean(busyId)}>
                  <Trash2 size={15} /> 삭제
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 학생 게시판 (로그인 없음) — #/board/<선생님 id>
// 공용 태블릿이라 로그인은 화면 메모리에만 두고, 새로고침·‘다음 학생’이면 사라진다.
// ---------------------------------------------------------------------------

type BoardView = { kind: 'list' } | { kind: 'set'; setId: string } | { kind: 'mine' };
type StudentSession = { token: string; name: string };

function PublicShell({ children }: { children: React.ReactNode }) {
  return <div className="cr-public">{children}</div>;
}

export function PublicCorrectionBoardRoute({ ownerId }: { ownerId: string }) {
  const [view, setView] = useState<BoardView>({ kind: 'list' });
  const [session, setSession] = useState<StudentSession | null>(null);
  // 로그인이 필요할 때 로그인 후 이동할 화면
  const [loginFor, setLoginFor] = useState<BoardView | null>(null);
  const [notice, setNotice] = useState('');

  const go = (next: BoardView) => {
    setNotice('');
    window.scrollTo(0, 0);
    if (next.kind !== 'list' && !session) {
      setLoginFor(next);
      return;
    }
    setLoginFor(null);
    setView(next);
  };

  const logout = () => {
    setSession(null);
    setLoginFor(null);
    setView({ kind: 'list' });
    setNotice('');
    window.scrollTo(0, 0);
  };

  // 자식 화면의 불러오기 effect가 매 렌더마다 다시 돌지 않도록 고정한다.
  const sessionExpired = useCallback((message: string) => {
    setSession(null);
    setNotice(message);
    setLoginFor(view);
  }, [view]);

  return (
    <PublicShell>
      <header className="cr-board-head">
        <div>
          <h1>해석·영작 게시판</h1>
          {session && <p><b>{session.name}</b> 로그인 중</p>}
        </div>
        <nav>
          <button className={`btn ${view.kind === 'list' && !loginFor ? 'btn-primary' : 'btn-secondary'}`} type="button" onClick={() => go({ kind: 'list' })}>과제 목록</button>
          <button className={`btn ${view.kind === 'mine' || loginFor?.kind === 'mine' ? 'btn-primary' : 'btn-secondary'}`} type="button" onClick={() => go({ kind: 'mine' })}>내 제출 보기</button>
          {session && <button className="btn btn-secondary" type="button" onClick={logout}>다음 학생 (로그아웃)</button>}
        </nav>
      </header>

      {notice && <p className="cr-error cr-notice" role="alert">{notice}</p>}

      {loginFor ? (
        <LoginPanel
          ownerId={ownerId}
          purpose={loginFor.kind === 'mine' ? '내 제출을 보려면' : '답을 적으려면'}
          onCancel={() => setLoginFor(null)}
          onLogin={next => {
            setSession(next);
            setNotice('');
            setView(loginFor);
            setLoginFor(null);
          }}
        />
      ) : view.kind === 'set' && session ? (
        <SetAnswerView
          key={view.setId}
          ownerId={ownerId}
          setId={view.setId}
          session={session}
          onExpired={sessionExpired}
          onGo={go}
          onLogout={logout}
        />
      ) : view.kind === 'mine' && session ? (
        <MySubmissionsView session={session} onExpired={sessionExpired} />
      ) : (
        <BoardList ownerId={ownerId} onOpen={setId => go({ kind: 'set', setId })} />
      )}
    </PublicShell>
  );
}

function BoardList({ ownerId, onOpen }: { ownerId: string; onOpen: (setId: string) => void }) {
  const [sets, setSets] = useState<BoardSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    correctionsApi.publicBoard(ownerId)
      .then(rows => {
        if (active) setSets(rows);
      })
      .catch(e => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ownerId]);

  if (loading) return <div className="cr-public-card">불러오는 중...</div>;
  if (error) return <div className="cr-public-card"><h2>게시판을 열 수 없어요</h2><p>{error}</p></div>;
  if (sets.length === 0) return <div className="cr-public-card"><h2>올라온 과제가 없어요</h2><p>선생님이 과제를 올리면 여기에 보여요.</p></div>;

  return (
    <ul className="cr-board-list">
      {sets.map(set => (
        <li key={set.id}>
          <button type="button" className="cr-board-item" onClick={() => onOpen(set.id)}>
            <span className={`cr-badge ${set.mode === 'translate' ? 'open' : 'pending'}`}>{MODE_LABELS[set.mode]}</span>
            <span className="cr-board-title">{set.title}</span>
            <span className="cr-set-meta">{set.sentenceCount}문장 · {formatDateTime(set.createdAt)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function LoginPanel({
  ownerId,
  purpose,
  onCancel,
  onLogin,
}: {
  ownerId: string;
  purpose: string;
  onCancel: () => void;
  onLogin: (session: StudentSession) => void;
}) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('이름을 적어 주세요.');
    if (!isValidPin(pin)) return setError('비번은 숫자 4자리예요.');
    setBusy(true);
    setError('');
    try {
      let result = await correctionsApi.publicLogin(ownerId, trimmed, pin);
      if (result.needsRegister) {
        const ok = window.confirm(`‘${trimmed}’ 이름은 처음이에요.\n이 이름과 비번 ${pin}(으)로 등록할까요?\n\n비번은 다음에도 써야 하니 꼭 기억해 주세요.`);
        if (!ok) return;
        result = await correctionsApi.publicLogin(ownerId, trimmed, pin, true);
      }
      if (!result.needsRegister) onLogin({ token: result.token, name: result.name });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="cr-public-card cr-login" onSubmit={event => void submit(event)}>
      <h2>{purpose} 이름과 비번을 넣어 주세요</h2>
      <p>처음이면 비번 4자리를 새로 정하면 돼요.</p>
      <label htmlFor="cr-login-name">이름</label>
      <input id="cr-login-name" className="form-control" value={name} maxLength={20} autoComplete="off" onChange={event => setName(event.target.value)} autoFocus />
      <label htmlFor="cr-login-pin">비번 (숫자 4자리)</label>
      <input
        id="cr-login-pin"
        className="form-control"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={pin}
        onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
      />
      {error && <p className="cr-error" role="alert">{error}</p>}
      <div className="cr-done-actions">
        <button className="btn btn-secondary" type="button" onClick={onCancel}>취소</button>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '확인 중...' : '들어가기'}</button>
      </div>
    </form>
  );
}

function SetAnswerView({
  ownerId,
  setId,
  session,
  onExpired,
  onGo,
  onLogout,
}: {
  ownerId: string;
  setId: string;
  session: StudentSession;
  onExpired: (message: string) => void;
  onGo: (view: BoardView) => void;
  onLogout: () => void;
}) {
  const [set, setSet] = useState<PublicCorrectionSet | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [previous, setPrevious] = useState<{ published: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState<{ resubmitted: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([correctionsApi.publicGetSet(ownerId, setId), correctionsApi.publicMySubmission(session.token, setId)])
      .then(([loaded, mine]) => {
        if (!active) return;
        setSet(loaded);
        setPrevious(mine ? { published: mine.published } : null);
        setAnswers(loaded.sentences.map((_, index) => mine?.answers[index] ?? ''));
      })
      .catch(e => {
        if (!active) return;
        if (e instanceof LoginRequiredError) onExpired(e.message);
        else setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ownerId, setId, session.token, onExpired]);

  if (loading) return <div className="cr-public-card">과제를 불러오는 중...</div>;
  if (error || !set) return <div className="cr-public-card"><h2>열 수 없어요</h2><p>{error || '과제를 찾을 수 없습니다.'}</p></div>;

  if (previous?.published) {
    return (
      <div className="cr-public-card cr-done">
        <h2>이미 첨삭이 공개된 과제예요</h2>
        <p>선생님이 첨삭을 공개해서 다시 낼 수 없어요.</p>
        <div className="cr-done-actions">
          <button className="btn btn-primary" type="button" onClick={() => onGo({ kind: 'mine' })}>내 제출 보기</button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="cr-public-card cr-done">
        <Check size={40} />
        <h2>{session.name} {done.resubmitted ? '다시 제출 완료!' : '제출 완료!'}</h2>
        <p>선생님이 첨삭을 확인하면 ‘내 제출 보기’에서 볼 수 있어요. 그 전까지는 다시 고쳐서 낼 수 있어요.</p>
        <div className="cr-done-actions">
          <button className="btn btn-secondary" type="button" onClick={() => onGo({ kind: 'list' })}>다른 과제 하기</button>
          <button className="btn btn-primary" type="button" onClick={onLogout}>다음 학생 (로그아웃)</button>
        </div>
      </div>
    );
  }

  const guide = MODE_GUIDE[set.mode];
  const filled = answers.filter(answer => answer.trim()).length;

  const submit = async () => {
    if (filled === 0) {
      setSubmitError('한 문장 이상 적어 주세요.');
      return;
    }
    if (filled < set.sentences.length && !window.confirm(`${set.sentences.length - filled}문장이 비어 있어요. 그래도 제출할까요?`)) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      setDone(await correctionsApi.publicSubmit(session.token, set.id, answers));
      window.scrollTo(0, 0);
    } catch (e) {
      if (e instanceof LoginRequiredError) onExpired(e.message);
      else setSubmitError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <header className="cr-public-head">
        <span className={`cr-badge ${set.mode === 'translate' ? 'open' : 'pending'}`}>{MODE_LABELS[set.mode]}</span>
        <h1>{set.title}</h1>
        <p>{guide.student}</p>
        {previous && <p className="cr-resubmit-note">전에 낸 답이 들어 있어요. 고쳐서 다시 내면 새 답으로 바뀌어요.</p>}
      </header>

      <ol className="cr-public-list">
        {set.sentences.map((sentence, index) => (
          <li key={index} className="cr-public-item">
            <p className="cr-source"><span>{index + 1}</span>{sentence}</p>
            <textarea
              className="form-control"
              value={answers[index] ?? ''}
              maxLength={1000}
              placeholder={guide.answerPlaceholder}
              aria-label={`${index + 1}번 문장 답`}
              lang={set.mode === 'compose' ? 'en' : 'ko'}
              autoCapitalize={set.mode === 'compose' ? 'sentences' : 'off'}
              spellCheck={false}
              onChange={event => setAnswers(current => current.map((answer, i) => i === index ? event.target.value : answer))}
            />
          </li>
        ))}
      </ol>

      <footer className="cr-public-submit">
        <p>{session.name} · {filled}/{set.sentences.length}문장 작성</p>
        {submitError && <p className="cr-error" role="alert">{submitError}</p>}
        <button className="btn btn-primary" type="button" onClick={() => void submit()} disabled={submitting}>
          <Send size={17} /> {submitting ? '제출하는 중... (최대 1분)' : previous ? '다시 제출하기' : '제출하기'}
        </button>
      </footer>
    </>
  );
}

function MySubmissionsView({ session, onExpired }: { session: StudentSession; onExpired: (message: string) => void }) {
  const [items, setItems] = useState<MySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState('');

  useEffect(() => {
    let active = true;
    correctionsApi.publicMyList(session.token)
      .then(rows => {
        if (active) setItems(rows);
      })
      .catch(e => {
        if (!active) return;
        if (e instanceof LoginRequiredError) onExpired(e.message);
        else setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session.token, onExpired]);

  if (loading) return <div className="cr-public-card">불러오는 중...</div>;
  if (error) return <div className="cr-public-card"><h2>불러올 수 없어요</h2><p>{error}</p></div>;
  if (items.length === 0) return <div className="cr-public-card"><h2>아직 제출한 과제가 없어요</h2><p>‘과제 목록’에서 과제를 골라 답을 적어 보세요.</p></div>;

  return (
    <ul className="cr-board-list">
      {items.map(item => {
        const open = openId === item.setId;
        return (
          <li key={item.setId} className="cr-mine">
            <button type="button" className="cr-board-item" onClick={() => setOpenId(open ? '' : item.setId)} aria-expanded={open}>
              <span className={`cr-badge ${item.mode === 'translate' ? 'open' : 'pending'}`}>{MODE_LABELS[item.mode]}</span>
              <span className="cr-board-title">{item.title}</span>
              <span className="cr-set-meta">{formatDateTime(item.submittedAt)} 제출</span>
              {item.published
                ? <ScorePills completeness={item.completeness ?? 0} accuracy={item.accuracy ?? 0} />
                : <span className="cr-badge closed">선생님 확인 중</span>}
            </button>
            {open && (
              <ol className="cr-public-list cr-mine-body">
                {item.sentences.map((sentence, index) => {
                  const correction = item.items?.[index];
                  const answer = item.answers[index];
                  return (
                    <li key={index} className="cr-public-item">
                      <p className="cr-source"><span>{index + 1}</span>{sentence}</p>
                      <p className="cr-answer"><b>내 답</b>{answer || <em>(빈칸)</em>}</p>
                      {correction?.corrected && <p className="cr-corrected"><b>첨삭</b><MarkedText value={correction.corrected} /></p>}
                      {correction?.explanation && <p className="cr-explanation"><b>설명</b>{correction.explanation}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </li>
        );
      })}
    </ul>
  );
}
