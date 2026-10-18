import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HomeFiles } from '../../src/node/controls/home-files';
import { pairPhone, verifiedPublicUrl } from '../support/booted';
import { stubControls, useComputerHub, type Paired } from '../support/paired-computer';
import { call } from '../support/server';
import { until } from '../support/wait';

const CHUNK = 4 * 1024 * 1024;
const BIG_BYTES = 50 * 1024 * 1024;

const hub = useComputerHub();
let area: string;
let paired: Paired;
let big: Buffer;

function download(token: string, path: string, range?: string): Promise<Response> {
  const query = new URLSearchParams({ path });
  return fetch(
    `${hub.booted().base}/api/computers/${paired.deviceId}/download?${query.toString()}`,
    {
      headers: { authorization: `Bearer ${token}`, ...(range === undefined ? {} : { range }) },
    },
  );
}

function folder(token: string, path: string, cursor = 0): ReturnType<typeof call> {
  const query = new URLSearchParams({ path, cursor: String(cursor) });
  return call(hub.booted().base, token, {
    method: 'GET',
    path: `/api/computers/${paired.deviceId}/files?${query.toString()}`,
  });
}

beforeEach(async () => {
  area = await mkdtemp(join(tmpdir(), 'computer-area-'));
  big = Buffer.alloc(BIG_BYTES);
  for (let index = 0; index < big.length; index += 1) big[index] = index % 251;
  await writeFile(join(area, 'movie.bin'), big);
  await writeFile(join(area, 'note.txt'), 'hello');
  await mkdir(join(area, 'many'));
  await Promise.all(
    Array.from({ length: 1200 }, (_, index) =>
      writeFile(join(area, 'many', `item-${String(index).padStart(4, '0')}`), ''),
    ),
  );
  paired = await hub.pair();
  hub.run(paired, stubControls({ files: new HomeFiles(join(area, 'home')) }));
  await until(async () => (await folder(hub.booted().owner, area)).status === 200, 'the computer');
});

afterEach(async () => {
  await rm(area, { recursive: true, force: true });
});

describe('computer files outside the home folder', () => {
  it('lets the owner list and read a path outside the home and refuses another person', async () => {
    const base = hub.booted().base;
    const owner = hub.booted().owner;
    const listed = await folder(owner, area);
    expect(listed.status).toBe(200);
    const read = await call(base, owner, {
      method: 'GET',
      path: `/api/computers/${paired.deviceId}/file?${new URLSearchParams({ path: join(area, 'note.txt') }).toString()}`,
    });
    expect(API_ENDPOINTS.readComputerFile.response.parse(read.body).content).toBe('hello');
    await verifiedPublicUrl(hub.booted());
    const member = (await pairPhone(hub.booted(), 'member')).token;
    expect((await folder(member, area)).status).toBe(404);
    expect((await download(member, join(area, 'note.txt'))).status).toBe(404);
    expect((await download('not-a-token', join(area, 'note.txt'))).status).toBe(401);
  });

  it('pages a 1,200-entry folder through the endpoint by cursor', async () => {
    const owner = hub.booted().owner;
    const seen: string[] = [];
    for (let cursor: number | null = 0; cursor !== null;) {
      const reply = await folder(owner, join(area, 'many'), cursor);
      const page = API_ENDPOINTS.listComputerFiles.response.parse(reply.body);
      seen.push(...page.entries.map((entry) => entry.name));
      cursor = page.next;
    }
    expect(seen).toHaveLength(1200);
    expect(new Set(seen).size).toBe(1200);
  });
});

describe('computer file download', () => {
  it('streams a 50 MB file whole', async () => {
    const reply = await download(hub.booted().owner, join(area, 'movie.bin'));
    expect(reply.status).toBe(200);
    expect(reply.headers.get('accept-ranges')).toBe('bytes');
    expect(reply.headers.get('content-length')).toBe(String(BIG_BYTES));
    expect(reply.headers.get('content-disposition')).toContain("filename*=UTF-8''movie.bin");
    const body = Buffer.from(await reply.arrayBuffer());
    expect(createHash('sha256').update(body).digest('hex')).toBe(
      createHash('sha256').update(big).digest('hex'),
    );
  });

  it('answers a Range request, also across a chunk boundary', async () => {
    const owner = hub.booted().owner;
    const inside = await download(owner, join(area, 'movie.bin'), 'bytes=1000-1099');
    expect(inside.status).toBe(206);
    expect(inside.headers.get('content-range')).toBe(`bytes 1000-1099/${String(BIG_BYTES)}`);
    expect(Buffer.from(await inside.arrayBuffer()).equals(big.subarray(1000, 1100))).toBe(true);
    const across = await download(
      owner,
      join(area, 'movie.bin'),
      `bytes=${String(CHUNK - 5)}-${String(CHUNK + 4)}`,
    );
    expect(across.status).toBe(206);
    expect(Buffer.from(await across.arrayBuffer()).equals(big.subarray(CHUNK - 5, CHUNK + 5))).toBe(
      true,
    );
    const tail = await download(owner, join(area, 'movie.bin'), 'bytes=-10');
    expect(Buffer.from(await tail.arrayBuffer()).equals(big.subarray(BIG_BYTES - 10))).toBe(true);
    const beyond = await download(owner, join(area, 'movie.bin'), `bytes=${String(BIG_BYTES)}-`);
    expect(beyond.status).toBe(416);
  });

  it('refuses a folder, a missing file and a computer whose file permission is off', async () => {
    const owner = hub.booted().owner;
    expect((await download(owner, area)).status).toBe(409);
    expect((await download(owner, join(area, 'absent'))).status).toBe(404);
    await call(hub.booted().base, owner, {
      method: 'PATCH',
      path: `/api/computers/${paired.deviceId}/scopes`,
      body: { files: false },
    });
    expect((await download(owner, join(area, 'note.txt'))).status).toBe(403);
  });
});

describe('computer links on demand', () => {
  it('are no longer part of the computer reading and have their own endpoint', async () => {
    const base = hub.booted().base;
    const owner = hub.booted().owner;
    const detail = await call(base, owner, {
      method: 'GET',
      path: `/api/computers/${paired.deviceId}`,
    });
    expect(Object.keys(API_ENDPOINTS.readComputer.response.parse(detail.body))).not.toContain(
      'links',
    );
    const links = await call(base, owner, {
      method: 'GET',
      path: `/api/computers/${paired.deviceId}/links`,
    });
    expect(links).toEqual({ status: 200, body: [] });
  });
});
