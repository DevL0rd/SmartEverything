import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityStore } from '../../../store/entity-store';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn().mockResolvedValue(undefined) },
}));

const written = vi.hoisted(() => ({ write: vi.fn() }));

vi.mock('../settings/voice-thinking', () => ({ THINKING_SETTING: written }));

const { overlayVoiceOf, reconnected, saveThinking, thinkingSave } = await import('./overlay-voice');

const STORE = new EntityStore();

beforeEach(() => {
  written.write.mockReset();
  thinkingSave.set({ pending: 0, failed: false, changedCall: null });
});

describe('saving the thinking level from the overlay', () => {
  it('writes through the setting definition and remembers the call it changed', async () => {
    written.write.mockResolvedValue(undefined);
    await saveThinking('high', STORE, 'call-1');
    expect(written.write).toHaveBeenCalledWith('high', expect.objectContaining({ store: STORE }));
    expect(thinkingSave.get()).toEqual({ pending: 0, failed: false, changedCall: 'call-1' });
    reconnected();
    expect(thinkingSave.get().changedCall).toBeNull();
  });

  it('marks the save failed and leaves the call unchanged', async () => {
    written.write.mockRejectedValue(new Error('offline'));
    await saveThinking('low', STORE, 'call-1');
    expect(thinkingSave.get()).toEqual({ pending: 0, failed: true, changedCall: null });
  });

  it('counts overlapping saves and clears the failure on the next press', async () => {
    thinkingSave.set({ pending: 0, failed: true, changedCall: null });
    let finish = (): void => undefined;
    written.write.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const first = saveThinking('medium', STORE, null);
    expect(thinkingSave.get()).toMatchObject({ pending: 1, failed: false });
    finish();
    await first;
    expect(thinkingSave.get()).toEqual({ pending: 0, failed: false, changedCall: null });
  });
});

describe('overlayVoiceOf', () => {
  const save = { pending: 1, failed: false, changedCall: 'call-1' };

  it('is unloaded until the hub level is known', () => {
    expect(overlayVoiceOf(null, save, 'call-1')).toBeNull();
  });

  it('reports saving and a change made in this call only', () => {
    expect(overlayVoiceOf('low', save, 'call-1')).toEqual({
      thinking_level: 'low',
      saving: true,
      failed: false,
      changedInCall: true,
    });
    expect(overlayVoiceOf('low', save, 'call-2')?.changedInCall).toBe(false);
    expect(overlayVoiceOf('low', save, null)?.changedInCall).toBe(false);
  });
});
