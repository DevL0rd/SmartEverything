import { beforeEach, describe, expect, it, vi } from 'vitest';

const updatePlugin = vi.fn();
const notify = vi.fn();
vi.mock('../../../api/plugin-admin', () => ({
  updatePlugin,
  removePlugin: vi.fn(),
  restartPlugin: vi.fn(),
}));
vi.mock('../../../components/toast-store', () => ({
  notify,
  notifyFailure:
    (message: string) =>
    (error: unknown): void => {
      notify({ message, error, tone: 'critical' });
    },
}));

const { changePlugin, savePlugin } = await import('./plugin-actions');

const row = { id: 'demo' };

beforeEach(() => {
  updatePlugin.mockReset();
  notify.mockReset();
});

describe('savePlugin', () => {
  it('rejects when the save fails so a sheet keeps what was typed', async () => {
    updatePlugin.mockRejectedValue(new Error('refused'));
    await expect(savePlugin(row, { settings: { key: 'x' } })).rejects.toThrow('refused');
    expect(notify).not.toHaveBeenCalled();
  });

  it('resolves when the save works', async () => {
    updatePlugin.mockResolvedValue({ outcome: 'saved' });
    await expect(savePlugin(row, { enabled: true })).resolves.toBeUndefined();
  });
});

describe('changePlugin', () => {
  it('names the failed change in a toast and does not reject', async () => {
    updatePlugin.mockRejectedValue(new Error('refused'));
    await expect(changePlugin(row, { enabled: true }, 'Key wasn’t saved')).resolves.toBeUndefined();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'Key wasn’t saved' }));
  });
});
