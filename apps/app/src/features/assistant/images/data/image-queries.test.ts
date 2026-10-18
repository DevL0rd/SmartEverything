import { describe, expect, it, vi } from 'vitest';
import { CancelledError, QueryClient } from '@tanstack/react-query';

const call = vi.fn();
vi.mock('../../../../api/transport', () => ({ api: (): { call: typeof call } => ({ call }) }));

const { readImageOperations } = await import('./image-queries');
const { clearImageSession } = await import('./image-session');

describe('reading image operations', () => {
  it('cancels instead of caching an empty list when the session changed during the read', async () => {
    call.mockImplementation(() => {
      clearImageSession();
      return Promise.resolve([]);
    });
    const client = new QueryClient();
    await expect(readImageOperations(client, 'chat-1')).rejects.toBeInstanceOf(CancelledError);
  });

  it('returns the receipts of the current session', async () => {
    call.mockResolvedValue([]);
    const client = new QueryClient();
    await expect(readImageOperations(client, 'chat-1')).resolves.toEqual([]);
  });
});
