import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  MACHINE_UPDATE_MANIFEST,
  MACHINE_UPDATE_NOTICE,
  type MachineUpdateArtifact,
  type MachineUpdateManifest,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startMachineUpdateHub, type MachineUpdateHub } from '../support/machine-update-hub';

const QUERY = { product: 'desktop-computer', platform: 'linux', arch: 'x64' } as const;

let hub: MachineUpdateHub;

beforeEach(async () => {
  hub = await startMachineUpdateHub({ tls: false });
});

afterEach(async () => {
  await hub.close();
});

function artifactOf(file: string, bytes: Buffer): MachineUpdateArtifact {
  return {
    platform: 'linux',
    arch: 'x64',
    kind: 'zip',
    file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
  };
}

function manifestOf(
  version: string,
  artifacts: readonly MachineUpdateArtifact[],
): MachineUpdateManifest {
  return MACHINE_UPDATE_MANIFEST.parse({ version, artifacts, notes: `Release ${version}.` });
}

function send(
  method: string,
  path: string,
  options: { readonly token?: string; readonly json?: unknown; readonly bytes?: Buffer } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.token !== undefined) headers['authorization'] = `Bearer ${options.token}`;
  if (options.json !== undefined) headers['content-type'] = 'application/json';
  return fetch(new URL(path, hub.url), {
    method,
    headers,
    ...(options.json === undefined ? {} : { body: JSON.stringify(options.json) }),
    ...(options.bytes === undefined ? {} : { body: new Uint8Array(options.bytes) }),
  });
}

async function upload(
  file: string,
  bytes: Buffer,
  token = hub.tokenFor('owner'),
): Promise<Response> {
  return send('PUT', `/api/machine-update/files/${file}`, { token, bytes });
}

async function publish(
  manifest: MachineUpdateManifest,
  runtimeVersion?: string,
): Promise<Response> {
  return send('POST', '/api/machine-update', {
    token: hub.tokenFor('owner'),
    json: { manifest, ...(runtimeVersion === undefined ? {} : { runtimeVersion }) },
  });
}

async function release(version: string): Promise<MachineUpdateManifest> {
  const bytes = Buffer.from(`zip bytes of ${version}`);
  const file = `desktop-${version}.zip`;
  expect((await upload(file, bytes)).status).toBe(200);
  const manifest = manifestOf(version, [artifactOf(file, bytes)]);
  expect((await publish(manifest)).status).toBe(200);
  return manifest;
}

async function offered(): Promise<string | undefined> {
  return (await hub.updates.offer(QUERY))?.version;
}

