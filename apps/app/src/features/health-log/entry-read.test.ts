import { ApiError } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ readEntry: vi.fn() }));

vi.mock('../../api/nutrition', () => api);

const { findEntry } = await import('./entry-read');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('findEntry', () => {
  it('reads the entry by its id alone', async () => {
    api.readEntry.mockResolvedValue({ id: 'entry-1' });
    await expect(findEntry('entry-1')).resolves.toEqual({ id: 'entry-1' });
    expect(api.readEntry).toHaveBeenCalledExactlyOnceWith('entry-1');
  });

  it('answers null for an entry that was removed', async () => {
    api.readEntry.mockRejectedValue(new ApiError('not_found', 'gone'));
    await expect(findEntry('entry-1')).resolves.toBeNull();
  });

  it('lets any other failure through', async () => {
    api.readEntry.mockRejectedValue(new ApiError('internal', 'broken'));
    await expect(findEntry('entry-1')).rejects.toThrow('broken');
  });
});
