import { beforeEach, describe, expect, it, vi } from 'vitest';

const tusMocks = vi.hoisted(() => {
  type MockTusOptions = {
    endpoint: string;
    headers: Record<string, string>;
    metadata: Record<string, string>;
    chunkSize: number;
    retryDelays: number[];
    storeFingerprintForResuming: boolean;
    onProgress: (uploaded: number, total: number) => void;
    onError: (error: Error) => void;
    onSuccess: () => void;
  };
  const state: { outcome: 'success' | 'error'; options: MockTusOptions | null } = {
    outcome: 'success',
    options: null,
  };
  const start = vi.fn();
  const Upload = vi.fn(function MockUpload(
    this: { start: () => void },
    _file: unknown,
    options: MockTusOptions,
  ) {
    state.options = options;
    this.start = () => {
      start();
      if (state.outcome === 'error') {
        options.onError(new Error('tus failed'));
        return;
      }
      options.onProgress(7, 10);
      options.onSuccess();
    };
  });
  return { state, start, Upload };
});

const mocks = vi.hoisted(() => {
  const upload = vi.fn();
  const remove = vi.fn();
  const getPublicUrl = vi.fn();
  const insertSingle = vi.fn();
  const insertSelect = vi.fn(() => ({ single: insertSingle }));
  const insert = vi.fn(() => ({ select: insertSelect }));
  const updateMaybeSingle = vi.fn();
  const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }));
  const updateMatch = vi.fn(() => ({ select: updateSelect }));
  const update = vi.fn(() => ({ match: updateMatch }));
  const deleteEq = vi.fn();
  const deleteRow = vi.fn(() => ({ eq: deleteEq }));
  const storageBucket = { upload, remove, getPublicUrl };
  const table = { insert, update, delete: deleteRow };

  return {
    upload,
    remove,
    getPublicUrl,
    insert,
    insertSingle,
    update,
    updateMatch,
    updateMaybeSingle,
    deleteEq,
    deleteRow,
    supabase: {
      storage: { from: vi.fn(() => storageBucket) },
      from: vi.fn(() => table),
      auth: { getSession: vi.fn() },
    },
  };
});

vi.mock('../src/lib/supabase', () => ({ supabase: mocks.supabase }));
vi.mock('tus-js-client', () => ({ Upload: tusMocks.Upload }));

import {
  LISTENING_STANDARD_UPLOAD_MAX_BYTES,
  deleteListeningMaterial,
  publishListeningMaterial,
  updateListeningMaterial,
} from '../src/lib/listeningMaterials';
import type { ListeningMaterial } from '../src/types';

const ownerId = '11111111-1111-1111-1111-111111111111';
const makeMp3File = () => new File(
  [new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00])],
  'lesson.mp3',
  { type: 'audio/mpeg' },
);
const makeLargeMp3File = () => new File(
  [new Uint8Array([0x49, 0x44, 0x33]), new Uint8Array(LISTENING_STANDARD_UPLOAD_MAX_BYTES)],
  'large-lesson.mp3',
  { type: 'audio/mpeg' },
);

const insertedRow = {
  id: 'material-1',
  title: '3과 본문',
  description: '두 번 듣기',
  storage_path: `${ownerId}/22222222-2222-2222-2222-222222222222.mp3`,
  original_file_name: 'lesson.mp3',
  mime_type: 'audio/mpeg',
  file_size_bytes: 8,
  created_at: '2026-09-03T00:00:00.000Z',
  updated_at: '2026-09-03T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  tusMocks.state.outcome = 'success';
  tusMocks.state.options = null;
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://example.supabase.co/audio.mp3' } });
  mocks.insertSingle.mockResolvedValue({ data: insertedRow, error: null });
  mocks.updateMaybeSingle.mockResolvedValue({ data: { ...insertedRow, title: '수정한 제목' }, error: null });
  mocks.deleteEq.mockResolvedValue({ error: null });
  mocks.supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'test-access-token' } },
    error: null,
  });
});

