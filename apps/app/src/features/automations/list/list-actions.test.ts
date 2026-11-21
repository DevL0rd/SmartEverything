import { beforeEach, describe, expect, it, vi } from 'vitest';
import { removeAutomation } from './list-actions';

const accepted = vi.hoisted(() => ({ value: true }));
const notified = vi.hoisted((): unknown[] => []);

vi.mock('../../../components/confirm-store', () => ({
  confirm: (): Promise<boolean> => Promise.resolve(accepted.value),
}));

vi.mock('../../../components/toast-store', () => ({
  notify: (toast: unknown): void => {
    notified.push(toast);
  },
}));

vi.mock('../data/use-automation', () => ({ useAutomationActions: vi.fn() }));
vi.mock('../data/automation-rows', () => ({ listOf: vi.fn() }));
vi.mock('../data/source', () => ({ useAutomationsSource: vi.fn() }));
vi.mock('../data/use-runs', () => ({ useRunActions: vi.fn() }));

describe('removeAutomation', () => {
  beforeEach(() => {
    accepted.value = true;
    notified.length = 0;
  });

  it('leaves the page at once and then removes the automation', async () => {
    const order: string[] = [];
    const remove = vi.fn((id: string) => {
      order.push(`remove ${id}`);
      return Promise.resolve();
    });
    await removeAutomation(remove, 'a1', 'Porch', () => {
      order.push('removed');
    });
    expect(order).toEqual(['removed', 'remove a1']);
  });

  it('does nothing when the confirmation is declined', async () => {
    accepted.value = false;
    const remove = vi.fn(() => Promise.resolve());
    const onRemoved = vi.fn();
    await removeAutomation(remove, 'a1', 'Porch', onRemoved);
    expect(remove).not.toHaveBeenCalled();
    expect(onRemoved).not.toHaveBeenCalled();
  });

  it('tells the user when the delete is refused', async () => {
    const remove = vi.fn(() => Promise.reject(new Error('conflict')));
    const onRemoved = vi.fn();
    await removeAutomation(remove, 'a1', 'Porch', onRemoved);
    expect(onRemoved).toHaveBeenCalledTimes(1);
    expect(notified).toHaveLength(1);
  });

  it('works without a callback for the list row', async () => {
    const remove = vi.fn(() => Promise.resolve());
    await removeAutomation(remove, 'a1', 'Porch', undefined);
    expect(remove).toHaveBeenCalledWith('a1');
  });
});
