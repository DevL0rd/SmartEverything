import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  type WriteStream,
} from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  API_ENDPOINTS as E,
  API_ERROR,
  ApiError,
  MEDIA_LINK,
  matchPath,
  type LiveChange,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScanReach } from '../../src/home-map/scan-reach';
import { ScanStore } from '../../src/home-map/scan-store';
import { HomeMapService } from '../../src/home-map/service';
import { apiErrorFor } from '../../src/server/errors';
import {
  followScans,
  homeMapScanRoutes,
  type HomeMapScanServices,
} from '../../src/server/handlers/home-map-scan';
import { sendError } from '../../src/server/http';
import { MediaLinks } from '../../src/server/media-links';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { HomeMapsRepository } from '../../src/store/repositories/home-maps';
import { Sql } from '../../src/store/sql';
import { NOW } from '../home-map/import-fixtures';
import { plyFile, spzFile, splatFile } from '../home-map/scan-fixtures';
import { captureLogs, testLogger } from '../support/logs';

interface Rig {
  readonly root: string;
  readonly server: Server;
  readonly base: string;
  readonly service: HomeMapService;
  readonly mapId: string;
  readonly handled: Promise<void>;
  readonly disk: { free: number };
  readonly changes: readonly LiveChange[];
  readonly follow: (change: LiveChange) => void;
  readonly clock: { now: number };
  readonly access: { member: boolean };
}

let rig: Rig;

const sha = (file: Buffer): string => createHash('sha256').update(file).digest('hex');

const folder = (): string => join(rig.root, Buffer.from(rig.mapId).toString('base64url'));

const stored = (): string[] => (existsSync(folder()) ? readdirSync(folder()).sort() : []);

const temporary = (): string[] =>
  existsSync(join(rig.root, 'tmp')) ? readdirSync(join(rig.root, 'tmp')) : [];

function serve(services: HomeMapScanServices, handled: () => void): Server {
  const routes = homeMapScanRoutes(services);
  return createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://server').pathname;
    const found = routes
      .filter((candidate) => candidate.method === request.method)
      .map((candidate) => ({ candidate, params: matchPath(candidate.path, pathname) }))
      .find((entry) => entry.params !== null);
    const run =
      found?.params === null || found === undefined
        ? Promise.reject(new ApiError('not_found', 'x'))
        : found.candidate.handle(request, response, found.params);
    run
      .catch((cause: unknown) => {
        sendError(response, apiErrorFor(cause) ?? new ApiError('internal', String(cause)));
      })
      .finally(handled);
  });
}

function publishingService(onChange: (change: LiveChange) => void): HomeMapService {
  const sql = new Sql(new DatabaseSync(':memory:', { enableForeignKeyConstraints: true }));
  migrate(sql, MIGRATIONS, NOW, testLogger());
  const context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => new Date(NOW));
  let seq = 0;
  return new HomeMapService({
    maps: new HomeMapsRepository(context, (operation, summary, previous) => {
      onChange({
        type: 'change',
        table: 'home_maps',
        operation,
        record: summary,
        oldRecord: previous,
        seq: (seq += 1),
      });
    }),
    knownModel: () => true,
    log: testLogger('home-map'),
  });
}

async function startRig(): Promise<Rig> {
  const root = mkdtempSync(join(tmpdir(), 'scan-http-'));
  const followed: { current: (change: LiveChange) => void } = { current: () => undefined };
  const changes: LiveChange[] = [];
  const service = publishingService((change) => {
    changes.push(change);
    followed.current(change);
  });
  let handled = (): void => undefined;
  const settled = new Promise<void>((resolve) => {
    handled = resolve;
  });
  const disk = { free: Number.MAX_SAFE_INTEGER };
  const clock = { now: Date.parse(NOW) };
  const access = { member: true };
  let next = 0;
  const scans = new ScanStore({
    root,
    freeBytes: (): Promise<number> => Promise.resolve(disk.free),
    openWrite: (path): WriteStream => createWriteStream(path, { flags: 'wx' }),
    newId: (): string => `up-${String((next += 1))}`,
    log: testLogger('scan'),
  });
  const services: HomeMapScanServices = {
    authorize: () => {
      if (!access.member) throw new ApiError('unauthorized', 'Sign in as a member.');
      return { kind: 'anonymous' };
    },
    actorOf: () => 'profile:tester',
    scans,
    reach: new ScanReach(
      (mapId, after) => service.revisions({ mapId, after }),
      testLogger('reach'),
    ),
    maps: service,
    links: new MediaLinks(() => new Date(clock.now)),
    now: () => '2026-10-25T10:00:00.000Z',
    log: testLogger('scan-handler'),
  };
  followed.current = (change): void => {
    followScans(services, change);
  };
  const server = serve(services, handled);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('the test server has no port');
  }
  return {
    root,
    server,
    base: `http://127.0.0.1:${String(address.port)}`,
    service,
    mapId: service.get().id,
    handled: settled,
    disk,
    changes,
    follow: (change): void => {
      followed.current(change);
    },
    clock,
    access,
  };
}

