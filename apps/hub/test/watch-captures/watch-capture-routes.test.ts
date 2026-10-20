import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bootServer,
  linkFakeProvider,
  pairPhone,
  verifiedPublicUrl,
  type Booted,
} from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path);
  await linkFakeProvider(booted);
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

const RAW = Buffer.from([0x38, 0x85, 0xc8, 0x6a, 0x1c, 0x06, 0x21, 0x00, 0xdf, 0xff, 0xfc]);

async function firstDevice(): Promise<string> {
  const reply = await call(booted.base, booted.owner, {
    method: 'GET',
    path: '/api/devices',
  });
  const first = API_ENDPOINTS.listDevices.response.parse(reply.body)[0];
  if (first === undefined) throw new Error('The fake provider discovered no device.');
  return first.id;
}

function upload(deviceId: string, bytes: Buffer = RAW): unknown {
  return {
    deviceId,
    files: [
      {
        fileId: '3885c86a1c0621',
        family: 'xiaomi',
        type: 0,
        subtype: 8,
        detail: 1,
        version: 6,
        watchTime: '2026-10-09T06:10:00Z',
        outcome: 'stages_undecoded',
        note: null,
        bytes: bytes.toString('base64'),
      },
    ],
  };
}

function save(token: string, body: unknown): Promise<{ status: number; body: unknown }> {
  return call(booted.base, token, {
    method: 'POST',
    path: '/api/developer/watch-captures',
    body,
  });
}

function developer(token: string, on: boolean): Promise<{ status: number; body: unknown }> {
  return call(booted.base, token, {
    method: 'PUT',
    path: '/api/developer/device',
    body: { developer: on },
  });
}

describe('raw watch captures for developer devices', () => {
  it('refuses an owner device that is not a developer device and a member device', async () => {
    const deviceId = await firstDevice();
    await verifiedPublicUrl(booted);
    const member = await pairPhone(booted, 'member');
    expect((await save(booted.owner, upload(deviceId))).status).toBe(403);
    expect((await developer(member.token, true)).status).toBe(403);
    expect((await save(member.token, upload(deviceId))).status).toBe(403);
    const listing = await call(booted.base, member.token, {
      method: 'GET',
      path: '/api/developer/watch-captures',
    });
    expect(listing.status).toBe(403);
    const clearing = await call(booted.base, booted.owner, {
      method: 'DELETE',
      path: '/api/developer/watch-captures',
    });
    expect(clearing.status).toBe(403);
  });

  it('keeps each file once by content, reports the size and clears on request', async () => {
    const deviceId = await firstDevice();
    expect((await developer(booted.owner, true)).body).toStrictEqual({ developer: true });
    const first = API_ENDPOINTS.saveWatchCaptures.response.parse(
      (await save(booted.owner, upload(deviceId))).body,
    );
    const again = API_ENDPOINTS.saveWatchCaptures.response.parse(
      (await save(booted.owner, upload(deviceId))).body,
    );
    expect(first.stored).toHaveLength(1);
    expect(again).toStrictEqual({ stored: [], duplicates: first.stored });
    const root = join(directory.path, 'watch-captures');
    const sha = first.stored[0] ?? '';
    expect(await readFile(join(root, `${sha}.bin`))).toStrictEqual(RAW);
    expect((await stat(join(root, `${sha}.bin`))).mode & 0o777).toBe(0o600);
    const summary = API_ENDPOINTS.readWatchCaptures.response.parse(
      (
        await call(booted.base, booted.owner, {
          method: 'GET',
          path: '/api/developer/watch-captures',
        })
      ).body,
    );
    expect(summary).toMatchObject({ files: 1, bytes: RAW.length });
    expect(summary.entries[0]).toMatchObject({
      version: 6,
      subtype: 8,
      outcome: 'stages_undecoded',
    });
    await call(booted.base, booted.owner, {
      method: 'DELETE',
      path: '/api/developer/watch-captures',
    });
    await expect(readdir(root)).rejects.toThrow();
    expect((await developer(booted.owner, false)).body).toStrictEqual({ developer: false });
    expect((await save(booted.owner, upload(deviceId))).status).toBe(403);
  });
});
