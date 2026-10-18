import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION } from '@smarteverything/domain';

const saves = vi.hoisted(
  (): {
    calls: { page: string; settle: { ok: () => void; fail: (error: Error) => void } }[];
  } => ({ calls: [] }),
);
const notify = vi.hoisted(() => vi.fn());

vi.mock('../api/transport', () => ({
  api: (): {
    call: (endpoint: unknown, input: { params: { page: string } }) => Promise<unknown>;
  } => ({
    call: (_endpoint, input) =>
      new Promise((resolve, reject) => {
        saves.calls.push({
          page: input.params.page,
          settle: {
            ok: (): void => {
              resolve({});
            },
            fail: reject,
          },
        });
      }),
  }),
}));
vi.mock('../components/toast-store', () => ({ notify }));

const { PREFS, prefOf, savePref } = await import('./prefs');
const { EntityStore } = await import('./entity-store');

const SESSION_ROW = SESSION.parse({
  client: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Phone',
    platform: 'android',
    role: 'owner',
    built_in: false,
    profile_id: '00000000-0000-4000-8000-000000000002',
    created_at: '2026-10-01T00:00:00.000Z',
    last_seen_at: null,
  },
  hub: { version: '1.0.0', startedAt: '2026-10-01T00:00:00.000Z', cameras: 'running' },
});

function pairedStore(): InstanceType<typeof EntityStore> {
  const store = new EntityStore();
  store.update((state) => ({ ...state, session: SESSION_ROW }));
  return store;
}

async function settled(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function appearanceOf(store: InstanceType<typeof EntityStore>): unknown {
  const read = prefOf(store.get(), PREFS.appearance);
  return read.status === 'stored' ? read.value : null;
}

describe('saving a stored preference', () => {
  beforeEach(() => {
    saves.calls.length = 0;
    notify.mockReset();
  });

  it('shows the new value at once and keeps it when the hub confirms without a sequence header', async () => {
    const store = pairedStore();
    const next = { ...PREFS.appearance.defaultValue, theme: 'dark' as const };
    savePref(store, PREFS.appearance, next);
    expect(appearanceOf(store)).toStrictEqual(next);
    saves.calls[0]?.settle.ok();
    await settled();
    expect(appearanceOf(store)).toStrictEqual(next);
    expect(notify).not.toHaveBeenCalled();
  });

  it('puts the previous value back and says so when the save is refused', async () => {
    const store = pairedStore();
    const first = { ...PREFS.appearance.defaultValue, theme: 'light' as const };
    const second = { ...PREFS.appearance.defaultValue, theme: 'dark' as const };
    savePref(store, PREFS.appearance, first);
    saves.calls[0]?.settle.ok();
    await settled();
    savePref(store, PREFS.appearance, second);
    saves.calls[1]?.settle.fail(new Error('refused'));
    await settled();
    expect(appearanceOf(store)).toStrictEqual(first);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('removes the optimistic row when nothing was stored before and the save is refused', async () => {
    const store = pairedStore();
    savePref(store, PREFS.appearance, { ...PREFS.appearance.defaultValue, theme: 'dark' as const });
    saves.calls[0]?.settle.fail(new Error('refused'));
    await settled();
    expect(prefOf(store.get(), PREFS.appearance).status).toBe('absent');
  });

  it('does not undo a newer edit when an older save fails', async () => {
    const store = pairedStore();
    const older = { ...PREFS.appearance.defaultValue, theme: 'light' as const };
    const newer = { ...PREFS.appearance.defaultValue, theme: 'dark' as const };
    savePref(store, PREFS.appearance, older);
    savePref(store, PREFS.appearance, newer);
    saves.calls[0]?.settle.fail(new Error('refused'));
    await settled();
    expect(appearanceOf(store)).toStrictEqual(newer);
  });

  it('does nothing before the home session is known', () => {
    const store = new EntityStore();
    savePref(store, PREFS.appearance, PREFS.appearance.defaultValue);
    expect(saves.calls).toHaveLength(0);
  });
});
