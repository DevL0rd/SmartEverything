import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  APP_PUBLICATION_INPUT,
  type AndroidAppObservation,
  type AppPublication,
  type PairedAndroidBuild,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppPublicationRefused,
  readAppPublication,
  runAppPublication,
  type PublicationPorts,
} from '../self-update-app-job.ts';
import { executeUiPublication } from '../self-update-app-executor.ts';
import { readJob, startJob, type JobStore } from '../self-update-job.ts';

const RUN = '01922cf6-fc0f-76b8-aec5-016cd503c925';
const OTHER_RUN = '01922cf6-fc0f-76b8-aec5-016cd503c926';
const CLIENT = '01922cf6-fc0f-76b8-aec5-016cd503c927';
const OTHER_CLIENT = '01922cf6-fc0f-76b8-aec5-016cd503c928';
const TIME = '2026-11-05T06:00:00.000Z';
const TARGET: AndroidAppObservation = {
  applicationId: 'com.devl0rd.smarteverything.dev',
  versionCode: '29897702',
  runtimeVersion: 'native-runtime',
  channel: 'dev',
  currentUpdateId: null,
  observedAt: TIME,
  lastOutcome: null,
};
const INPUT = APP_PUBLICATION_INPUT.parse({
  action: 'app',
  runId: RUN,
  clientId: CLIENT,
  notes: 'Native change',
  channel: 'dev',
});
const DEVICE = { clientId: CLIENT, observation: TARGET };
const observationsOf = (): Promise<readonly PairedAndroidBuild[]> => Promise.resolve([DEVICE]);
const PUBLISHED: AppPublication = {
  id: RUN,
  clientId: CLIENT,
  applicationId: TARGET.applicationId,
  versionCode: '29897703',
  runtimeVersion: 'new-native-runtime',
  desktop: null,
};

let store: JobStore;

beforeEach(() => {
  store = {
    folder: mkdtempSync(join(tmpdir(), 'self-update-app-job-')),
    now: (): Date => new Date(TIME),
    newId: (): string => RUN,
  };
});

afterEach(() => {
  rmSync(store.folder, { recursive: true, force: true });
});

