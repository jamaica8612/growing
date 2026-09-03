import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  FileAudio,
  Headphones,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { ListeningMaterial } from '../types';
import {
  deleteListeningMaterial,
  formatListeningFileSize,
  listListeningMaterials,
  publishListeningMaterial,
  updateListeningMaterial,
  validateListeningAudioFile,
} from '../lib/listeningMaterials';

interface ListeningMaterialsProps {
  ownerId: string;
}

type Feedback = { tone: 'success' | 'error'; message: string } | null;

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return '잠시 후 다시 시도해 주세요.';
};

const formatCreatedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
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
    if (!document.execCommand('copy')) {
      throw new Error('링크를 복사하지 못했습니다. 직접 선택해 복사해 주세요.');
    }
  } finally {
    textarea.remove();
  }
};

export function ListeningMaterials({ ownerId }: ListeningMaterialsProps) {
  const titleId = useId();
  const descriptionId = useId();
  const fileId = useId();
  const validationSequence = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [materials, setMaterials] = useState<ListeningMaterial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [isCheckingFile, setIsCheckingFile] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingId, setDeletingId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingId, setSavingId] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);

  const focusEditAction = (materialId: string) => {
    window.requestAnimationFrame(() => {
      document.getElementById(`lm-edit-action-${materialId}`)?.focus();
    });
  };

  useEffect(() => {
    let active = true;
    void listListeningMaterials(ownerId)
      .then(rows => {
        if (active) {
          setMaterials(rows);
          setLoadError('');
        }
      })
      .catch(error => {
        if (active) setLoadError(`자료를 불러오지 못했습니다: ${errorMessage(error)}`);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ownerId]);

  const handleRetryLoad = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setLoadError('');
    try {
      setMaterials(await listListeningMaterials(ownerId));
    } catch (error) {
      setLoadError(`자료를 불러오지 못했습니다: ${errorMessage(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMaterials = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('ko-KR');
    if (!keyword) return materials;
    return materials.filter(material =>
      [material.title, material.description, material.originalFileName]
        .some(value => value.toLocaleLowerCase('ko-KR').includes(keyword))
    );
  }, [materials, query]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    const previousAutoTitle = file?.name.replace(/\.[^.]+$/, '').slice(0, 120) ?? '';
    const shouldReplaceTitle = !title.trim() || title === previousAutoTitle;
    const sequence = validationSequence.current + 1;
    validationSequence.current = sequence;
    setFile(null);
    setFileError('');
    setFeedback(null);
    if (!selectedFile) {
      setIsCheckingFile(false);
      return;
    }

    setIsCheckingFile(true);
    let validation;
    try {
      validation = await validateListeningAudioFile(selectedFile);
    } catch (error) {
      if (validationSequence.current === sequence) {
        setIsCheckingFile(false);
        setFileError(`파일을 확인하지 못했습니다: ${errorMessage(error)}`);
        event.target.value = '';
      }
      return;
    }
    if (validationSequence.current !== sequence) return;
    setIsCheckingFile(false);
    if (!validation.ok) {
      setFileError(validation.message);
      event.target.value = '';
      return;
    }

    setFile(selectedFile);
    if (shouldReplaceTitle) {
      setTitle(selectedFile.name.replace(/\.[^.]+$/, '').slice(0, 120));
    }
  };

  const handlePublish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || isCheckingFile || isPublishing || isLoading || loadError) return;
    setFeedback(null);
    setIsPublishing(true);
    setUploadProgress(0);
    try {
      const material = await publishListeningMaterial({
        ownerId,
        title,
        description,
        file,
        onProgress: setUploadProgress,
      });
      setMaterials(current => [material, ...current]);
      setTitle('');
      setDescription('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setFeedback({ tone: 'success', message: '듣기 자료를 게시했습니다. 이제 링크를 복사해 클카에 붙여 넣으세요.' });
    } catch (error) {
      setFeedback({ tone: 'error', message: `게시하지 못했습니다: ${errorMessage(error)}` });
    } finally {
      setIsPublishing(false);
      setUploadProgress(0);
    }
  };

  const handleStartEdit = (material: ListeningMaterial) => {
    if (deletingId || savingId) return;
    setEditingId(material.id);
    setEditTitle(material.title);
    setEditDescription(material.description);
    setFeedback(null);
  };

  const handleCancelEdit = (materialId: string) => {
    if (savingId) return;
    setEditingId('');
    setEditTitle('');
    setEditDescription('');
    focusEditAction(materialId);
  };

  const handleSaveEdit = async (event: FormEvent<HTMLFormElement>, materialId: string) => {
    event.preventDefault();
    if (!editTitle.trim() || savingId || deletingId) return;
    setFeedback(null);
    setSavingId(materialId);
    try {
      const currentMaterial = materials.find(material => material.id === materialId);
      if (!currentMaterial) throw new Error('수정할 자료를 찾지 못했습니다.');
      const updated = await updateListeningMaterial(currentMaterial, editTitle, editDescription);
      setMaterials(current => current.map(material => material.id === materialId ? updated : material));
      setEditingId('');
      setEditTitle('');
      setEditDescription('');
      setFeedback({ tone: 'success', message: '게시글을 수정했습니다. 클카에 붙여 둔 링크는 그대로 유지됩니다.' });
      focusEditAction(materialId);
    } catch (error) {
      setFeedback({ tone: 'error', message: `수정하지 못했습니다: ${errorMessage(error)}` });
    } finally {
      setSavingId('');
    }
  };

  const handleCopy = async (material: ListeningMaterial) => {
    setFeedback(null);
    try {
      await copyText(material.publicUrl);
      setCopiedId(material.id);
      setFeedback({ tone: 'success', message: `‘${material.title}’ 링크를 복사했습니다.` });
      window.setTimeout(() => setCopiedId(current => current === material.id ? '' : current), 1800);
    } catch (error) {
      setFeedback({ tone: 'error', message: errorMessage(error) });
    }
  };

  const handleDelete = async (material: ListeningMaterial) => {
    if (deletingId || savingId) return;
    const confirmed = window.confirm(
      `‘${material.title}’ 자료를 삭제할까요?\n삭제 후 새로 여는 클카 링크는 재생되지 않습니다. 이미 열어 둔 기기에서는 캐시 때문에 잠시 재생될 수 있으며, 삭제는 복구할 수 없습니다.`,
    );
    if (!confirmed) return;

    setFeedback(null);
    setDeletingId(material.id);
    try {
      await deleteListeningMaterial(material);
      setMaterials(current => current.filter(item => item.id !== material.id));
      setFeedback({ tone: 'success', message: '듣기 자료를 삭제했습니다.' });
      window.requestAnimationFrame(() => document.getElementById('listening-board-heading')?.focus());
    } catch (error) {
      setFeedback({ tone: 'error', message: `삭제를 완료하지 못했습니다: ${errorMessage(error)}` });
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div className="lm-root">
      <section className="lm-hero" aria-labelledby="listening-materials-heading">
        <div className="lm-hero-icon" aria-hidden="true"><Headphones size={26} /></div>
        <div>
          <h3 id="listening-materials-heading">클카에 바로 연결하는 듣기 자료</h3>
          <p>음원을 올리면 학생이 로그인 없이 재생할 수 있는 고정 링크가 만들어집니다.</p>
        </div>
        <span className="lm-public-pill">링크 공개</span>
      </section>

      <div className="lm-feedback" aria-atomic="true">
        {feedback && (
          <div className={`lm-alert ${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>
            {feedback.tone === 'success' ? <Check size={17} /> : <AlertTriangle size={17} />}
            <span>{feedback.message}</span>
          </div>
        )}
      </div>

      <div className="lm-layout">
        <section className="lm-card lm-upload-card">
          <div className="lm-card-heading">
            <span className="lm-card-icon"><Upload size={19} /></span>
            <div>
              <h3>새 듣기 자료 올리기</h3>
              <p>제목과 음원을 선택한 뒤 게시하세요.</p>
            </div>
          </div>

          <form onSubmit={event => void handlePublish(event)}>
            <div className="form-group">
              <label htmlFor={titleId}>자료 제목 <span aria-hidden="true">*</span></label>
              <input
                id={titleId}
                className="form-control"
                value={title}
                maxLength={120}
                placeholder="예: 중2 3과 본문 듣기"
                onChange={event => setTitle(event.target.value)}
                disabled={isPublishing}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor={descriptionId}>설명</label>
              <textarea
                id={descriptionId}
                className="form-control lm-description"
                value={description}
                maxLength={1000}
                placeholder="교재, 단원, 과제 안내 등을 적어 두세요."
                onChange={event => setDescription(event.target.value)}
                disabled={isPublishing}
              />
              <div className="lm-counter">{description.length}/1,000</div>
            </div>

            <div className="form-group">
              <label htmlFor={fileId}>듣기 파일 <span aria-hidden="true">*</span></label>
              <div className={`lm-file-picker${fileError ? ' has-error' : ''}`}>
                <FileAudio size={23} aria-hidden="true" />
                <div>
                  <strong>{isCheckingFile ? '파일을 확인하는 중...' : file?.name ?? '오디오 파일 선택'}</strong>
                  <span>{file ? formatListeningFileSize(file.size) : 'MP3 · M4A · WAV · OGG · WebM · AAC / 최대 50MB'}</span>
                </div>
                <input
                  ref={fileInputRef}
                  id={fileId}
                  type="file"
                  accept=".mp3,.m4a,.wav,.ogg,.webm,.aac,audio/*"
                  onChange={event => void handleFileChange(event)}
                  disabled={isPublishing}
                  required
                  aria-describedby={`${fileId}-help${fileError ? ` ${fileId}-error` : ''}`}
                />
              </div>
              <p id={`${fileId}-help`} className="lm-help">6MB를 넘는 파일은 연결 오류를 자동 재시도하며 이어 올립니다. 페이지를 닫으면 중단됩니다.</p>
              {fileError && <p id={`${fileId}-error`} className="lm-field-error" role="alert">{fileError}</p>}
            </div>

            {isPublishing && (
              <div className="lm-progress" role="progressbar" aria-label="듣기 파일 업로드" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}>
                <span style={{ width: `${uploadProgress}%` }} />
                <b>{uploadProgress > 0 ? `${uploadProgress}%` : '업로드 준비 중'}</b>
              </div>
            )}

            <button
              className="btn btn-primary lm-publish"
              type="submit"
              disabled={!title.trim() || !file || isCheckingFile || isPublishing || isLoading || Boolean(loadError)}
            >
              <Upload size={17} /> {isPublishing ? '게시하는 중...' : '업로드하고 링크 만들기'}
            </button>
          </form>
        </section>

        <aside className="lm-card lm-guide" aria-label="공개 링크 사용 안내">
          <div className="lm-card-heading">
            <span className="lm-card-icon mint"><Copy size={19} /></span>
            <div>
              <h3>클카에 연결하는 방법</h3>
              <p>게시 후 세 단계면 끝납니다.</p>
            </div>
          </div>
          <ol>
            <li><b>클카 링크 복사</b> 버튼을 누릅니다.</li>
            <li>클래스카드 학습자료의 링크 입력란에 붙여 넣습니다.</li>
            <li><b>새 탭에서 확인</b>으로 학생 화면에서 재생되는지 확인합니다.</li>
          </ol>
          <div className="lm-public-warning">
            <AlertTriangle size={18} aria-hidden="true" />
            <p><b>공개 링크입니다.</b> 링크를 아는 사람은 누구나 들을 수 있으니 학생 개인정보가 담긴 음원은 올리지 마세요.</p>
          </div>
        </aside>
      </div>

      <section className="lm-card lm-board" aria-labelledby="listening-board-heading">
        <div className="lm-board-toolbar">
          <div>
            <h3 id="listening-board-heading" tabIndex={-1}>게시한 듣기 자료</h3>
            <p aria-live="polite">전체 {materials.length}개{query.trim() ? ` · 검색 결과 ${filteredMaterials.length}개` : ''}</p>
          </div>
          <label className="lm-search">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">듣기 자료 검색</span>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="제목·파일명 검색"
              disabled={Boolean(editingId)}
              title={editingId ? '수정을 저장하거나 취소한 뒤 검색할 수 있어요.' : undefined}
            />
          </label>
        </div>

        {isLoading ? (
          <div className="lm-empty" role="status" aria-live="polite"><Headphones size={30} /><b>듣기 자료를 불러오는 중...</b></div>
        ) : loadError ? (
          <div className="lm-empty lm-load-error" role="alert">
            <AlertTriangle size={30} />
            <b>듣기 자료를 불러오지 못했어요.</b>
            <span>{loadError}</span>
            <button className="btn btn-secondary" type="button" onClick={() => void handleRetryLoad()}>
              <RefreshCw size={16} /> 다시 불러오기
            </button>
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="lm-empty">
            <FileAudio size={32} />
            <b>{materials.length === 0 ? '아직 게시한 듣기 자료가 없어요.' : '검색 결과가 없어요.'}</b>
            <span>{materials.length === 0 ? '왼쪽에서 첫 음원을 올려 보세요.' : '다른 검색어로 찾아보세요.'}</span>
          </div>
        ) : (
          <div className="lm-list">
            {filteredMaterials.map(material => (
              <article className="lm-item" key={material.id}>
                <div className="lm-item-head">
                  <span className="lm-audio-icon"><FileAudio size={21} /></span>
                  {editingId === material.id ? (
                    <form className="lm-edit-form" onSubmit={event => void handleSaveEdit(event, material.id)}>
                      <label className="sr-only" htmlFor={`lm-edit-title-${material.id}`}>자료 제목</label>
                      <input
                        id={`lm-edit-title-${material.id}`}
                        className="form-control"
                        value={editTitle}
                        maxLength={120}
                        onChange={event => setEditTitle(event.target.value)}
                        disabled={savingId === material.id}
                        required
                        autoFocus
                      />
                      <label className="sr-only" htmlFor={`lm-edit-description-${material.id}`}>자료 설명</label>
                      <textarea
                        id={`lm-edit-description-${material.id}`}
                        className="form-control"
                        value={editDescription}
                        maxLength={1000}
                        placeholder="설명 없음"
                        onChange={event => setEditDescription(event.target.value)}
                        disabled={savingId === material.id}
                      />
                      <div className="lm-edit-footer">
                        <span>{editDescription.length}/1,000</span>
                        <button className="btn btn-primary" type="submit" disabled={!editTitle.trim() || savingId === material.id}>
                          <Save size={15} /> {savingId === material.id ? '저장 중...' : '저장'}
                        </button>
                        <button className="btn btn-secondary" type="button" onClick={() => handleCancelEdit(material.id)} disabled={Boolean(savingId)}>
                          <X size={15} /> 취소
                        </button>
                      </div>
                      <p className="lm-edit-meta">{material.originalFileName} · {formatListeningFileSize(material.fileSizeBytes)} · {formatCreatedAt(material.createdAt)}</p>
                    </form>
                  ) : (
                    <div className="lm-item-title">
                      <h4>{material.title}</h4>
                      <p>{material.originalFileName} · {formatListeningFileSize(material.fileSizeBytes)} · {formatCreatedAt(material.createdAt)}</p>
                    </div>
                  )}
                </div>
                {editingId !== material.id && material.description && <p className="lm-item-description">{material.description}</p>}
                <audio className="lm-audio" controls preload="metadata" src={material.publicUrl} aria-label={`${material.title} 듣기`}>
                  브라우저가 오디오 재생을 지원하지 않습니다.
                </audio>
                <div className="lm-link-row">
                  <span>공개 링크</span>
                  <input value={material.publicUrl} readOnly aria-label={`${material.title} 공개 링크`} onFocus={event => event.currentTarget.select()} />
                </div>
                <div className="lm-item-actions">
                  <button className={`btn ${copiedId === material.id ? 'btn-accent' : 'btn-primary'}`} type="button" onClick={() => void handleCopy(material)} aria-label={`${material.title} 듣기 링크 복사`}>
                    {copiedId === material.id ? <Check size={16} /> : <Copy size={16} />}
                    {copiedId === material.id ? '복사됨' : '클카 링크 복사'}
                  </button>
                  <a className="btn btn-secondary" href={material.publicUrl} target="_blank" rel="noreferrer" aria-label={`${material.title} 듣기 링크 새 탭에서 확인`}>
                    <ExternalLink size={16} /> 새 탭에서 확인
                  </a>
                  <button id={`lm-edit-action-${material.id}`} className="btn btn-secondary" type="button" onClick={() => handleStartEdit(material)} disabled={Boolean(deletingId || savingId || editingId)} aria-label={`${material.title} 게시글 수정`}>
                    <Pencil size={16} /> 수정
                  </button>
                  <button className="btn btn-danger lm-delete" type="button" onClick={() => void handleDelete(material)} disabled={Boolean(deletingId || savingId || editingId)} aria-label={`${material.title} 듣기 자료 삭제`}>
                    <Trash2 size={16} /> {deletingId === material.id ? '삭제 중...' : '삭제'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
