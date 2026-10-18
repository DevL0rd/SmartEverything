import { describe, expect, it } from 'vitest';
import { snapshotOf } from './snapshot-fixture';
import { SYNC_DOWNLOAD, SYNC_UPLOAD, syncReadings } from './sync-live';

describe('syncReadings', () => {
  it('reads the transfer rates once a baseline exists', () => {
    const base = snapshotOf({ connection: { state: 'online' }, ratesLive: true });
    const readings = syncReadings({
      ...base,
      summary: { ...base.summary, downloadBytesPerSecond: 500, uploadBytesPerSecond: 70 },
    });
    expect(readings).toEqual([
      [SYNC_DOWNLOAD, 500],
      [SYNC_UPLOAD, 70],
    ]);
  });

  it('gives nothing before the first rate or while Syncthing is not online', () => {
    expect(syncReadings(snapshotOf({ connection: { state: 'online' }, ratesLive: false }))).toEqual(
      [],
    );
    expect(
      syncReadings(
        snapshotOf({
          connection: { state: 'unreachable', reason: 'x', since: 'now' },
          ratesLive: true,
        }),
      ),
    ).toEqual([]);
  });
});
