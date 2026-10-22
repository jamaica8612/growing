import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Languages,
  Lock,
  PenLine,
  Plus,
  RefreshCw,
  Save,
  Scissors,
  Send,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import {
  MAX_SENTENCES,
  MODE_LABELS,
  averageScores,
  correctionJoinUrl,
  correctionResultUrl,
  correctionsApi,
  formatCorrectionForCopy,
  splitSentences,
  type CorrectionItem,
  type CorrectionMode,
  type CorrectionSet,
  type CorrectionSubmission,
  type PublicCorrectionResult,
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

// ---------------------------------------------------------------------------
// 선생님 화면
// ---------------------------------------------------------------------------

export function Corrections() {
  const [mode, setMode] = useState<CorrectionMode>('translate');
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

  const changeMode = (next: CorrectionMode) => {
    setMode(next);
    setSelectedSetId('');
    setFeedback(null);
  };

  return (
    <div className="lm-root cr-root">
      <div className="cr-mode-tabs" role="tablist" aria-label="첨삭 종류">
        {(['translate', 'compose'] as CorrectionMode[]).map(item => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={mode === item}
            className={`cr-mode-tab${mode === item ? ' on' : ''}`}
            onClick={() => changeMode(item)}
          >
            {item === 'translate' ? <Languages size={17} /> : <PenLine size={17} />}
            {MODE_LABELS[item]} 첨삭
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

      {selectedSet ? (
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
              setFeedback({ tone: 'success', message: `‘${set.title}’ 과제를 만들었습니다. 코드 ${set.shortCode}를 학생에게 알려 주세요.` });
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
                        코드 <b>{set.shortCode}</b> · {set.sentences.length}문장 · {formatDateTime(set.createdAt)}
                      </span>
                      <span className={`cr-badge ${set.status === 'open' ? 'open' : 'closed'}`}>
                        {set.status === 'open' ? '제출 받는 중' : '마감'}
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
        <Plus size={17} /> {saving ? '만드는 중...' : '과제 만들고 코드 받기'}
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
  const joinUrl = correctionJoinUrl(set.shortCode);

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
      onFeedback({ tone: 'success', message: status === 'open' ? '다시 제출을 받습니다.' : '제출을 마감했습니다.' });
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

  const copyLink = async () => {
    try {
      await copyText(joinUrl);
      onFeedback({ tone: 'success', message: '학생용 링크를 복사했습니다.' });
    } catch (error) {
      onFeedback({ tone: 'error', message: errorMessage(error) });
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
          <span className={`cr-badge ${set.status === 'open' ? 'open' : 'closed'}`}>{set.status === 'open' ? '제출 받는 중' : '마감'}</span>
        </div>
        <div className="cr-code-box">
          <div>
            <span>학생 입장 코드</span>
            <b>{set.shortCode}</b>
          </div>
          <input value={joinUrl} readOnly aria-label="학생용 링크" onFocus={event => event.currentTarget.select()} />
        </div>
        <div className="lm-item-actions">
          <button className="btn btn-primary" type="button" onClick={() => void copyLink()}><Copy size={16} /> 학생 링크 복사</button>
          <a className="btn btn-secondary" href={joinUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> 학생 화면 열기</a>
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
            <button className="btn btn-secondary" type="button" onClick={() => { setLoading(true); setReloadKey(key => key + 1); }} disabled={loading}>
              <RefreshCw size={15} /> 새로고침
            </button>
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
  const [items, setItems] = useState<CorrectionItem[]>(() => set.sentences.map((_, index) => submission.items[index] ?? {
    answer: '', corrected: '', explanation: '', completeness: 0, accuracy: 0,
  }));
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
        message: published && !submission.published ? '저장하고 학생에게 공개했습니다.' : !published && submission.published ? '공개를 취소했습니다.' : '저장했습니다.',
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
      setItems(result.items);
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

  const copyResultLink = async () => {
    try {
      await copyText(correctionResultUrl(submission.resultToken));
      onFeedback({
        tone: 'success',
        message: submission.published ? '결과 링크를 복사했습니다.' : '결과 링크를 복사했습니다. 공개하기 전에는 학생에게 ‘확인 중’으로 보입니다.',
      });
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
              <label className="cr-field">
                <b>첨삭</b>
                <textarea className="form-control" value={item.corrected} onChange={event => updateItem(index, { corrected: event.target.value })} />
              </label>
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
        <button className="btn btn-secondary" type="button" onClick={() => void copyResultLink()}><ExternalLink size={16} /> 결과 링크 복사</button>
        <button className="btn btn-secondary" type="button" onClick={() => void regrade()} disabled={busy}><RefreshCw size={16} /> AI 다시 첨삭</button>
        <button className="btn btn-danger lm-delete" type="button" onClick={() => void remove()} disabled={busy}><Trash2 size={16} /> 제출 삭제</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 학생 화면 (로그인 없음) — #/c/CODE
// ---------------------------------------------------------------------------

function PublicShell({ children }: { children: React.ReactNode }) {
  return <div className="cr-public">{children}</div>;
}

export function PublicCorrectionRoute({ code }: { code: string }) {
  const upperCode = code.trim().toUpperCase();
  const [set, setSet] = useState<PublicCorrectionSet | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [resultToken, setResultToken] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await correctionsApi.publicGetSet(upperCode);
        setSet(loaded);
        setAnswers(loaded.sentences.map(() => ''));
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [upperCode]);

  if (loading) return <PublicShell><div className="cr-public-card">과제를 불러오는 중...</div></PublicShell>;
  if (error || !set) {
    return (
      <PublicShell>
        <div className="cr-public-card">
          <h2>들어갈 수 없어요</h2>
          <p>{error || '과제를 찾을 수 없습니다.'}</p>
        </div>
      </PublicShell>
    );
  }

  const guide = MODE_GUIDE[set.mode];
  const filled = answers.filter(answer => answer.trim()).length;

  const reset = () => {
    setAnswers(set.sentences.map(() => ''));
    setName('');
    setResultToken('');
    setSubmitError('');
    window.scrollTo(0, 0);
  };

  const submit = async () => {
    if (!name.trim()) {
      setSubmitError('이름을 적어 주세요.');
      return;
    }
    if (filled === 0) {
      setSubmitError('한 문장 이상 적어 주세요.');
      return;
    }
    if (filled < set.sentences.length && !window.confirm(`${set.sentences.length - filled}문장이 비어 있어요. 그래도 제출할까요?`)) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await correctionsApi.publicSubmit(upperCode, name.trim(), answers);
      setResultToken(result.resultToken);
      window.scrollTo(0, 0);
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (resultToken) {
    return (
      <PublicShell>
        <div className="cr-public-card cr-done">
          <Check size={40} />
          <h2>{name.trim()} 제출 완료!</h2>
          <p>선생님이 첨삭을 확인한 뒤에 결과를 볼 수 있어요.</p>
          <div className="cr-done-actions">
            <a className="btn btn-secondary" href={correctionResultUrl(resultToken)}>내 결과 페이지</a>
            <button className="btn btn-primary" type="button" onClick={reset}>다음 학생 작성하기</button>
          </div>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <header className="cr-public-head">
        <span className="cr-badge open">{MODE_LABELS[set.mode]}</span>
        <h1>{set.title}</h1>
        <p>{guide.student}</p>
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
        <p>{filled}/{set.sentences.length}문장 작성</p>
        <label htmlFor="cr-student-name">이름</label>
        <input
          id="cr-student-name"
          className="form-control"
          value={name}
          maxLength={20}
          placeholder="이름을 적어 주세요"
          onChange={event => setName(event.target.value)}
        />
        {submitError && <p className="cr-error" role="alert">{submitError}</p>}
        <button className="btn btn-primary" type="button" onClick={() => void submit()} disabled={submitting}>
          <Send size={17} /> {submitting ? 'AI가 첨삭하는 중... (최대 1분)' : '제출하기'}
        </button>
      </footer>
    </PublicShell>
  );
}

// ---------------------------------------------------------------------------
// 학생 결과 화면 — #/c-result/TOKEN (선생님이 공개한 뒤에만 첨삭 표시)
// ---------------------------------------------------------------------------

export function PublicCorrectionResultRoute({ token }: { token: string }) {
  const [result, setResult] = useState<PublicCorrectionResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    correctionsApi.publicGetResult(token.trim())
      .then(loaded => {
        if (!active) return;
        setResult(loaded);
        setError('');
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
  }, [token, reloadKey]);

  if (loading) return <PublicShell><div className="cr-public-card">결과를 불러오는 중...</div></PublicShell>;
  if (error || !result) {
    return <PublicShell><div className="cr-public-card"><h2>결과를 볼 수 없어요</h2><p>{error}</p></div></PublicShell>;
  }

  if (!result.published || !result.items) {
    return (
      <PublicShell>
        <div className="cr-public-card cr-done">
          <h2>{result.studentName}의 {result.set.title}</h2>
          <p>선생님이 첨삭을 확인하고 있어요. 나중에 다시 열어 주세요.</p>
          <button className="btn btn-secondary" type="button" onClick={() => { setLoading(true); setReloadKey(key => key + 1); }}><RefreshCw size={16} /> 다시 확인</button>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <header className="cr-public-head">
        <span className="cr-badge open">{MODE_LABELS[result.set.mode]} 첨삭 결과</span>
        <h1>{result.set.title}</h1>
        <p>{result.studentName}</p>
        <ScorePills completeness={result.completeness ?? 0} accuracy={result.accuracy ?? 0} />
      </header>
      <ol className="cr-public-list">
        {result.set.sentences.map((sentence, index) => {
          const item = result.items?.[index];
          return (
            <li key={index} className="cr-public-item">
              <p className="cr-source"><span>{index + 1}</span>{sentence}</p>
              <p className="cr-answer"><b>내 답</b>{item?.answer || <em>(빈칸)</em>}</p>
              {item?.corrected && <p className="cr-corrected"><b>첨삭</b>{item.corrected}</p>}
              {item?.explanation && <p className="cr-explanation"><b>설명</b>{item.explanation}</p>}
            </li>
          );
        })}
      </ol>
    </PublicShell>
  );
}
