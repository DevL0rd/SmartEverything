import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API_ENDPOINTS, type ComputerDownload } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HomeFiles } from '../../src/node/controls/home-files';
import { linuxSystemControls } from '../../src/node/controls/linux/linux-system';
import type { SystemControls } from '../../src/node/controls/system-controls';
import { pairPhone, verifiedPublicUrl } from '../support/booted';
import { stubControls, useComputerHub, type Paired } from '../support/paired-computer';
import { testLogger } from '../support/logs';
import { call, type Reply } from '../support/server';
import { until } from '../support/wait';

const hub = useComputerHub();
let area: string;
let home: string;
let paired: Paired;
let closed: string[];
let big: Buffer;

function counting(real: SystemControls): SystemControls {
  return {
    ...real,
    files: {
      search: (query) => real.files.search(query),
      properties: (path) => real.files.properties(path),
      write: (change) => real.files.write(change),
      upload: (chunk) => real.files.upload(chunk),
      places: () => real.files.places(),
      openDownload: (paths) => real.files.openDownload(paths),
      readDownload: (id, length) => real.files.readDownload(id, length),
      closeDownload: (id): Promise<void> => {
        closed.push(id);
        return real.files.closeDownload(id);
      },
    },
  };
}

function prepare(token: string, paths: readonly string[]): Promise<Reply> {
  return call(hub.booted().base, token, {
    method: 'POST',
    path: `/api/computers/${paired.deviceId}/downloads`,
    body: { paths },
  });
}

async function prepared(token: string, paths: readonly string[]): Promise<ComputerDownload> {
  const reply = await prepare(token, paths);
  expect(reply.status).toBe(200);
  return API_ENDPOINTS.prepareComputerDownload.response.parse(reply.body);
}

function fetchLink(download: ComputerDownload, range?: string): Promise<Response> {
  return fetch(`${hub.booted().base}${download.url}`, {
    headers: range === undefined ? {} : { range },
  });
}

