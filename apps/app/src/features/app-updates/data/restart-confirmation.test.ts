import { afterEach, expect, it } from 'vitest';
import { ROLLBACK_CONFIRM } from '../model/update-copy';
import { askToRestart, pendingRestart, settleRestart } from './restart-confirmation';

afterEach(() => {
  settleRestart(pendingRestart.get(), false);
});

it.each(['ui', 'desktop'] as const)(
  'preserves the first %s approval until it is answered',
  async (source) => {
    const first = askToRestart(ROLLBACK_CONFIRM, source);
    const pending = pendingRestart.get();
    const other = source === 'desktop' ? 'ui' : 'desktop';
    await expect(askToRestart(ROLLBACK_CONFIRM, other)).resolves.toBe(false);
    expect(pendingRestart.get()).toBe(pending);
    settleRestart(pending, true);
    await expect(first).resolves.toBe(true);
  },
);
