import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const messageLogMigration = readFileSync(
  new URL('../supabase/migrations/20260602000000_alimtalk_message_logs.sql', import.meta.url),
  'utf8',
).toLowerCase();

describe('message log migration security', () => {
  it('removes the legacy cross-tenant policy', () => {
    expect(messageLogMigration).toContain('drop policy if exists select_own_logs');
    expect(messageLogMigration).not.toContain("auth.role() = 'authenticated'");
  });

  it('reasserts owner-scoped read and write policies', () => {
    expect(messageLogMigration).toContain('for select using (auth.uid() = owner_id)');
    expect(messageLogMigration).toContain('for insert with check (auth.uid() = owner_id)');
    expect(messageLogMigration).toContain('for update');
    expect(messageLogMigration).toContain('with check (auth.uid() = owner_id)');
  });
});
