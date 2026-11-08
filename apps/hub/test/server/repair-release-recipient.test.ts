import { describe, expect, it } from 'vitest';
import { keptHubReleaseOrigin } from '../../src/server/repair-release-recipient';
import type { StoredLogRecord } from '../../src/store/repositories/runtime-log-types';

const RUN = 'd8f46400-bb95-4018-916f-1ee39ec3862c';
const FINISHED = '2026-10-08T10:00:00.000Z';
const LOGGED = '2026-10-08T10:01:00.000Z';
const ORIGIN = {
  chatId: '47bba84a-6682-4d5d-8db2-5982b808b4d5',
  profileId: '72802ea9-0e8b-4a7a-bb8f-edca1c59f0ef',
};
const RELEASE = { runId: RUN, phase: 'done', finishedAt: FINISHED, origin: ORIGIN } as const;
const RECORD: StoredLogRecord = {
  at: LOGGED,
  recordedAt: LOGGED,
  source: 'hub:service',
  runtime: 'hub',
  platform: 'server',
  deviceId: null,
  clientId: 'hub',
  scope: 'hub.service',
  event: 'service.fatal',
  level: 'exception',
  payload: {},
  failure: { name: 'Error', message: 'fixture' },
  durationMs: null,
  hubBootRunId: RUN,
};

describe('hub release recipient', () => {
  it('uses the origin for the exact current verified release', () => {
    expect(keptHubReleaseOrigin(RECORD, RELEASE)).toEqual(ORIGIN);
  });

  it('ignores stale, restored and as yet unverified releases', () => {
    expect(keptHubReleaseOrigin(RECORD, { ...RELEASE, runId: ORIGIN.chatId })).toBeUndefined();
    expect(keptHubReleaseOrigin(RECORD, { ...RELEASE, phase: 'reverted' })).toBeUndefined();
    expect(
      keptHubReleaseOrigin({ ...RECORD, at: '2026-10-08T09:00:00.000Z' }, RELEASE),
    ).toBeUndefined();
  });

  it('ignores other components and does not read a receipt from payload', () => {
    const { hubBootRunId, ...unclaimed } = RECORD;
    expect(keptHubReleaseOrigin({ ...RECORD, source: 'node:fixture' }, RELEASE)).toBeUndefined();
    expect(
      keptHubReleaseOrigin({ ...unclaimed, payload: { hubBootRunId } }, RELEASE),
    ).toBeUndefined();
  });
});
