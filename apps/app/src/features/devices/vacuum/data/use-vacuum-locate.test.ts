import { describe, expect, it, vi } from 'vitest';
import { deviceFixture } from '../../../../store/device-fixture';

const sent = vi.hoisted(() => ({ send: vi.fn((): Promise<void> => Promise.resolve()) }));
const toasts = vi.hoisted(() => ({ notify: vi.fn() }));

vi.mock('../../../../store/store-context', () => ({ useLedger: (): unknown => sent }));
vi.mock('../../../../components/toast-store', () => toasts);
vi.mock('./use-vacuum', () => ({
  useVacuum: (): unknown => ({ keyOf: (): string => 'raw:identify' }),
}));

const { LOCATE_SENT, useVacuumLocate } = await import('./use-vacuum-actions');

describe('finding the robot', () => {
  it('says the robot plays a sound once the command was sent', async () => {
    const locate = useVacuumLocate(deviceFixture(0, { kind: 'vacuum', name: 'Robot' }));
    expect(locate).toBeDefined();
    locate?.();
    await vi.waitFor(() => {
      expect(toasts.notify).toHaveBeenCalledWith({ message: LOCATE_SENT });
    });
    expect(sent.send).toHaveBeenCalledOnce();
  });
});
