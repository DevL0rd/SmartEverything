import { describe, expect, it } from 'vitest';
import { runSyncthingCommand } from '../../../src/plugins/builtin/syncthing/controls';
import {
  SyncthingKeyRejectedError,
  SyncthingRest,
} from '../../../src/plugins/builtin/syncthing/rest-client';
import { fakeHttp } from '../fake-http';
import { NEW_ID, PEER_ID } from './fake-syncthing';

describe('syncthing controls', () => {
  it('pauses a folder, a device and everything with the right calls', async () => {
    const { fetcher, calls } = fakeHttp({
      'PATCH /rest/config/folders/docs': null,
      [`PATCH /rest/config/devices/${PEER_ID}`]: null,
      'POST /rest/system/pause': null,
    });
    const rest = new SyncthingRest('http://st', 'key', fetcher);
    await runSyncthingCommand(rest, {
      command: 'set_paused',
      target: { kind: 'folder', id: 'docs' },
      paused: true,
    });
    await runSyncthingCommand(rest, {
      command: 'set_paused',
      target: { kind: 'device', id: PEER_ID },
      paused: true,
    });
    await runSyncthingCommand(rest, {
      command: 'set_paused',
      target: { kind: 'all' },
      paused: true,
    });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'PATCH /rest/config/folders/docs',
      `PATCH /rest/config/devices/${PEER_ID}`,
      'POST /rest/system/pause',
    ]);
    expect(calls[0]?.body).toEqual({ paused: true });
  });

  it('accepts an offered folder under the default location, shared with the offering device', async () => {
    const { fetcher, calls } = fakeHttp({
      'GET /rest/cluster/pending/folders': {
        photos: {
          offeredBy: {
            [PEER_ID]: { time: '2026-10-09T10:00:00Z', label: 'Photos', receiveEncrypted: false },
          },
        },
      },
      'GET /rest/config/defaults/folder': { path: '/home/me/', rescanIntervalS: 3600 },
      'POST /rest/config/folders': null,
    });
    const done = await runSyncthingCommand(new SyncthingRest('http://st', 'key', fetcher), {
      command: 'accept_folder',
      folderId: 'photos',
      path: null,
    });
    expect(done).toBe('Added Photos at /home/me/Photos');
    expect(calls.at(-1)?.body).toMatchObject({
      id: 'photos',
      label: 'Photos',
      path: '/home/me/Photos',
      type: 'sendreceive',
      rescanIntervalS: 3600,
      devices: [{ deviceID: PEER_ID }],
    });
  });

  it('ignores a pending device by adding it to the ignored list', async () => {
    const { fetcher, calls } = fakeHttp({
      'GET /rest/cluster/pending/devices': {
        [NEW_ID]: { time: '2026-10-09T10:00:00Z', name: 'Tablet', address: '10.0.0.9' },
      },
      'GET /rest/config/remoteIgnoredDevices': [],
      'PUT /rest/config/remoteIgnoredDevices': null,
    });
    await runSyncthingCommand(new SyncthingRest('http://st', 'key', fetcher), {
      command: 'ignore_device',
      deviceId: NEW_ID,
    });
    expect(calls.at(-1)?.body).toMatchObject([{ deviceID: NEW_ID, name: 'Tablet' }]);
  });

  it('refuses a folder that is no longer offered and reports a rejected key', async () => {
    const { fetcher } = fakeHttp({ 'GET /rest/cluster/pending/folders': {} });
    const rest = new SyncthingRest('http://st', 'key', fetcher);
    await expect(
      runSyncthingCommand(rest, { command: 'ignore_folder', folderId: 'x' }),
    ).rejects.toThrow('no longer offered');
    const rejected = new SyncthingRest('http://st', 'bad', () =>
      Promise.resolve(new Response('', { status: 403 })),
    );
    await expect(
      runSyncthingCommand(rejected, { command: 'rescan', folderId: null }),
    ).rejects.toBeInstanceOf(SyncthingKeyRejectedError);
  });
});
