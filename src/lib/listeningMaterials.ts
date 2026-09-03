import type { ListeningMaterial } from '../types';
import { supabase } from './supabase';

export const LISTENING_AUDIO_BUCKET = 'growing-listening-audio';
export const LISTENING_AUDIO_MAX_BYTES = 50 * 1024 * 1024;
export const LISTENING_STANDARD_UPLOAD_MAX_BYTES = 6 * 1024 * 1024;

const EXTENSION_CONTENT_TYPES = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  aac: 'audio/aac',
} as const;

type ListeningAudioExtension = keyof typeof EXTENSION_CONTENT_TYPES;

const DECLARED_CONTENT_TYPES: Record<ListeningAudioExtension, string[]> = {
  mp3: ['audio/mpeg', 'audio/mp3'],
  m4a: ['audio/mp4', 'audio/x-m4a', 'audio/m4a'],
  wav: ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'],
  ogg: ['audio/ogg', 'application/ogg'],
  webm: ['audio/webm'],
  aac: ['audio/aac', 'audio/x-aac'],
};

export interface ListeningFileDescriptor {
  name: string;
  type: string;
  size: number;
}

export type ListeningFileValidation =
  | { ok: true; extension: ListeningAudioExtension; contentType: string }
  | { ok: false; message: string };

type ListeningMaterialRow = {
  id: string;
  title: string;
  description: string;
  storage_path: string;
  original_file_name: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
  updated_at: string;
};

const getExtension = (fileName: string): ListeningAudioExtension | null => {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return extension in EXTENSION_CONTENT_TYPES ? extension as ListeningAudioExtension : null;
};

export const validateListeningFileDescriptor = (
  file: ListeningFileDescriptor,
): ListeningFileValidation => {
  const extension = getExtension(file.name);
  if (!extension) {
    return { ok: false, message: 'MP3, M4A, WAV, OGG, WebM, AAC 파일만 올릴 수 있어요.' };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, message: '내용이 없는 파일은 올릴 수 없어요.' };
  }
  if (file.size > LISTENING_AUDIO_MAX_BYTES) {
    return { ok: false, message: '파일 크기는 50MB 이하여야 해요.' };
  }

  const declaredType = file.type.trim().toLowerCase();
  if (declaredType && !DECLARED_CONTENT_TYPES[extension].includes(declaredType)) {
    return { ok: false, message: '파일 확장자와 오디오 형식이 서로 맞지 않아요.' };
  }

  return {
    ok: true,
    extension,
    contentType: EXTENSION_CONTENT_TYPES[extension],
  };
};

const startsWithBytes = (bytes: Uint8Array, expected: number[]) =>
  expected.every((value, index) => bytes[index] === value);

const startsWithText = (bytes: Uint8Array, text: string, offset = 0) =>
  [...text].every((value, index) => bytes[offset + index] === value.charCodeAt(0));

export const hasListeningAudioSignature = (
  extension: ListeningAudioExtension,
  bytes: Uint8Array,
) => {
  if (extension === 'mp3') {
    return startsWithText(bytes, 'ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  }
  if (extension === 'm4a') return startsWithText(bytes, 'ftyp', 4);
  if (extension === 'wav') return startsWithText(bytes, 'RIFF') && startsWithText(bytes, 'WAVE', 8);
  if (extension === 'ogg') return startsWithText(bytes, 'OggS');
  if (extension === 'webm') return startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  return startsWithText(bytes, 'ADIF') || (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0);
};

export const validateListeningAudioFile = async (file: File): Promise<ListeningFileValidation> => {
  const descriptor = validateListeningFileDescriptor(file);
  if (!descriptor.ok) return descriptor;

  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!hasListeningAudioSignature(descriptor.extension, bytes)) {
    return { ok: false, message: '파일 내용이 선택한 오디오 형식과 맞지 않아요.' };
  }
  if (!(await canBrowserPlayAudioFile(file))) {
    return { ok: false, message: '재생할 수 있는 오디오 파일인지 확인해 주세요.' };
  }
  return descriptor;
};

const canBrowserPlayAudioFile = async (file: File) => {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return true;

  return new Promise<boolean>(resolve => {
    const audio = document.createElement('audio');
    const objectUrl = URL.createObjectURL(file);
    let settled = false;
    const finish = (playable: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(objectUrl);
      resolve(playable);
    };
    const timeoutId = window.setTimeout(() => finish(false), 8000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) && audio.duration > 0);
    audio.onerror = () => finish(false);
    audio.src = objectUrl;
  });
};