describe('target-scoped app publication', () => {
  it('refuses an unavailable or differently enrolled target before publishing', async () => {
    const publish = vi.fn();
    const inspect = vi.fn();
    const observations = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          ...DEVICE,
          observation: { ...TARGET, channel: 'release' },
        },
      ]);
    const ports = { store, publish, inspect, observations };
    await expect(runAppPublication(INPUT, ports)).resolves.toMatchObject({
      status: 'refused',
      reason: 'missing_target',
    });
    await expect(runAppPublication({ ...INPUT, runId: OTHER_RUN }, ports)).resolves.toMatchObject({
      status: 'refused',
      reason: 'missing_target',
    });
    expect(publish).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
  });

  it('revalidates the same device build at publication and never reports the install as done', async () => {
    const observations = vi
      .fn()
      .mockResolvedValueOnce([DEVICE])
      .mockResolvedValueOnce([
        {
          ...DEVICE,
          observation: { ...TARGET, versionCode: PUBLISHED.versionCode },
        },
      ]);
    const inspect = vi.fn();
    const committed = vi.fn();
    await expect(
      runAppPublication(INPUT, {
        store,
        observations,
        inspect,
        publish: async (_input, current) => {
          await current();
          committed();
        },
      }),
    ).resolves.toEqual({ status: 'refused', runId: RUN, reason: 'target_changed' });
    expect(observations).toHaveBeenCalledTimes(2);
    expect(committed).not.toHaveBeenCalled();
  });

  it('reconciles an interrupted committed publication before a fresh request without replaying it', async () => {
    const publish = vi.fn().mockRejectedValueOnce(new Error('executor stopped'));
    const inspect = vi
      .fn()
      .mockResolvedValueOnce(PUBLISHED)
      .mockResolvedValueOnce({
        ...PUBLISHED,
        id: OTHER_RUN,
      });
    const ports = { store, publish, inspect, observations: observationsOf };
    await expect(runAppPublication(INPUT, ports)).rejects.toThrow('executor stopped');
    expect(readJob(store, RUN)?.phase).toBe('running');
    await expect(runAppPublication({ ...INPUT, runId: OTHER_RUN }, ports)).resolves.toEqual({
      status: 'published',
      runId: OTHER_RUN,
      publication: { ...PUBLISHED, id: OTHER_RUN },
    });
    await expect(readAppPublication(RUN, ports)).resolves.toEqual({
      status: 'published',
      runId: RUN,
      publication: PUBLISHED,
    });
    await expect(runAppPublication(INPUT, ports)).resolves.toMatchObject({ status: 'published' });
    expect(publish).toHaveBeenNthCalledWith(1, INPUT, expect.any(Function));
    expect(publish).toHaveBeenNthCalledWith(
      2,
      { ...INPUT, runId: OTHER_RUN },
      expect.any(Function),
    );
    expect(inspect).toHaveBeenCalledTimes(2);
  });

  it('records an interrupted run with no committed publication as failed and admits a new request', async () => {
    const publish = vi.fn().mockRejectedValueOnce(new Error('executor stopped'));
    const ports = {
      store,
      publish,
      inspect: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...PUBLISHED,
          id: OTHER_RUN,
        }),
      observations: observationsOf,
    };
    await expect(runAppPublication(INPUT, ports)).rejects.toThrow('executor stopped');
    await expect(runAppPublication({ ...INPUT, runId: OTHER_RUN }, ports)).resolves.toMatchObject({
      status: 'published',
      publication: { id: OTHER_RUN },
    });
    await expect(readAppPublication(RUN, ports)).resolves.toMatchObject({
      status: 'failed',
      runId: RUN,
    });
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('settles an abandoned planned request by status without invoking the publisher', async () => {
    startJob(store, INPUT.action, INPUT, null);
    const inspect = vi.fn().mockResolvedValue(null);
    await expect(readAppPublication(OTHER_RUN, { store, inspect })).resolves.toBeNull();
    await expect(readAppPublication(RUN, { store, inspect })).resolves.toMatchObject({
      status: 'failed',
      runId: RUN,
    });
    expect(inspect).toHaveBeenCalledExactlyOnceWith(INPUT);
  });

  it('refuses an apparent receipt or replay belonging to another device', async () => {
    const ports = {
      store,
      observations: observationsOf,
      publish: vi.fn(),
      inspect: (): Promise<AppPublication> =>
        Promise.resolve({ ...PUBLISHED, clientId: OTHER_CLIENT }),
    };
    await expect(runAppPublication(INPUT, ports)).rejects.toThrow('another request or device');
    await expect(runAppPublication({ ...INPUT, runId: OTHER_RUN }, ports)).rejects.toThrow(
      'another request or device',
    );
    await expect(runAppPublication({ ...INPUT, clientId: OTHER_CLIENT }, ports)).rejects.toThrow(
      'different update',
    );
    expect(ports.publish).toHaveBeenCalledTimes(1);
  });
  it('revalidates the selected Release device without publishing to other devices', async () => {
    const selected = { ...DEVICE, observation: { ...TARGET, channel: 'release' as const } };
    const other = { ...selected, clientId: OTHER_CLIENT };
    const observations = vi.fn(() => Promise.resolve([other, selected]));
    const publish = vi.fn<PublicationPorts['publish']>(async (_input, currentTargets) => {
      await expect(currentTargets()).resolves.toEqual([selected]);
    });
    const result = await runAppPublication(
      { ...INPUT, channel: 'release' },
      {
        store,
        observations,
        publish,
        inspect: () => Promise.resolve(PUBLISHED),
      },
    );
    expect(result).toEqual({ status: 'published', runId: RUN, publication: PUBLISHED });
    expect(publish).toHaveBeenCalledOnce();
    expect(observations.mock.calls).toHaveLength(2);
    expect(observations).toHaveBeenCalledWith(CLIENT);
  });

  it('publishes to Release as a cohort and refuses the old feed without a device', async () => {
    const publish = vi.fn();
    const ports = {
      store,
      observations: (): Promise<readonly PairedAndroidBuild[]> =>
        Promise.resolve([{ ...DEVICE, observation: { ...TARGET, channel: 'release' } }]),
      publish,
      inspect: (): Promise<AppPublication> =>
        Promise.resolve({ ...PUBLISHED, id: OTHER_RUN, clientId: null }),
    };
    const cohort = APP_PUBLICATION_INPUT.parse({
      action: 'app',
      runId: OTHER_RUN,
      notes: 'Native change',
    });
    await expect(
      runAppPublication({ ...cohort, channel: 'dev', runId: OTHER_CLIENT }, ports),
    ).resolves.toMatchObject({ status: 'refused', reason: 'test_requires_device' });
    await expect(runAppPublication(cohort, ports)).resolves.toMatchObject({
      status: 'published',
      publication: { clientId: null },
    });
    expect(publish).toHaveBeenCalledTimes(1);
  });
});