describe('듣기 자료 게시글 수정', () => {
  it('제목과 설명만 고쳐 공개 링크를 유지한다', async () => {
    const original: ListeningMaterial = {
      id: 'material-1',
      title: insertedRow.title,
      description: insertedRow.description,
      storagePath: insertedRow.storage_path,
      originalFileName: insertedRow.original_file_name,
      mimeType: insertedRow.mime_type,
      fileSizeBytes: insertedRow.file_size_bytes,
      publicUrl: 'https://example.supabase.co/audio.mp3',
      createdAt: insertedRow.created_at,
      updatedAt: insertedRow.updated_at,
    };
    const material = await updateListeningMaterial(original, '  수정한 제목  ', '  새 설명  ');

    expect(mocks.update).toHaveBeenCalledWith({ title: '수정한 제목', description: '새 설명' });
    expect(mocks.updateMatch).toHaveBeenCalledWith({ id: 'material-1', updated_at: insertedRow.updated_at });
    expect(material.storagePath).toBe(insertedRow.storage_path);
    expect(material.publicUrl).toBe('https://example.supabase.co/audio.mp3');
  });

  it('다른 화면에서 먼저 수정된 게시글은 덮어쓰지 않는다', async () => {
    mocks.updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    const original: ListeningMaterial = {
      id: 'material-1',
      title: insertedRow.title,
      description: insertedRow.description,
      storagePath: insertedRow.storage_path,
      originalFileName: insertedRow.original_file_name,
      mimeType: insertedRow.mime_type,
      fileSizeBytes: insertedRow.file_size_bytes,
      publicUrl: 'https://example.supabase.co/audio.mp3',
      createdAt: insertedRow.created_at,
      updatedAt: insertedRow.updated_at,
    };

    await expect(updateListeningMaterial(original, '수정', '')).rejects.toThrow('다른 화면에서 이미 수정된 자료');
  });
});

