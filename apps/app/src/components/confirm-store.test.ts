import { describe, expect, it } from 'vitest';
import { confirm, pendingConfirm, settleConfirm } from './confirm-store';

describe('confirm', () => {
  it('gives two confirms with the same title different ids so the dialog remounts', async () => {
    const first = confirm({ title: 'Delete Movie night?', confirmLabel: 'Delete' });
    const firstId = pendingConfirm.get()?.id;
    settleConfirm(false);
    await first;
    const second = confirm({ title: 'Delete Movie night?', confirmLabel: 'Delete' });
    const secondId = pendingConfirm.get()?.id;
    settleConfirm(true);
    await second;
    expect(firstId).toBeDefined();
    expect(secondId).toBeDefined();
    expect(secondId).not.toBe(firstId);
  });

  it('declines the open confirm when another one replaces it', async () => {
    const first = confirm({ title: 'A', confirmLabel: 'Yes' });
    const second = confirm({ title: 'B', confirmLabel: 'Yes' });
    await expect(first).resolves.toBe(false);
    settleConfirm(true);
    await expect(second).resolves.toBe(true);
    expect(pendingConfirm.get()).toBeNull();
  });
});
