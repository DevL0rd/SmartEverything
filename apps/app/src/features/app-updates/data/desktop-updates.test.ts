import type { AppUpdateCompatible, WebUpdateStatus } from '@smarteverything/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { desktopUpdateAdapter } from './desktop-updates';
import { AppUpdateController } from './update-controller';
import type { AppUpdatePrefs } from './update-prefs';

const ID = '7d0a2f6e-56a4-4c1b-9d43-0e7b3b7f1c11';
const BUILT_AT = '2026-10-20T08:00:00.000Z';
const OFFER: AppUpdateCompatible = {
  id: ID,
  appVersion: '1.2.3',
  createdAt: BUILT_AT,
  notes: 'Improved Updates',
  size: 100,
  files: [],
};

function bridgeOf(
  initial: WebUpdateStatus,
  events: string[],
): Parameters<typeof desktopUpdateAdapter>[0] {
  let status = initial;
  return {
    webUpdateStatus: () => Promise.resolve(status),
    checkWebUpdate: () => Promise.resolve(status),
    downloadWebUpdate: (id: string): Promise<WebUpdateStatus> => {
      events.push(`download:${id}`);
      return Promise.resolve(status);
    },
    applyWebUpdate: (target): Promise<WebUpdateStatus> => {
      events.push(target.kind === 'update' ? `apply:${target.id}` : 'apply:built_in');
      return Promise.resolve({ state: 'applying' });
    },
    onWebUpdateStatus: () => (): void => undefined,
    onWebUpdateConfirmRequested: () => (): void => undefined,
    confirmWebBundle: (): Promise<void> => {
      events.push('confirm');
      status = { state: 'idle', running: { id: 'embedded', createdAt: BUILT_AT } };
      return Promise.resolve();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('desktop updates in the renderer', () => {
  it('downloads and applies the exact update selected by the app', async () => {
    const events: string[] = [];
    const adapter = desktopUpdateAdapter(bridgeOf({ state: 'ready', offer: OFFER }, events));

    await adapter.download(OFFER, () => undefined);
    await adapter.restart({ channel: 'release', target: { kind: 'update', offer: OFFER } });

    expect(events).toStrictEqual([`download:${ID}`, `apply:${ID}`]);
  });

  it('refuses to report success for a different ready update', async () => {
    const events: string[] = [];
    const other = { ...OFFER, id: '2f1c7a52-0e0a-4c0e-9c58-1d4f2f6a9b11' };
    const adapter = desktopUpdateAdapter(bridgeOf({ state: 'ready', offer: other }, events));

    await expect(adapter.download(OFFER, () => undefined)).rejects.toMatchObject({
      cause: 'download',
      detail: `The desktop app downloaded ${other.id} instead of ${ID}.`,
    });
    expect(events).toStrictEqual([`download:${ID}`]);
  });

  it('retries a fresh offer for the same failed update without asking to restart during a call', async () => {
    const events: string[] = [];
    const available = { state: 'available', offer: OFFER } as const;
    const failed = {
      state: 'failed',
      reason: 'The update file was corrupt',
      offer: OFFER,
    } as const;
    const download = vi
      .fn<(id: string) => Promise<WebUpdateStatus>>()
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce({ state: 'ready', offer: OFFER });
    const adapter = desktopUpdateAdapter({
      ...bridgeOf(available, events),
      downloadWebUpdate: download,
    });
    const ask = vi.fn(() => Promise.resolve(false));
    let prefs: AppUpdatePrefs = { channel: 'release', pendingId: null, launchedId: null };
    const controller = new AppUpdateController({
      adapter,
      report: (): Promise<void> => Promise.resolve(),
      prefs: (): AppUpdatePrefs => prefs,
      changePrefs: (change: Partial<AppUpdatePrefs>): void => {
        prefs = { ...prefs, ...change };
      },
      token: (): null => null,
      busy: (): boolean => true,
      ask,
      now: (): number => Date.parse(BUILT_AT),
    });

    await controller.check('button');
    await controller.download(ID);
    expect(controller.state()).toMatchObject({ kind: 'failed', offer: { id: ID } });
    await controller.check('live');
    expect(controller.state()).toMatchObject({ kind: 'failed', offer: { id: ID } });
    expect(download).toHaveBeenCalledTimes(1);

    await controller.retry(ID);
    expect(download.mock.calls).toStrictEqual([[ID], [ID]]);
    expect(controller.state()).toMatchObject({
      kind: 'waiting_for_call',
      target: { kind: 'update', offer: { id: ID } },
    });
    expect(ask).not.toHaveBeenCalled();
    expect(events).toStrictEqual([]);
  });

  it('uses the existing restart confirmation flow for an offered built-in rollback', async () => {
    const events: string[] = [];
    const adapter = desktopUpdateAdapter(
      bridgeOf({ state: 'rollback_ready', currentId: ID }, events),
    );

    expect(await adapter.check({ channel: 'release' })).toStrictEqual({
      compatible: null,
      newer: null,
      rollBackToEmbedded: true,
    });
    await adapter.prepareRollback();
    expect(events).toStrictEqual([]);
    await adapter.restart({ channel: 'release', target: { kind: 'built_in' } });
    expect(events).toStrictEqual(['apply:built_in']);
  });

  it('reports the confirmed running bundle only after the first frame', async () => {
    const events: string[] = [];
    vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback): number => {
      events.push('frame');
      run(0);
      return 1;
    });
    const adapter = desktopUpdateAdapter(bridgeOf({ state: 'applying' }, events));

    expect(await adapter.start()).toStrictEqual({
      kind: 'started',
      running: { kind: 'embedded', builtAt: BUILT_AT },
      runtimeVersion: null,
      emergency: null,
    });
    expect(events).toStrictEqual(['frame', 'confirm']);
  });
});
