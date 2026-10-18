import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ deleteProfile: vi.fn() }));
const toast = vi.hoisted(() => ({ notify: vi.fn() }));

vi.mock('../../api/people', () => api);
vi.mock('../../components/toast-store', () => toast);

const { profileRemovalOptions } = await import('./profile-removal');

const PROFILE = { id: 'profile-1', name: 'Sam' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('removing a person', () => {
  it('leaves the page once they are gone', async () => {
    api.deleteProfile.mockResolvedValue(undefined);
    const removed = vi.fn();
    const observer = new MutationObserver(
      new QueryClient(),
      profileRemovalOptions(PROFILE, removed),
    );
    await observer.mutate();
    expect(api.deleteProfile).toHaveBeenCalledWith('profile-1');
    expect(removed).toHaveBeenCalledTimes(1);
    expect(toast.notify).not.toHaveBeenCalled();
  });

  it('tells the person when the removal failed and stays on the page', async () => {
    const failure = new Error('offline');
    api.deleteProfile.mockRejectedValue(failure);
    const removed = vi.fn();
    const observer = new MutationObserver(
      new QueryClient(),
      profileRemovalOptions(PROFILE, removed),
    );
    await expect(observer.mutate()).rejects.toThrow('offline');
    expect(removed).not.toHaveBeenCalled();
    expect(toast.notify).toHaveBeenCalledWith({
      message: 'Sam was not removed',
      error: failure,
      tone: 'critical',
    });
  });
});
