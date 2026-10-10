import { describe, expect, it } from 'vitest';
import { activityOf, alertOf, planEvents } from '../../../src/plugins/builtin/syncthing/event-plan';
import { parseGui } from '../../../src/plugins/builtin/syncthing/config-import';
import { buildSnapshot } from '../../../src/plugins/builtin/syncthing/snapshot';
import { emptySyncData } from '../../../src/plugins/builtin/syncthing/sync-data';
import { TransferRates } from '../../../src/plugins/builtin/syncthing/transfer-rates';
import { PEER_ID } from './fake-syncthing';

function event(
  id: number,
  type: string,
  data: unknown,
): { id: number; type: string; time: string; data: unknown } {
  return { id, type, time: '2026-10-09T10:00:00Z', data };
}

describe('syncthing events', () => {
  it('plans refreshes per event and falls back to a full refresh for unknown ones', () => {
    const plan = planEvents([
      event(1, 'ItemFinished', { folder: 'docs' }),
      event(2, 'DeviceConnected', { id: PEER_ID }),
    ]);
    expect([...plan.folders]).toEqual(['docs']);
    expect([...plan.parts].sort()).toEqual(['completion', 'connections', 'deviceStats', 'stats']);
    expect(plan.full).toBe(false);
    expect(planEvents([event(3, 'SomethingNew', {})]).full).toBe(true);
  });

  it('turns change and device events into activity and alerts', () => {
    expect(
      activityOf(
        event(4, 'RemoteChangeDetected', {
          folder: 'docs',
          path: 'a.txt',
          action: 'deleted',
          modifiedBy: PEER_ID,
        }),
      ),
    ).toMatchObject({
      kind: 'deleted',
      remote: true,
      deviceId: PEER_ID,
      path: 'a.txt',
    });
    expect(activityOf(event(5, 'DeviceDisconnected', { id: PEER_ID }))?.kind).toBe('disconnected');
    expect(
      alertOf(
        event(6, 'FolderErrors', { folder: 'docs', errors: [{ path: 'x', error: 'denied' }] }),
      )?.kind,
    ).toBe('sync_folder_error');
    expect(alertOf(event(7, 'FolderErrors', { folder: 'docs', errors: [] }))).toBeNull();
  });

  it('reads the web address and key from config.xml', () => {
    const xml =
      '<gui enabled="true" tls="false"><address>0.0.0.0:8384</address><apikey>abcdefghijk</apikey></gui>';
    expect(parseGui(xml)).toEqual({ tls: false, address: '0.0.0.0:8384', apiKey: 'abcdefghijk' });
  });
});

describe('syncthing snapshot', () => {
  it('summarises folders and devices and flags an overdue device', () => {
    const data = emptySyncData();
    data.myId = 'ME';
    data.folders = [
      {
        id: 'docs',
        label: 'Docs',
        path: '/d',
        type: 'sendreceive',
        paused: false,
        devices: [{ deviceID: PEER_ID }],
      },
    ];
    data.devices = [{ deviceID: PEER_ID, name: 'Laptop', paused: false, ignoredFolders: [] }];
    data.summaries.set('docs', {
      state: 'syncing',
      error: '',
      globalBytes: 1000,
      needBytes: 250,
      needTotalItems: 3,
      receiveOnlyChangedFiles: 0,
      pullErrors: 0,
    });
    data.deviceStats = { [PEER_ID]: { lastSeen: '2026-10-01T00:00:00Z' } };
    const snapshot = buildSnapshot({
      data,
      rates: new TransferRates(),
      ratesLive: false,
      connection: { state: 'online' },
      overdueHours: 24,
      now: new Date('2026-10-09T00:00:00Z'),
    });
    expect(snapshot.summary).toMatchObject({
      state: 'syncing',
      needBytes: 250,
      foldersBehind: 1,
      peersOnline: 0,
      peersTotal: 1,
    });
    expect(snapshot.folders[0]?.completionPercent).toBe(75);
    expect(snapshot.peers[0]?.overdue).toBe(true);
    expect(snapshot.attention.map((item) => item.kind)).toEqual(['device_overdue']);
  });
});
