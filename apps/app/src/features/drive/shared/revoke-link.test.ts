import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfirmRequest } from '../../../components/confirm-store';

interface Seen {
  asked: ConfirmRequest[];
  answer: boolean;
  revoked: string[];
}

const seen = vi.hoisted((): Seen => ({ asked: [], answer: true, revoked: [] }));

vi.mock('../../../components/confirm-store', () => ({
  confirm: (request: ConfirmRequest): Promise<boolean> => {
    seen.asked.push(request);
    return Promise.resolve(seen.answer);
  },
}));
vi.mock('../../../api/drive', () => ({
  revokeDriveShare: (shareId: string): Promise<{ readonly ok: true }> => {
    seen.revoked.push(shareId);
    return Promise.resolve({ ok: true });
  },
}));

const { SHARES_PREFIX, revokeLink } = await import('./revoke-link');

const SHARE_ID = '00000000-0000-4000-8000-000000000101';

describe('revokeLink', () => {
  beforeEach(() => {
    seen.asked = [];
    seen.revoked = [];
    seen.answer = true;
  });

  it('asks with the design copy, revokes and refreshes every share list', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await expect(revokeLink(client, SHARE_ID, 'Kitchen plan v3.pdf')).resolves.toBe(true);
    expect(seen.asked).toEqual([
      {
        title: 'Revoke Kitchen plan v3.pdf?',
        body: 'People with the link can’t open it any more.',
        confirmLabel: 'Revoke link',
        cancelLabel: 'Keep link',
        tone: 'destructive',
      },
    ]);
    expect(seen.revoked).toEqual([SHARE_ID]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: SHARES_PREFIX });
    expect(SHARES_PREFIX).toEqual(['window', 'drive', 'shares']);
  });

  it('keeps the link when the person chooses Keep link', async () => {
    seen.answer = false;
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await expect(revokeLink(client, SHARE_ID, 'Lisbon 2026')).resolves.toBe(false);
    expect(seen.revoked).toEqual([]);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
