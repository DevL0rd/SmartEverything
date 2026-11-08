import { describe, expect, it, vi } from 'vitest';
import type { AppUpdateOffer } from '@smarteverything/domain';
import type { UpdateCheckResult, UpdateFetchResult } from 'expo-updates';

const native = vi.hoisted(() => {
  const state: { module: object | null } = { module: null };
  return state;
});

vi.mock('expo', () => ({
  requireOptionalNativeModule: (): object | null => native.module,
}));

vi.mock('expo-crypto', () => ({ randomUUID: (): string => crypto.randomUUID() }));

vi.mock('./android-build', () => ({ androidBuildReport: (): null => null }));

vi.mock('expo-updates', () => {
  throw new Error('expo-updates must not load without its native module');
});

const {
  METRO_BUILD_REASON,
  nativeAdapterOf: makeNativeAdapter,
  nativeUpdateAdapter,
  outcomeOf,
} = await import('./native-updates');

const { UpdateFailure } = await import('../model/adapter');

const ID = '7d0a2f6e-56a4-4c1b-9d43-0e7b3b7f1c11';

const OFFER: AppUpdateOffer = {
  compatible: {
    id: ID,
    createdAt: '2026-10-24T10:00:00.000Z',
    appVersion: '1.4.0',
    notes: 'Faster camera start',
    size: 1024,
    files: [],
  },
  newerIncompatible: null,
  rollBackToEmbedded: false,
};

type Updates = Parameters<typeof makeNativeAdapter>[0];
type HubReads = Parameters<typeof makeNativeAdapter>[1];
type LaunchApproval = Parameters<typeof makeNativeAdapter>[2];

function nativeAdapterOf(
  updates: Updates,
  hub: HubReads,
  approval: LaunchApproval = { approveUpdateAsync: vi.fn(() => Promise.resolve()) },
): ReturnType<typeof makeNativeAdapter> {
  return makeNativeAdapter(updates, hub, approval);
}