beforeEach(async () => {
  captureLogs();
  rig = await startRig();
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    rig.server.close(() => {
      resolve();
    });
  });
  rmSync(rig.root, { recursive: true, force: true });
});

const scanUrl = (suffix = '', query = ''): string =>
  `${rig.base}/api/home-maps/${rig.mapId}/scan${suffix}${query}`;

const put = (file: Buffer, format: string, name = 'living-room'): Promise<Response> =>
  fetch(scanUrl('', `?format=${format}&name=${name}`), { method: 'PUT', body: file });

const linkOf = async (hash: string, mapId = rig.mapId): Promise<string> => {
  const response = await fetch(`${rig.base}/api/home-maps/${mapId}/scan/link?hash=${hash}`);
  return `${rig.base}${MEDIA_LINK.parse(await response.json()).url}`;
};

const fileUrl = async (): Promise<string> => linkOf(rig.service.get().scan?.file.hash ?? '');

const errorOf = async (response: Response): Promise<{ code: string; message: string }> =>
  API_ERROR.parse(await response.json()).error;

describe('uploading a scan', () => {
  it('stores the file, updates the map in one revision and answers the stored scan', async () => {
    const before = rig.service.get().revision;
    const file = plyFile(200);
    const answer = E.uploadHomeMapScan.response.parse(await (await put(file, 'ply')).json());
    expect(answer.revision).toBe(before + 1);
    expect(answer.scan.file).toEqual({
      hash: sha(file),
      format: 'ply',
      bytes: file.length,
      name: 'living-room',
    });
    expect(answer.scan).toMatchObject({ lod: null, opacity: 1, uploadedBy: 'profile:tester' });
    expect(rig.service.get().scan).toEqual(answer.scan);
    expect(stored()).toEqual([`${sha(file)}.ply`]);
    expect(temporary()).toEqual([]);
  });

  it('serves the file whole, by range and as not modified', async () => {
    const file = splatFile(100);
    await put(file, 'splat');
    const url = await fileUrl();
    const whole = await fetch(url);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('accept-ranges')).toBe('bytes');
    expect(whole.headers.get('etag')).toBe(`"${sha(file)}"`);
    expect(Buffer.from(await whole.arrayBuffer()).equals(file)).toBe(true);
    const part = await fetch(url, { headers: { range: 'bytes=64-127' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe(`bytes 64-127/${String(file.length)}`);
    expect(Buffer.from(await part.arrayBuffer()).equals(file.subarray(64, 128))).toBe(true);
    const tail = await fetch(url, { headers: { range: 'bytes=3100-' } });
    expect(Buffer.from(await tail.arrayBuffer()).equals(file.subarray(3100))).toBe(true);
    expect((await fetch(url, { headers: { range: 'bytes=99999-' } })).status).toBe(416);
    const again = await fetch(url, { headers: { 'if-none-match': `"${sha(file)}"` } });
    expect(again.status).toBe(304);
  });

  it('replaces the scan, pointing the map to the new file and keeping the old one for undo', async () => {
    const first = splatFile(10);
    const second = spzFile(30);
    await put(first, 'splat');
    expect(stored()).toEqual([`${sha(first)}.splat`]);
    await put(second, 'spz');
    expect(rig.service.get().scan?.file.hash).toBe(sha(second));
    expect(stored()).toEqual([`${sha(first)}.splat`, `${sha(second)}.spz`].sort());
  });

  it('refuses truncated, wrong-magic and rad files with 400, keeping the map and the old file', async () => {
    const good = splatFile(10);
    await put(good, 'splat');
    const revision = rig.service.get().revision;
    const ply = plyFile(100);
    expect((await put(ply.subarray(0, ply.length - 100), 'ply')).status).toBe(400);
    expect((await put(splatFile(3), 'ply')).status).toBe(400);
    expect((await put(Buffer.from('RAD0xxxx'), 'rad')).status).toBe(400);
    expect(rig.service.get().revision).toBe(revision);
    expect(stored()).toEqual([`${sha(good)}.splat`]);
    expect(temporary()).toEqual([]);
  });

  it('refuses a full disk with 507 before streaming', async () => {
    rig.disk.free = 100;
    const response = await put(splatFile(10), 'splat');
    expect(response.status).toBe(507);
    expect(await errorOf(response)).toMatchObject({
      code: 'payload_too_large',
      message: 'Not enough space on the hub',
    });
    expect(rig.service.get().scan).toBeUndefined();
    expect(temporary()).toEqual([]);
  });

  it('refuses an upload without a declared length and a map that does not exist', async () => {
    const chunkedStatus = await new Promise<number>((resolve, reject) => {
      const call = httpRequest(
        scanUrl('', '?format=splat&name=x'),
        { method: 'PUT', headers: { 'transfer-encoding': 'chunked' } },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      call.on('error', reject);
      call.end(splatFile(2));
    });
    expect(chunkedStatus).toBe(400);
    const missing = await fetch(`${rig.base}/api/home-maps/no-such-map/scan?format=splat&name=x`, {
      method: 'PUT',
      body: splatFile(2),
    });
    expect(missing.status).toBe(404);
    expect(rig.service.get().scan).toBeUndefined();
  });

  it('deletes the temp file of a cancelled upload and never touches the map', async () => {
    const file = splatFile(2000);
    const call = httpRequest(scanUrl('', '?format=splat&name=x'), {
      method: 'PUT',
      headers: { 'content-length': String(file.length) },
    });
    call.on('error', () => undefined);
    call.write(file.subarray(0, 10_000), () => {
      call.destroy();
    });
    await rig.handled;
    expect(rig.service.get().scan).toBeUndefined();
    expect(temporary()).toEqual([]);
  });
});

describe('the scan files and the undo history', () => {
  it('serves the old file again after a replaced upload is undone', async () => {
    const first = splatFile(10);
    const second = spzFile(30);
    await put(first, 'splat');
    await put(second, 'spz');
    expect(stored()).toEqual([`${sha(first)}.splat`, `${sha(second)}.spz`].sort());
    rig.service.undo('profile:tester');
    expect(rig.service.get().scan?.file.hash).toBe(sha(first));
    const served = await fetch(await fileUrl());
    expect(served.status).toBe(200);
    expect(Buffer.from(await served.arrayBuffer()).equals(first)).toBe(true);
    rig.service.redo('profile:tester');
    const again = await fetch(await fileUrl());
    expect(Buffer.from(await again.arrayBuffer()).equals(second)).toBe(true);
  });

  it('serves the file again after a removal is undone', async () => {
    const file = splatFile(10);
    await put(file, 'splat');
    await fetch(scanUrl(), { method: 'DELETE' });
    rig.service.undo('profile:tester');
    expect(rig.service.get().scan?.file.hash).toBe(sha(file));
    const served = await fetch(await fileUrl());
    expect(served.status).toBe(200);
    expect(Buffer.from(await served.arrayBuffer()).equals(file)).toBe(true);
  });

  it('keeps the files of a scan removed through the generic edit path until undone', async () => {
    const file = splatFile(10);
    await put(file, 'splat');
    rig.service.edit(
      { baseRevision: rig.service.revision(), ops: [{ op: 'removeScan' }] },
      'profile:tester',
    );
    expect(stored()).toEqual([`${sha(file)}.splat`]);
    rig.service.undo('profile:tester');
    expect((await fetch(await fileUrl())).status).toBe(200);
  });

  it('frees a replaced file once a new edit clears the redo that could bring it back', async () => {
    const first = splatFile(10);
    const second = spzFile(30);
    await put(first, 'splat');
    await put(second, 'spz');
    rig.service.undo('profile:tester');
    expect(stored()).toHaveLength(2);
    rig.service.edit(
      { baseRevision: rig.service.revision(), ops: [{ op: 'setMap', patch: { name: 'Home' } }] },
      'profile:tester',
    );
    expect(stored()).toEqual([`${sha(first)}.splat`]);
  });

  it('removes the folder of a deleted map', async () => {
    await put(splatFile(10), 'splat');
    const last = rig.changes.at(-1);
    if (last?.table !== 'home_maps' || last.record === null) throw new Error('no change');
    rig.follow({ ...last, operation: 'DELETE', record: null, oldRecord: last.record });
    expect(existsSync(folder())).toBe(false);
  });
});

describe('removing a scan', () => {
  it('clears the map in one revision and keeps the file while the removal can be undone', async () => {
    const file = splatFile(10);
    await put(file, 'splat');
    const revision = rig.service.get().revision;
    const response = await fetch(scanUrl(), { method: 'DELETE' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revision: revision + 1 });
    expect(rig.service.get().scan).toBeUndefined();
    expect(stored()).toEqual([`${sha(file)}.splat`]);
  });

  it('answers 404 when there is no scan to remove or to read', async () => {
    expect((await fetch(scanUrl(), { method: 'DELETE' })).status).toBe(404);
    const link = await fetch(`${scanUrl('/link')}?hash=${'a'.repeat(64)}`);
    expect(link.status).toBe(404);
  });

  it('answers 404 with a clear message when the file is gone from the disk', async () => {
    const file = splatFile(4);
    await put(file, 'splat');
    rmSync(join(folder(), `${sha(file)}.splat`));
    const response = await fetch(await fileUrl());
    expect(response.status).toBe(404);
    expect((await errorOf(response)).message).toContain('missing');
  });
});

describe('signed scan links', () => {
  const signedPath = async (file: Buffer): Promise<URL> => {
    await put(file, 'splat');
    return new URL(await linkOf(sha(file)));
  };

  it('serves the file by a link that expires with the time the hub gave it', async () => {
    const file = splatFile(10);
    const url = await signedPath(file);
    const served = await fetch(url);
    expect(served.status).toBe(200);
    expect(served.headers.get('cache-control')).toBe('private, max-age=600, immutable');
    expect(Buffer.from(await served.arrayBuffer()).equals(file)).toBe(true);
    rig.clock.now += 600_000;
    const expired = await fetch(url);
    expect(expired.status).toBe(410);
    expect((await errorOf(expired)).code).toBe('link_expired');
  });

  it('refuses an unsigned, a tampered and a moved link', async () => {
    const url = await signedPath(splatFile(10));
    const unsigned = new URL(url.pathname, rig.base);
    expect((await fetch(unsigned)).status).toBe(401);
    const tampered = new URL(url);
    tampered.searchParams.set('signature', 'b'.repeat(64));
    expect((await fetch(tampered)).status).toBe(401);
    const later = new URL(url);
    later.searchParams.set('expires', String(Number(url.searchParams.get('expires')) + 60));
    expect((await fetch(later)).status).toBe(401);
    const elsewhere = new URL(url);
    elsewhere.pathname = url.pathname.replace(`/home-maps/${rig.mapId}/`, '/home-maps/other-map/');
    expect((await fetch(elsewhere)).status).toBe(401);
  });

  it('stops serving a replaced scan and gives a new link for the new file', async () => {
    const first = splatFile(10);
    const old = await signedPath(first);
    const second = spzFile(30);
    await put(second, 'spz');
    const replaced = await fetch(old);
    expect(replaced.status).toBe(404);
    expect((await errorOf(replaced)).message).toContain('replaced');
    expect((await fetch(`${scanUrl('/link')}?hash=${sha(first)}`)).status).toBe(404);
    const fresh = new URL(await linkOf(sha(second)));
    expect(fresh.pathname).not.toBe(old.pathname);
    expect(fresh.pathname).toContain(sha(second));
    expect(Buffer.from(await (await fetch(fresh)).arrayBuffer()).equals(second)).toBe(true);
  });

  it('gives links only to members and never for a map that does not exist', async () => {
    const file = splatFile(10);
    await put(file, 'splat');
    rig.access.member = false;
    expect((await fetch(`${scanUrl('/link')}?hash=${sha(file)}`)).status).toBe(401);
    rig.access.member = true;
    const missing = await fetch(
      `${rig.base}/api/home-maps/no-such-map/scan/link?hash=${sha(file)}`,
    );
    expect(missing.status).toBe(404);
  });
});