export const buildListeningStoragePath = (
  ownerId: string,
  fileName: string,
  objectId = crypto.randomUUID(),
) => {
  const extension = getExtension(fileName);
  if (!extension) throw new Error('지원하지 않는 듣기 파일 확장자입니다.');
  return `${ownerId}/${objectId}.${extension}`;
};

export const formatListeningFileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

export const getListeningUploadStrategy = (bytes: number) =>
  bytes > LISTENING_STANDARD_UPLOAD_MAX_BYTES ? 'resumable' : 'standard';

const getPublicUrl = (storagePath: string) =>
  supabase.storage.from(LISTENING_AUDIO_BUCKET).getPublicUrl(storagePath).data.publicUrl;

const toListeningMaterial = (row: ListeningMaterialRow): ListeningMaterial => ({
  id: row.id,
  title: row.title,
  description: row.description,
  storagePath: row.storage_path,
  originalFileName: row.original_file_name,
  mimeType: row.mime_type,
  fileSizeBytes: Number(row.file_size_bytes),
  publicUrl: getPublicUrl(row.storage_path),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const buildListeningResumableEndpoint = (supabaseUrl: string) => {
  const apiUrl = new URL(supabaseUrl);
  const storageHostname = apiUrl.hostname.endsWith('.supabase.co')
    ? apiUrl.hostname.replace('.supabase.co', '.storage.supabase.co')
    : apiUrl.host;
  return `${apiUrl.protocol}//${storageHostname}/storage/v1/upload/resumable`;
};

const resumableEndpoint = () =>
  buildListeningResumableEndpoint(import.meta.env.VITE_SUPABASE_URL as string);

const uploadResumable = async (
  file: File,
  storagePath: string,
  contentType: string,
  onProgress?: (percentage: number) => void,
) => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error('로그인 세션을 다시 확인해 주세요.');

  const { Upload } = await import('tus-js-client');

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: resumableEndpoint(),
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${data.session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      uploadDataDuringCreation: true,
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      chunkSize: LISTENING_STANDARD_UPLOAD_MAX_BYTES,
      metadata: {
        bucketName: LISTENING_AUDIO_BUCKET,
        objectName: storagePath,
        contentType,
        cacheControl: '3600',
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        onProgress?.(bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0);
      },
      onError: reject,
      onSuccess: () => resolve(),
    });

    upload.start();
  });
};

const uploadAudioObject = async (
  file: File,
  storagePath: string,
  contentType: string,
  onProgress?: (percentage: number) => void,
) => {
  if (getListeningUploadStrategy(file.size) === 'resumable') {
    await uploadResumable(file, storagePath, contentType, onProgress);
    return;
  }

  onProgress?.(5);
  const { error } = await supabase.storage
    .from(LISTENING_AUDIO_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      contentType,
      upsert: false,
    });
  if (error) throw error;
  onProgress?.(100);
};

export const listListeningMaterials = async (ownerId: string): Promise<ListeningMaterial[]> => {
  const { data, error } = await supabase
    .from('growing_listening_materials')
    .select('id, title, description, storage_path, original_file_name, mime_type, file_size_bytes, created_at, updated_at')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ListeningMaterialRow[]).map(toListeningMaterial);
};

