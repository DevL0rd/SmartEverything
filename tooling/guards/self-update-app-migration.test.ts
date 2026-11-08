import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAppPublication, runAppPublication } from '../self-update-app-job.ts';
import { changeJob, readJob, startJob, type JobStore } from '../self-update-job.ts';
import { migrateAppPublications } from '../self-update-app-migration.ts';

const RUN = '01922cf6-fc0f-76b8-aec5-016cd503c925';
const RECEIPT = {
  id: RUN,
  clientId: null,
  applicationId: 'com.devl0rd.smarteverything.dev',
  versionCode: null,
  runtimeVersion: 'android-runtime',
};
let store: JobStore;
beforeEach(() => {
  store = {
    folder: mkdtempSync(join(tmpdir(), 'publication-migration-')),
    now: (): Date => new Date('2026-11-08T00:00:00Z'),
    newId: (): string => RUN,
  };
});
afterEach(() => {
  rmSync(store.folder, { recursive: true, force: true });
});

describe('retained publication receipt migration', () => {
  it.each(['ui', 'app'] as const)(
    'preserves historical %s receipts without republishing',
    async (action) => {
      const input = { action, runId: RUN, notes: 'Historical update', channel: 'release' as const };
      const job = startJob(store, action, input, null);
      changeJob(store, job, { phase: 'published', result: RECEIPT });
      const inspect = vi.fn();
      const publish = vi.fn();
      const ports = { store, inspect, publish, observations: vi.fn() };
      const expected = {
        status: action === 'ui' ? 'partial' : 'published',
        runId: RUN,
        publication: { ...RECEIPT, desktop: null },
      };
      await expect(readAppPublication(RUN, ports)).resolves.toEqual(expected);
      await expect(runAppPublication(input, ports)).resolves.toEqual(expected);
      expect(inspect).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
      expect(readJob(store, RUN)?.phase).toBe('published');
      migrateAppPublications(store);
      expect(readJob(store, RUN)?.result).toEqual(expected.publication);
    },
  );
});
