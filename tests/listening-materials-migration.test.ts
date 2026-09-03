import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260903113654_add_growing_listening_materials.sql'),
  'utf8',
);
const indexHtml = readFileSync(resolve('index.html'), 'utf8');

describe('듣기 자료 migration 보안 계약', () => {
  it('메타데이터 테이블에 owner RLS와 명시적 권한을 적용한다', () => {
    expect(migration).toContain('alter table public.growing_listening_materials enable row level security');
    expect(migration).toContain('revoke all on table public.growing_listening_materials from public, anon, authenticated');
    expect(migration).toContain('grant select, delete on table public.growing_listening_materials to authenticated');
    expect(migration).toContain('grant insert (owner_id, title, description, storage_path, original_file_name, mime_type, file_size_bytes)');
    expect(migration).toContain('grant update (title, description)');
    expect(migration).toContain('create policy growing_listening_materials_owner_update');
    expect(migration).toContain('create trigger growing_listening_materials_set_updated_at');
    expect(migration).toContain('set search_path =');
    expect(migration).toContain('revoke all on function public.set_growing_listening_material_updated_at()');
    expect(migration.match(/\(select auth\.uid\(\)\) = owner_id/g)?.length).toBe(5);
  });

  it('전용 public 버킷에 오디오 형식과 50MB 제한을 둔다', () => {
    expect(migration).toContain("'growing-listening-audio'");
    expect(migration).toMatch(/'growing-listening-audio',\s*'growing-listening-audio',\s*true,/);
    expect(migration).toContain('52428800');
    for (const mime of ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac']) {
      expect(migration).toContain(`'${mime}'`);
    }
  });

  it('Storage 쓰기와 삭제를 로그인 사용자의 첫 폴더로 제한한다', () => {
    expect(migration).toContain('create policy growing_listening_audio_owner_insert');
    expect(migration).toContain('create policy growing_listening_audio_owner_delete');
    expect(migration).toContain("lower(storage.extension(name)) in ('mp3', 'm4a', 'wav', 'ogg', 'webm', 'aac')");
    expect(migration.match(/\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/g)?.length).toBe(3);
  });

  it('앱 CSP가 Supabase 오디오와 로컬 미리듣기 blob을 허용한다', () => {
    expect(indexHtml).toContain("media-src 'self' blob: https://*.supabase.co");
  });
});
