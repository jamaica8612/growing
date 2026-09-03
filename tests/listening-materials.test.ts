import { describe, expect, it } from 'vitest';
import {
  LISTENING_AUDIO_MAX_BYTES,
  LISTENING_STANDARD_UPLOAD_MAX_BYTES,
  buildListeningResumableEndpoint,
  buildListeningStoragePath,
  formatListeningFileSize,
  getListeningUploadStrategy,
  hasListeningAudioSignature,
  validateListeningFileDescriptor,
} from '../src/lib/listeningMaterials';

describe('듣기 자료 파일 검증', () => {
  it('지원 형식과 빈 MIME을 표준 content type으로 정규화한다', () => {
    expect(validateListeningFileDescriptor({ name: 'Lesson.MP3', type: 'audio/mpeg', size: 1024 }))
      .toEqual({ ok: true, extension: 'mp3', contentType: 'audio/mpeg' });
    expect(validateListeningFileDescriptor({ name: 'lesson.m4a', type: '', size: 1024 }))
      .toEqual({ ok: true, extension: 'm4a', contentType: 'audio/mp4' });
  });

  it('확장자와 MIME이 다르거나 지원하지 않는 파일을 거부한다', () => {
    expect(validateListeningFileDescriptor({ name: 'lesson.mp3', type: 'video/mp4', size: 1024 }).ok).toBe(false);
    expect(validateListeningFileDescriptor({ name: 'lesson.exe', type: 'audio/mpeg', size: 1024 }).ok).toBe(false);
  });

  it('0바이트와 50MB 초과 파일을 거부하고 경계값은 허용한다', () => {
    expect(validateListeningFileDescriptor({ name: 'lesson.mp3', type: 'audio/mpeg', size: 0 }).ok).toBe(false);
    expect(validateListeningFileDescriptor({ name: 'lesson.mp3', type: 'audio/mpeg', size: LISTENING_AUDIO_MAX_BYTES }).ok).toBe(true);
    expect(validateListeningFileDescriptor({ name: 'lesson.mp3', type: 'audio/mpeg', size: LISTENING_AUDIO_MAX_BYTES + 1 }).ok).toBe(false);
  });

  it('대표 오디오 시그니처를 확장자별로 확인한다', () => {
    expect(hasListeningAudioSignature('mp3', new Uint8Array([0x49, 0x44, 0x33]))).toBe(true);
    expect(hasListeningAudioSignature('m4a', new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]))).toBe(true);
    expect(hasListeningAudioSignature('wav', new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBe(true);
    expect(hasListeningAudioSignature('ogg', new Uint8Array([0x4f, 0x67, 0x67, 0x53]))).toBe(true);
    expect(hasListeningAudioSignature('webm', new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]))).toBe(true);
    expect(hasListeningAudioSignature('aac', new Uint8Array([0xff, 0xf1]))).toBe(true);
    expect(hasListeningAudioSignature('mp3', new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]))).toBe(false);
  });
});

describe('듣기 자료 공개 경로와 표시', () => {
  it('원본 파일명을 공개 경로에 넣지 않는다', () => {
    const path = buildListeningStoragePath(
      '11111111-1111-1111-1111-111111111111',
      '../학생 이름 Lesson.MP3',
      '22222222-2222-2222-2222-222222222222',
    );
    expect(path).toBe('11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.mp3');
    expect(path).not.toContain('학생');
    expect(path).not.toContain('..');
  });

  it('6MB를 넘을 때만 재개 가능한 업로드를 선택한다', () => {
    expect(getListeningUploadStrategy(LISTENING_STANDARD_UPLOAD_MAX_BYTES)).toBe('standard');
    expect(getListeningUploadStrategy(LISTENING_STANDARD_UPLOAD_MAX_BYTES + 1)).toBe('resumable');
  });

  it('호스팅 프로젝트는 direct storage host를, 로컬은 포트를 유지한다', () => {
    expect(buildListeningResumableEndpoint('https://project.supabase.co'))
      .toBe('https://project.storage.supabase.co/storage/v1/upload/resumable');
    expect(buildListeningResumableEndpoint('http://127.0.0.1:54321'))
      .toBe('http://127.0.0.1:54321/storage/v1/upload/resumable');
  });

  it('파일 크기를 읽기 쉽게 표시한다', () => {
    expect(formatListeningFileSize(1024)).toBe('1KB');
    expect(formatListeningFileSize(1572864)).toBe('1.5MB');
  });
});