export const publishListeningMaterial = async ({
  ownerId,
  title,
  description,
  file,
  onProgress,
}: {
  ownerId: string;
  title: string;
  description: string;
  file: File;
  onProgress?: (percentage: number) => void;
}): Promise<ListeningMaterial> => {
  const cleanTitle = title.trim();
  const cleanDescription = description.trim();
  if (!cleanTitle) throw new Error('자료 제목을 입력해 주세요.');
  if (cleanTitle.length > 120) throw new Error('자료 제목은 120자 이하여야 해요.');
  if (cleanDescription.length > 1000) throw new Error('설명은 1,000자 이하여야 해요.');

  const validation = await validateListeningAudioFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const storagePath = buildListeningStoragePath(ownerId, file.name);
  const uploadStrategy = getListeningUploadStrategy(file.size);
  try {
    await uploadAudioObject(file, storagePath, validation.contentType, onProgress);
  } catch (uploadError) {
    if (uploadStrategy === 'resumable') {
      // A final TUS response can be lost after the object was committed. Remove
      // the known path when possible so that a failed post is not left public.
      let cleanupFailure: unknown;
      try {
        const { error } = await supabase.storage.from(LISTENING_AUDIO_BUCKET).remove([storagePath]);
        cleanupFailure = error;
      } catch (error) {
        cleanupFailure = error;
      }
      if (cleanupFailure) {
        const uploadMessage = uploadError instanceof Error ? uploadError.message : '알 수 없는 업로드 오류';
        const cleanupMessage = cleanupFailure instanceof Error ? cleanupFailure.message : String(cleanupFailure);
        throw new Error(
          `업로드 실패 후 파일 정리도 실패했습니다: ${uploadMessage} / ${cleanupMessage}`,
          { cause: uploadError },
        );
      }
    }
    throw uploadError;
  }

  const { data, error } = await supabase
    .from('growing_listening_materials')
    .insert({
      owner_id: ownerId,
      title: cleanTitle,
      description: cleanDescription,
      storage_path: storagePath,
      original_file_name: file.name,
      mime_type: validation.contentType,
      file_size_bytes: file.size,
    })
    .select('id, title, description, storage_path, original_file_name, mime_type, file_size_bytes, created_at, updated_at')
    .single();

  if (error || !data) {
    const { error: cleanupError } = await supabase.storage
      .from(LISTENING_AUDIO_BUCKET)
      .remove([storagePath]);
    if (cleanupError) {
      throw new Error(`게시글 저장과 업로드 파일 정리에 모두 실패했습니다: ${error?.message ?? '알 수 없는 오류'}`);
    }
    throw error ?? new Error('게시글을 저장하지 못했습니다.');
  }

  return toListeningMaterial(data as ListeningMaterialRow);
};

export const updateListeningMaterial = async (
  material: ListeningMaterial,
  title: string,
  description: string,
): Promise<ListeningMaterial> => {
  const cleanTitle = title.trim();
  const cleanDescription = description.trim();
  if (!cleanTitle) throw new Error('자료 제목을 입력해 주세요.');
  if (cleanTitle.length > 120) throw new Error('자료 제목은 120자 이하여야 해요.');
  if (cleanDescription.length > 1000) throw new Error('설명은 1,000자 이하여야 해요.');

  const { data, error } = await supabase
    .from('growing_listening_materials')
    .update({ title: cleanTitle, description: cleanDescription })
    .match({ id: material.id, updated_at: material.updatedAt })
    .select('id, title, description, storage_path, original_file_name, mime_type, file_size_bytes, created_at, updated_at')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('다른 화면에서 이미 수정된 자료입니다. 페이지를 새로고침한 뒤 확인해 주세요.');
  return toListeningMaterial(data as ListeningMaterialRow);
};

export const deleteListeningMaterial = async (material: ListeningMaterial) => {
  const { error: storageError } = await supabase.storage
    .from(LISTENING_AUDIO_BUCKET)
    .remove([material.storagePath]);
  if (storageError) throw storageError;

  const { error: rowError } = await supabase
    .from('growing_listening_materials')
    .delete()
    .eq('id', material.id);
  if (rowError) {
    throw new Error(`음원은 삭제됐지만 게시글 정리가 필요합니다: ${rowError.message}`);
  }
};
