import { describe, expect, it } from 'vitest';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { attachedFilesOf } from './attachments-model';

type Row = Pick<AssistantMessageRow, 'created_at' | 'attachments'>;

const file = (id: string): Row['attachments'][number] => ({
  id,
  name: `${id}.png`,
  mime: 'image/png',
  bytes: 1,
  width: null,
  height: null,
});
const row = (created_at: string, ids: readonly string[]): Row => ({
  created_at,
  attachments: ids.map(file),
});

describe('attachedFilesOf', () => {
  it('lists every attachment newest message first', () => {
    const files = attachedFilesOf([
      row('2026-10-01T10:00:00Z', ['old']),
      row('2026-10-03T10:00:00Z', ['new-a', 'new-b']),
      row('2026-10-02T10:00:00Z', []),
    ]);
    expect(files.map((item) => item.attachment.id)).toEqual(['new-a', 'new-b', 'old']);
  });

  it('lists an attachment once even when two messages carry it', () => {
    const files = attachedFilesOf([
      row('2026-10-01T10:00:00Z', ['same']),
      row('2026-10-02T10:00:00Z', ['same']),
    ]);
    expect(files).toHaveLength(1);
    expect(files[0]?.at).toBe('2026-10-02T10:00:00Z');
  });
});