describe('듣기 자료 게시 순서', () => {
  it('Storage 업로드 뒤 메타데이터를 저장한다', async () => {
    const material = await publishListeningMaterial({
      ownerId,
      title: '  3과 본문  ',
      description: '  두 번 듣기  ',
      file: makeMp3File(),
    });

    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      owner_id: ownerId,
      title: '3과 본문',
      description: '두 번 듣기',
      mime_type: 'audio/mpeg',
    }));
    expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(mocks.insert.mock.invocationCallOrder[0]);
    expect(material.publicUrl).toBe('https://example.supabase.co/audio.mp3');
  });

  it('업로드가 실패하면 메타데이터를 저장하지 않는다', async () => {
    mocks.upload.mockResolvedValue({ error: new Error('upload failed') });

    await expect(publishListeningMaterial({
      ownerId,
      title: '3과 본문',
      description: '',
      file: makeMp3File(),
    })).rejects.toThrow('upload failed');

    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('메타데이터 저장이 실패하면 이미 올린 파일을 제거한다', async () => {
    mocks.insertSingle.mockResolvedValue({ data: null, error: new Error('insert failed') });

    await expect(publishListeningMaterial({
      ownerId,
      title: '3과 본문',
      description: '',
      file: makeMp3File(),
    })).rejects.toThrow('insert failed');

    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.insert.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0]);
  });

  it('6MB 초과 파일은 인증된 TUS 업로드와 6MB 청크를 사용한다', async () => {
    const onProgress = vi.fn();

    await publishListeningMaterial({
      ownerId,
      title: '긴 듣기',
      description: '',
      file: makeLargeMp3File(),
      onProgress,
    });

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(tusMocks.Upload).toHaveBeenCalledOnce();
    expect(tusMocks.start).toHaveBeenCalledOnce();
    expect(tusMocks.state.options).toMatchObject({
      endpoint: 'https://xrrdokcjhjqdfvwtbenl.storage.supabase.co/storage/v1/upload/resumable',
      chunkSize: LISTENING_STANDARD_UPLOAD_MAX_BYTES,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      storeFingerprintForResuming: false,
      headers: { authorization: 'Bearer test-access-token' },
      metadata: {
        bucketName: 'growing-listening-audio',
        contentType: 'audio/mpeg',
        cacheControl: '3600',
      },
    });
    expect(tusMocks.state.options?.metadata.objectName).toMatch(new RegExp(`^${ownerId}/[0-9a-f-]+\\.mp3$`));
    expect(onProgress).toHaveBeenCalledWith(70);
  });

  it('TUS 실패 시 알려진 공개 경로를 정리하고 게시글을 만들지 않는다', async () => {
    tusMocks.state.outcome = 'error';

    await expect(publishListeningMaterial({
      ownerId,
      title: '긴 듣기',
      description: '',
      file: makeLargeMp3File(),
    })).rejects.toThrow('tus failed');

    const storagePath = tusMocks.state.options?.metadata.objectName;
    expect(storagePath).toBeTruthy();
    expect(mocks.remove).toHaveBeenCalledWith([storagePath]);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('TUS 실패 파일까지 정리하지 못하면 부분 실패를 분명히 알린다', async () => {
    tusMocks.state.outcome = 'error';
    mocks.remove.mockResolvedValue({ error: new Error('cleanup failed') });

    await expect(publishListeningMaterial({
      ownerId,
      title: '긴 듣기',
      description: '',
      file: makeLargeMp3File(),
    })).rejects.toThrow('업로드 실패 후 파일 정리도 실패했습니다: tus failed / cleanup failed');

    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe('듣기 자료 삭제 순서', () => {
  it('공개 파일을 제거한 뒤 게시글을 삭제한다', async () => {
    const material: ListeningMaterial = {
      id: 'material-1',
      title: '3과 본문',
      description: '',
      storagePath: insertedRow.storage_path,
      originalFileName: 'lesson.mp3',
      mimeType: 'audio/mpeg',
      fileSizeBytes: 8,
      publicUrl: 'https://example.supabase.co/audio.mp3',
      createdAt: insertedRow.created_at,
      updatedAt: insertedRow.updated_at,
    };

    await deleteListeningMaterial(material);

    expect(mocks.remove).toHaveBeenCalledWith([material.storagePath]);
    expect(mocks.deleteEq).toHaveBeenCalledWith('id', material.id);
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteRow.mock.invocationCallOrder[0]);
  });

  it('파일 삭제가 실패하면 게시글을 남겨 재시도할 수 있게 한다', async () => {
    mocks.remove.mockResolvedValue({ error: new Error('remove failed') });
    const material: ListeningMaterial = {
      id: 'material-1',
      title: '3과 본문',
      description: '',
      storagePath: insertedRow.storage_path,
      originalFileName: 'lesson.mp3',
      mimeType: 'audio/mpeg',
      fileSizeBytes: 8,
      publicUrl: 'https://example.supabase.co/audio.mp3',
      createdAt: insertedRow.created_at,
      updatedAt: insertedRow.updated_at,
    };

    await expect(deleteListeningMaterial(material)).rejects.toThrow('remove failed');
    expect(mocks.deleteRow).not.toHaveBeenCalled();
  });

  it('파일 삭제 뒤 게시글 정리가 실패하면 부분 실패를 분명히 알린다', async () => {
    mocks.deleteEq.mockResolvedValue({ error: new Error('row delete failed') });
    const material: ListeningMaterial = {
      id: 'material-1',
      title: '3과 본문',
      description: '',
      storagePath: insertedRow.storage_path,
      originalFileName: 'lesson.mp3',
      mimeType: 'audio/mpeg',
      fileSizeBytes: 8,
      publicUrl: 'https://example.supabase.co/audio.mp3',
      createdAt: insertedRow.created_at,
      updatedAt: insertedRow.updated_at,
    };

    await expect(deleteListeningMaterial(material)).rejects.toThrow('음원은 삭제됐지만 게시글 정리가 필요합니다');
    expect(mocks.remove).toHaveBeenCalledWith([material.storagePath]);
    expect(mocks.deleteEq).toHaveBeenCalledWith('id', material.id);
  });
});
