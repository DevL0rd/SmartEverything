import { desiredHarnessConfiguration } from '@smarteverything/harness';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

beforeEach(async () => {
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

describe('the recorded harness configuration', () => {
  it('points at the newest configuration and keeps older ones readable for hosts still on them', () => {
    const repository = opened.store.harnessConfiguration;
    const first = repository.record(desiredHarnessConfiguration());
    const second = repository.record(
      desiredHarnessConfiguration({ selections: { browser: { enabled: false, config: {} } } }),
    );

    expect(repository.desired()).toEqual(second);
    expect(repository.currentRevision()).toBe(second.revision);
    expect(repository.readRevision(first.revision)).toEqual(first);
  });

  it('records the same configuration twice as one revision', () => {
    const repository = opened.store.harnessConfiguration;
    const configuration = desiredHarnessConfiguration({
      skills: [{ id: 'skill:a', version: 'v1', executes: false }],
    });

    repository.record(configuration);
    repository.record(configuration);

    expect(repository.desired()).toEqual(configuration);
  });

  it('accepts a ready report whose installed metadata and provenance differ from the desired entry', () => {
    const repository = opened.store.harnessConfiguration;
    const desired = repository.record(desiredHarnessConfiguration());
    const runtime = '11111111-1111-4111-8111-111111111111';
    const generation = '22222222-2222-4222-8222-222222222222';
    const readiness = desired.entries.map((entry) => ({
      id: entry.id,
      package: entry.package,
      requestedVersion: entry.version,
      installedVersion: entry.version,
      provenance: 'another-build',
      state: entry.enabled ? ('ready' as const) : ('disabled' as const),
      reason: null,
      ...(entry.metadata === undefined
        ? {}
        : { installedMetadata: { ...entry.metadata, dsh_version: 'another-build' } }),
    }));

    const stored = repository.report(
      {
        target: { kind: 'server' },
        runtime_instance: runtime,
        connection_generation: generation,
        revision: desired.revision,
        readiness,
        reported_at: '2026-10-17T09:00:00.000Z',
      },
      {
        target: { kind: 'server' },
        runtime_instance: runtime,
        connection_generation: generation,
        online: true,
      },
    );

    expect(stored.readiness.map((entry) => entry.state)).toEqual(
      readiness.map((entry) => entry.state),
    );
  });
});
