import { describe, expect, it } from 'vitest';
import {
  MAX_KAKAO_REQUEST_BYTES,
  extractKakaoLinkCode,
  getKakaoAppUserId,
  normalizeConnectCredentials,
  readKakaoSkillPayload,
  safeEventStatus,
  sha256Hex,
  validateKakaoSkillPayload,
} from '../supabase/functions/kakao-skill/security.ts';

describe('Kakao skill request security', () => {
  it('accepts a small well-formed payload', async () => {
    const request = new Request('https://example.test/kakao-skill', {
      method: 'POST',
      body: JSON.stringify({
        userRequest: { utterance: '내일 수업하나요?', user: { id: 'user-1' } },
        action: { params: { action: 'schedule_info' } },
      }),
    });
    await expect(readKakaoSkillPayload(request)).resolves.toMatchObject({
      userRequest: { utterance: '내일 수업하나요?' },
    });
  });

  it('rejects oversized and malformed payloads', async () => {
    const oversized = new Request('https://example.test/kakao-skill', {
      method: 'POST',
      body: 'x'.repeat(MAX_KAKAO_REQUEST_BYTES + 1),
    });
    await expect(readKakaoSkillPayload(oversized)).rejects.toThrow('too large');
    expect(() => validateKakaoSkillPayload({
      userRequest: { utterance: 'x'.repeat(501), user: { id: 'user-1' } },
    })).toThrow('utterance');
    expect(() => validateKakaoSkillPayload({
      action: { params: { action: { nested: true } } },
    })).toThrow('action.params');
    expect(() => validateKakaoSkillPayload({ intent: { name: {} } })).toThrow('intent');
    expect(() => validateKakaoSkillPayload({
      userRequest: { user: { id: 'user-1', properties: { appUserId: {} } } },
    })).toThrow('properties');
  });

  it('requires an exact full mobile number for student linking', () => {
    expect(normalizeConnectCredentials(' 김서윤 ', '010-1234-5678')).toEqual({
      studentName: '김서윤',
      phone: '01012345678',
    });
    expect(normalizeConnectCredentials('김서윤', '5678')).toBeNull();
    expect(normalizeConnectCredentials('%', '01012345678')).toBeNull();
    expect(normalizeConnectCredentials('김', '01012345678')).toBeNull();
  });

  it('accepts only an exact eight-character academy link code', () => {
    expect(extractKakaoLinkCode('연결 a1b2c3d4')).toBe('A1B2C3D4');
    expect(extractKakaoLinkCode('A1B2C3D4')).toBe('A1B2C3D4');
    expect(extractKakaoLinkCode('A1B2C3')).toBe('');
    expect(extractKakaoLinkCode('입학 문의 A1B2C3D4')).toBe('');
  });

  it('reads the official app user id variants and sanitizes log status', () => {
    expect(getKakaoAppUserId({
      userRequest: { user: { properties: { appUserId: 'app-user-1' } } },
    })).toBe('app-user-1');
    expect(getKakaoAppUserId({
      userRequest: { user: { properties: { app_user_id: 'app-user-2' } } },
    })).toBe('app-user-2');
    expect(safeEventStatus(`error:\n${'x'.repeat(200)}`)).toHaveLength(120);
  });

  it('hashes credentials before database lookup', async () => {
    await expect(sha256Hex('0123456789abcdef0123456789abcdef')).resolves.toMatch(/^[0-9a-f]{64}$/);
  });
});