function sha(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

async function zipOf(response: Response): Promise<string> {
  const path = join(area, `got-${String(Date.now())}.zip`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  return path;
}

beforeEach(async () => {
  area = await mkdtemp(join(tmpdir(), 'computer-downloads-'));
  home = join(area, 'home');
  closed = [];
  big = randomBytes(10 * 1024 * 1024);
  await mkdir(join(home, 'proj', 'sub'), { recursive: true });
  await writeFile(join(home, 'proj', 'big.bin'), big);
  await writeFile(join(home, 'proj', 'sub', 'ünï ☕.txt'), 'unicode');
  await writeFile(join(home, 'proj', 'a.txt'), 'a');
  await symlink(join(home, 'proj', 'sub'), join(home, 'proj', 'dirlink'));
  await writeFile(join(home, 'note.txt'), 'hello');
  paired = await hub.pair();
  hub.run(
    paired,
    stubControls({
      files: new HomeFiles(home),
      system: counting(linuxSystemControls({ log: testLogger('node'), home })),
    }),
  );
  await until(
    async () =>
      (
        await call(hub.booted().base, hub.booted().owner, {
          method: 'GET',
          path: `/api/computers/${paired.deviceId}/files/places`,
        })
      ).status === 200,
    'the computer',
  );
});

afterEach(async () => {
  await rm(area, { recursive: true, force: true });
});

describe('download links', () => {
  it('give a file whole and by range, with its name and type', async () => {
    const owner = hub.booted().owner;
    const download = await prepared(owner, [join(home, 'proj', 'big.bin')]);
    expect(download).toMatchObject({ kind: 'file', name: 'big.bin', size: big.length });
    const whole = await fetchLink(download);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('content-disposition')).toContain('filename="big.bin"');
    expect(whole.headers.get('content-type')).toBe('application/octet-stream');
    expect(sha(Buffer.from(await whole.arrayBuffer()))).toBe(sha(big));
    const part = await fetchLink(download, 'bytes=4194300-4194310');
    expect(part.status).toBe(206);
    expect(Buffer.from(await part.arrayBuffer()).equals(big.subarray(4194300, 4194311))).toBe(true);
    const again = await fetchLink(download, 'bytes=0-9');
    expect(again.status).toBe(206);
  });

  it('give a folder as one zip that unzips to the same files', async () => {
    const download = await prepared(hub.booted().owner, [join(home, 'proj')]);
    expect(download).toMatchObject({
      kind: 'zip',
      name: 'proj.zip',
      size: null,
      files: 3,
      folders: 2,
    });
    expect(download.skipped.map((item) => item.path)).toEqual([join(home, 'proj', 'dirlink')]);
    const response = await fetchLink(download);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toContain("filename*=UTF-8''proj.zip");
    const zip = await zipOf(response);
    expect(spawnSync('unzip', ['-t', zip], { encoding: 'utf8' }).status).toBe(0);
    const listing = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).stdout.split('\n');
    expect(listing).toEqual(
      expect.arrayContaining([
        'proj/big.bin',
        'proj/sub/ünï ☕.txt',
        'proj/a.txt',
        'Not included.txt',
      ]),
    );
    const out = spawnSync('unzip', ['-p', zip, 'proj/big.bin'], { maxBuffer: 1 << 28 });
    expect(sha(out.stdout)).toBe(sha(big));
    expect(closed).toHaveLength(1);
  });

  it('give several chosen items as one zip', async () => {
    const download = await prepared(hub.booted().owner, [
      join(home, 'note.txt'),
      join(home, 'proj', 'a.txt'),
    ]);
    expect(download).toMatchObject({ kind: 'zip', name: 'Files.zip', files: 2 });
    const zip = await zipOf(await fetchLink(download));
    expect(
      spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).stdout.split('\n').sort(),
    ).toEqual(['', 'a.txt', 'note.txt']);
  });

  it('can be fetched once as a zip', async () => {
    const download = await prepared(hub.booted().owner, [join(home, 'proj', 'sub')]);
    expect((await fetchLink(download)).status).toBe(200);
    const second = await fetchLink(download);
    expect([404, 409]).toContain(second.status);
  });

  it('closes the open zip on the computer when the phone stops early', async () => {
    const download = await prepared(hub.booted().owner, [join(home, 'proj')]);
    const controller = new AbortController();
    const response = await fetch(`${hub.booted().base}${download.url}`, {
      signal: controller.signal,
    });
    const reader = response.body?.getReader();
    await reader?.read();
    controller.abort();
    await until(() => Promise.resolve(closed.length > 0), 'the computer to close the zip');
  });

  it('refuse a link that was changed, and a path that is not there', async () => {
    const download = await prepared(hub.booted().owner, [join(home, 'note.txt')]);
    const forged = await fetch(
      `${hub.booted().base}${download.url.replace(/signature=./, 'signature=0')}`,
    );
    expect(forged.status).toBe(401);
    const missing = await prepare(hub.booted().owner, [join(home, 'absent')]);
    expect(missing.status).toBe(404);
  });

  it('refuse when the files permission is off, also for a link already issued', async () => {
    const owner = hub.booted().owner;
    const download = await prepared(owner, [join(home, 'note.txt')]);
    await call(hub.booted().base, owner, {
      method: 'PATCH',
      path: `/api/computers/${paired.deviceId}/scopes`,
      body: { files: false },
    });
    expect((await prepare(owner, [join(home, 'note.txt')])).status).toBe(403);
    expect((await fetchLink(download)).status).toBe(403);
  });

  it('keep another person away from the computer', async () => {
    await verifiedPublicUrl(hub.booted());
    const member = (await pairPhone(hub.booted(), 'member')).token;
    expect((await prepare(member, [join(home, 'note.txt')])).status).toBe(404);
  });
});

describe('places', () => {
  it('start at the home folder and offer the top of the drive', async () => {
    const reply = await call(hub.booted().base, hub.booted().owner, {
      method: 'GET',
      path: `/api/computers/${paired.deviceId}/files/places`,
    });
    const places = API_ENDPOINTS.readComputerPlaces.response.parse(reply.body);
    expect(places.home).toBe(home);
    expect(places.places.slice(0, 1)).toEqual([{ label: 'Home', path: home, kind: 'home' }]);
    expect(places.places).toContainEqual({ label: 'Computer', path: '/', kind: 'root' });
  });
});