describe('publishing a desktop release to the hub', () => {
  it('refuses callers that are not the owner and callers without a token', async () => {
    const bytes = Buffer.from('zip');
    expect((await upload('a.zip', bytes, hub.tokenFor('member'))).status).toBe(403);
    expect((await send('PUT', '/api/machine-update/files/a.zip', { bytes })).status).toBe(401);
    const manifest = manifestOf('0.4.2', [artifactOf('a.zip', bytes)]);
    const asMember = await send('POST', '/api/machine-update', {
      token: hub.tokenFor('member'),
      json: { manifest },
    });
    expect(asMember.status).toBe(403);
    expect(
      (await send('POST', '/api/machine-update/rollback', { token: hub.tokenFor('member') }))
        .status,
    ).toBe(403);
    expect(
      (await send('DELETE', '/api/machine-update', { token: hub.tokenFor('member') })).status,
    ).toBe(403);
    expect(await offered()).toBeUndefined();
  });

  it('streams a file into staging and answers with its sha256 and size', async () => {
    const bytes = Buffer.from('some installer bytes');
    const reply = await upload('desktop-0.4.2.zip', bytes);
    expect(await reply.json()).toStrictEqual({
      file: 'desktop-0.4.2.zip',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length,
    });
    expect(await readdir(`${hub.layout.system.updates.machineUpdates}.next`)).toStrictEqual([
      'desktop-0.4.2.zip',
    ]);
  });

  it.each(['manifest.json', 'notice.json', '..%2Fescape.zip'])(
    'refuses the file name %s',
    async (name) => {
      expect((await upload(name, Buffer.from('x'))).status).toBe(400);
    },
  );

  it('refuses an empty file', async () => {
    expect((await upload('empty.zip', Buffer.alloc(0))).status).toBe(400);
  });

  it('offers the published release and keeps the earlier one as the previous release', async () => {
    await release('0.4.1');
    const manifest = await release('0.4.2');
    expect(await offered()).toBe('0.4.2');
    const stored = join(hub.layout.system.updates.machineUpdates, 'manifest.json');
    expect(MACHINE_UPDATE_MANIFEST.parse(JSON.parse(await readFile(stored, 'utf8')))).toStrictEqual(
      manifest,
    );
    expect(await readdir(hub.layout.system.updates.machineUpdatesPrevious)).toContain(
      'desktop-0.4.1.zip',
    );
  });

  it('refuses a file whose sha256 differs from the manifest and keeps the active release', async () => {
    await release('0.4.1');
    const bytes = Buffer.from('uploaded bytes');
    await upload('desktop-0.4.2.zip', bytes);
    const claimed = artifactOf('desktop-0.4.2.zip', Buffer.from('uploaded bytez'));
    const reply = await publish(manifestOf('0.4.2', [claimed]));
    expect(reply.status).toBe(400);
    expect(JSON.stringify(await reply.json())).toContain('sha256');
    expect(await offered()).toBe('0.4.1');
  });

  it('refuses a file whose size differs from the manifest and a file that was not uploaded', async () => {
    await release('0.4.1');
    await upload('desktop-0.4.2.zip', Buffer.from('uploaded'));
    const wrongSize = { ...artifactOf('desktop-0.4.2.zip', Buffer.from('uploaded')), size: 3 };
    expect((await publish(manifestOf('0.4.2', [wrongSize]))).status).toBe(400);
    const missing = artifactOf('never.zip', Buffer.from('never'));
    expect((await publish(manifestOf('0.4.2', [missing]))).status).toBe(400);
    expect(await offered()).toBe('0.4.1');
  });

  it('drops staged files the manifest does not name', async () => {
    await upload('stray.zip', Buffer.from('stray'));
    await release('0.4.2');
    expect((await readdir(hub.layout.system.updates.machineUpdates)).sort()).toStrictEqual([
      'desktop-0.4.2.zip',
      'manifest.json',
    ]);
  });

  it('writes the Web runtime notice when one is given', async () => {
    const bytes = Buffer.from('zip');
    await upload('desktop-0.4.2.zip', bytes);
    const runtimeVersion = '9724ce88e713205c662d9dfd3284b029';
    expect(
      (await publish(manifestOf('0.4.2', [artifactOf('desktop-0.4.2.zip', bytes)]), runtimeVersion))
        .status,
    ).toBe(200);
    const notice = MACHINE_UPDATE_NOTICE.parse(
      JSON.parse(
        await readFile(join(hub.layout.system.updates.machineUpdates, 'notice.json'), 'utf8'),
      ),
    );
    expect(notice).toMatchObject({ version: '0.4.2', runtimeVersion });
  });
});

describe('rolling back and withdrawing a desktop release', () => {
  it('swaps the active and previous releases on each rollback', async () => {
    await release('0.4.1');
    await release('0.4.2');
    const back = await send('POST', '/api/machine-update/rollback', {
      token: hub.tokenFor('owner'),
    });
    expect(back.status).toBe(200);
    expect(MACHINE_UPDATE_MANIFEST.parse(await back.json()).version).toBe('0.4.1');
    expect(await offered()).toBe('0.4.1');
    expect(await readdir(hub.layout.system.updates.machineUpdatesPrevious)).toContain(
      'desktop-0.4.2.zip',
    );
    await send('POST', '/api/machine-update/rollback', { token: hub.tokenFor('owner') });
    expect(await offered()).toBe('0.4.2');
  });

  it('refuses a rollback while no previous release is stored', async () => {
    await release('0.4.1');
    const reply = await send('POST', '/api/machine-update/rollback', {
      token: hub.tokenFor('owner'),
    });
    expect(reply.status).toBe(404);
    expect(await offered()).toBe('0.4.1');
  });

  it('hides the offer on withdrawal and lets a rollback bring the previous release back', async () => {
    await release('0.4.1');
    await release('0.4.2');
    const reply = await send('DELETE', '/api/machine-update', { token: hub.tokenFor('owner') });
    expect(await reply.json()).toStrictEqual({ ok: true });
    expect(await offered()).toBeUndefined();
    await send('POST', '/api/machine-update/rollback', { token: hub.tokenFor('owner') });
    expect(await offered()).toBe('0.4.1');
  });
});