describe('Android and desktop UI publication', () => {
  it('records the refusal detail as the reason', async () => {
    const result = await runAppPublication(INPUT, {
      store,
      observations: observationsOf,
      publish: () =>
        Promise.reject(
          new AppPublicationRefused('preflight', 'apps/app/google-services.json is missing'),
        ),
      inspect: () => Promise.resolve(null),
    });
    expect(result).toEqual({
      status: 'refused',
      runId: RUN,
      reason: 'preflight: apps/app/google-services.json is missing',
    });
    expect(readJob(store, RUN)?.detail).toBe('preflight: apps/app/google-services.json is missing');
  });

  it('retains partial receipts when desktop preflight fails after Android was offered', async () => {
    const android = { ...PUBLISHED, versionCode: null };
    const input = { ...INPUT, action: 'ui' as const };
    let committed = false;
    const ports = {
      store,
      observations: observationsOf,
      inspect: (): Promise<AppPublication | null> => Promise.resolve(committed ? android : null),
      publish: (): Promise<void> => {
        committed = true;
        return Promise.reject(new AppPublicationRefused('preflight'));
      },
    };
    await expect(runAppPublication(input, ports)).resolves.toEqual({
      status: 'partial',
      runId: RUN,
      publication: android,
    });
    await expect(readAppPublication(RUN, ports)).resolves.toEqual({
      status: 'partial',
      runId: RUN,
      publication: android,
    });
    expect(readJob(store, RUN)?.phase).toBe('running');
  });

  it('revalidates an Android build after lazy UI preparation before publishing its offer', async () => {
    const observations = vi
      .fn()
      .mockResolvedValueOnce([DEVICE])
      .mockResolvedValueOnce([{ ...DEVICE, observation: { ...TARGET, versionCode: '29897703' } }]);
    const committed = vi.fn();
    const result = await runAppPublication(
      { ...INPUT, action: 'ui' },
      {
        store,
        observations,
        inspect: (): Promise<null> => Promise.resolve(null),
        publish: async (_input, currentTargets) => {
          await currentTargets();
          await currentTargets();
          committed();
        },
      },
    );
    expect(result).toEqual({ status: 'refused', runId: RUN, reason: 'target_changed' });
    expect(observations).toHaveBeenCalledTimes(2);
    expect(committed).not.toHaveBeenCalled();
  });

  it('completes desktop-only retry after the Android target disappears without replaying Android', async () => {
    const input = { ...INPUT, action: 'ui' as const };
    const androidReceipt = { ...PUBLISHED, versionCode: null };
    const desktopReceipt = { id: OTHER_RUN, runtimeVersion: 'desktop-native' };
    const android = vi.fn();
    const desktop = vi
      .fn()
      .mockRejectedValueOnce(new Error('Desktop interrupted'))
      .mockResolvedValueOnce(undefined);
    const observations = vi.fn(observationsOf);
    let completed = false;
    let androidCommitted = false;
    const ports: PublicationPorts = {
      store,
      observations,
      inspect: () =>
        Promise.resolve(
          androidCommitted
            ? {
                ...androidReceipt,
                desktop: completed ? desktopReceipt : null,
              }
            : null,
        ),
      publish: async (request, currentTargets) =>
        executeUiPublication(request, {
          entries: () => Promise.resolve(androidCommitted ? [{ id: RUN }] : []),
          android: async () => {
            await currentTargets();
            android();
            androidCommitted = true;
          },
          desktop: async () => {
            await desktop();
            completed = true;
          },
        }),
    };
    await expect(runAppPublication(input, ports)).rejects.toThrow('Desktop interrupted');
    observations.mockResolvedValue([]);
    await expect(runAppPublication(input, ports)).resolves.toEqual({
      status: 'published',
      runId: RUN,
      publication: { ...androidReceipt, desktop: desktopReceipt },
    });
    expect(android).toHaveBeenCalledOnce();
    expect(desktop).toHaveBeenCalledTimes(2);
    expect(observations).toHaveBeenCalledOnce();
  });

  it('reports partial completion and resumes the same run until both offers are durable', async () => {
    const input = { ...INPUT, action: 'ui' as const };
    const android = { ...PUBLISHED, versionCode: null };
    const desktop = { id: OTHER_RUN, runtimeVersion: 'desktop-native' };
    const inspect = vi
      .fn()
      .mockResolvedValueOnce(android)
      .mockResolvedValueOnce(android)
      .mockResolvedValueOnce({ ...android, desktop });
    const publish = vi.fn();
    const ports = { store, inspect, publish, observations: observationsOf };
    await expect(runAppPublication(input, ports)).resolves.toEqual({
      status: 'partial',
      runId: RUN,
      publication: android,
    });
    await expect(runAppPublication(input, ports)).resolves.toEqual({
      status: 'published',
      runId: RUN,
      publication: { ...android, desktop },
    });
    await expect(runAppPublication(input, ports)).resolves.toMatchObject({
      status: 'published',
      runId: RUN,
    });
    expect(publish).toHaveBeenCalledTimes(2);
  });
});