function fakeUpdates(overrides: Partial<Updates> = {}): Updates {
  return {
    isEnabled: true,
    isEmbeddedLaunch: true,
    isEmergencyLaunch: false,
    emergencyLaunchReason: null,
    updateId: null,
    createdAt: new Date('2026-10-20T08:00:00.000Z'),
    runtimeVersion: 'runtime-a',
    manifest: {},
    setUpdateRequestHeadersOverride: vi.fn(),
    setExtraParamAsync: vi.fn(() => Promise.resolve()),
    checkForUpdateAsync: vi.fn((): Promise<UpdateCheckResult> =>
      Promise.resolve({
        isAvailable: true,
        manifest: { id: ID, commitTime: 0, assets: [] },
        isRollBackToEmbedded: false,
        reason: undefined,
      }),
    ),
    fetchUpdateAsync: vi.fn((): Promise<UpdateFetchResult> =>
      Promise.resolve({
        isNew: true,
        manifest: { id: ID, commitTime: 0, assets: [] },
        isRollBackToEmbedded: false,
      }),
    ),
    addUpdatesStateChangeListener: vi.fn(() => ({ remove: vi.fn() })),
    reloadAsync: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

const KEY = `${ID}.${'k'.repeat(43)}`;

function hubOf(offer: AppUpdateOffer = OFFER): {
  readonly readOffer: ReturnType<typeof vi.fn<() => Promise<AppUpdateOffer>>>;
  readonly readKey: ReturnType<typeof vi.fn<() => Promise<{ readonly key: string }>>>;
  readonly reportBuild: ReturnType<typeof vi.fn<() => Promise<void>>>;
} {
  return {
    readOffer: vi.fn(() => Promise.resolve(offer)),
    readKey: vi.fn(() => Promise.resolve({ key: KEY })),
    reportBuild: vi.fn(() => Promise.resolve()),
  };
}

describe('the Android update adapter', () => {
  it('fails loudly at load without the native module', async () => {
    await expect(nativeUpdateAdapter(hubOf())).rejects.toThrow(
      'The ExpoUpdates native module with approveUpdateAsync is required.',
    );
  });

  it('does not take the failed update from stored state when the launch was rolled back', async () => {
    const adapter = nativeAdapterOf(
      fakeUpdates({ isEmergencyLaunch: true, emergencyLaunchReason: 'The update crashed' }),
      hubOf(),
    );
    await expect(adapter.start()).resolves.toMatchObject({
      kind: 'started',
      emergency: { failedId: null, reason: 'The update crashed' },
    });
  });

  it('says a Metro build has updates off', async () => {
    const adapter = nativeAdapterOf(fakeUpdates({ isEnabled: false }), hubOf());
    await expect(adapter.start()).resolves.toEqual({
      kind: 'unsupported',
      reason: METRO_BUILD_REASON,
    });
  });

  it('removes the old request header override on start so the built-in update launches again', async () => {
    const updates = fakeUpdates();
    await nativeAdapterOf(updates, hubOf()).start();
    expect(updates.setUpdateRequestHeadersOverride).toHaveBeenCalledWith(null);
  });

  it('sends the channel and the device update key as extra params before the check', async () => {
    const updates = fakeUpdates();
    const order: string[] = [];
    vi.mocked(updates.setExtraParamAsync).mockImplementation((name) => {
      order.push(name);
      return Promise.resolve();
    });
    vi.mocked(updates.checkForUpdateAsync).mockImplementationOnce(() => {
      order.push('check');
      return Promise.resolve({
        isAvailable: true,
        manifest: { id: ID, commitTime: 0, assets: [] },
        isRollBackToEmbedded: false,
        reason: undefined,
      });
    });
    const hub = hubOf();
    const outcome = await nativeAdapterOf(updates, hub).check({ channel: 'dev' });
    expect(updates.setExtraParamAsync).toHaveBeenCalledWith('channel', 'dev');
    expect(updates.setExtraParamAsync).toHaveBeenCalledWith('key', KEY);
    expect(order).toEqual(['channel', 'key', 'download', 'check']);
    expect(updates.setUpdateRequestHeadersOverride).not.toHaveBeenCalled();
    expect(hub.readOffer).toHaveBeenCalledWith({
      platform: 'android',
      channel: 'dev',
      runtimeVersion: 'runtime-a',
      currentId: null,
    });
    expect(outcome.compatible?.id).toBe(ID);
  });

  it('reads the rollBackToEmbedded directive and prepares the return with a fetch', async () => {
    const updates = fakeUpdates({
      isEmbeddedLaunch: false,
      updateId: ID,
      checkForUpdateAsync: vi.fn((): Promise<UpdateCheckResult> =>
        Promise.resolve({
          isAvailable: false,
          manifest: undefined,
          isRollBackToEmbedded: true,
          reason: undefined,
        }),
      ),
      fetchUpdateAsync: vi.fn((): Promise<UpdateFetchResult> =>
        Promise.resolve({ isNew: false, manifest: undefined, isRollBackToEmbedded: true }),
      ),
    });
    const withdrawn = { compatible: null, newerIncompatible: null, rollBackToEmbedded: true };
    const adapter = nativeAdapterOf(updates, hubOf(withdrawn));
    await expect(adapter.check({ channel: 'release' })).resolves.toEqual({
      compatible: null,
      newer: null,
      rollBackToEmbedded: true,
    });
    await expect(adapter.prepareRollback()).resolves.toBeUndefined();
    expect(updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
  });

  it('refuses to prepare a return the phone did not receive', async () => {
    const adapter = nativeAdapterOf(fakeUpdates(), hubOf());
    await expect(adapter.prepareRollback()).rejects.toMatchObject({ cause: 'check' });
  });

  it('pins the selected update during the native fetch and clears the pin afterwards', async () => {
    const updates = fakeUpdates();
    const approval = { approveUpdateAsync: vi.fn(() => Promise.resolve()) };
    vi.mocked(updates.fetchUpdateAsync).mockImplementationOnce(() => {
      expect(updates.setExtraParamAsync).toHaveBeenLastCalledWith('download', ID);
      return Promise.resolve({
        isNew: true,
        manifest: { id: ID, commitTime: 0, assets: [] },
        isRollBackToEmbedded: false,
      });
    });
    const adapter = nativeAdapterOf(updates, hubOf(), approval);
    const { compatible } = await adapter.check({ channel: 'release' });
    if (compatible === null) throw new Error('Expected the test update to be offered');
    await adapter.download(compatible, vi.fn());
    expect(updates.setExtraParamAsync).toHaveBeenLastCalledWith('download', null);
    expect(approval.approveUpdateAsync).not.toHaveBeenCalled();
  });

  it('does not restart into a staged update after the home withdraws it', async () => {
    const updates = fakeUpdates();
    const hub = hubOf();
    const approval = { approveUpdateAsync: vi.fn(() => Promise.resolve()) };
    vi.mocked(updates.reloadAsync).mockImplementationOnce(() => {
      expect(approval.approveUpdateAsync).toHaveBeenCalledWith(ID);
      return Promise.resolve();
    });
    const adapter = nativeAdapterOf(updates, hub, approval);
    const { compatible } = await adapter.check({ channel: 'dev' });
    if (compatible === null) throw new Error('Expected the test update to be offered');
    await adapter.download(compatible, vi.fn());
    hub.readOffer.mockResolvedValueOnce({ ...OFFER, compatible: null });
    const request = { channel: 'dev', target: { kind: 'update', offer: compatible } } as const;
    const withdrawn: unknown = expect.stringContaining('no longer available');
    await expect(adapter.restart(request)).rejects.toMatchObject({
      cause: 'restart',
      sentence: withdrawn,
    });
    expect(approval.approveUpdateAsync).not.toHaveBeenCalled();
    expect(updates.reloadAsync).not.toHaveBeenCalled();
    await adapter.restart(request);
    expect(updates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('does not reload when native storage fails to record approval', async () => {
    const updates = fakeUpdates();
    const approval = { approveUpdateAsync: vi.fn(() => Promise.reject(new Error('no storage'))) };
    const adapter = nativeAdapterOf(updates, hubOf(), approval);
    const { compatible } = await adapter.check({ channel: 'dev' });
    if (compatible === null) throw new Error('Expected the test update to be offered');
    const stored: unknown = expect.stringContaining('no storage');
    await expect(
      adapter.restart({ channel: 'dev', target: { kind: 'update', offer: compatible } }),
    ).rejects.toMatchObject({ cause: 'restart', detail: stored });
    expect(updates.reloadAsync).not.toHaveBeenCalled();
  });

  it('refuses an update or a return to the built-in version the home does not offer', () => {
    expect(() =>
      outcomeOf(OFFER, { kind: 'update', id: 'a1b2c3d4-0000-4000-8000-000000000001' }),
    ).toThrow(UpdateFailure);
    expect(() => outcomeOf(OFFER, { kind: 'built_in' })).toThrow(
      expect.objectContaining({
        detail: `The phone found a return to the built-in version, but the home offers update ${ID} for this app.`,
      }),
    );
    expect(outcomeOf(OFFER, { kind: 'none' })).toEqual({
      compatible: null,
      newer: null,
      rollBackToEmbedded: false,
    });
  });
});
