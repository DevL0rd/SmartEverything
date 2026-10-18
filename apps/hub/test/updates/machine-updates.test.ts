import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ApiError,
  API_ENDPOINTS,
  MACHINE_UPDATE_FOLDER,
  MACHINE_UPDATE_MANIFEST_FILE,
  MACHINE_UPDATE_OFFER,
  matchPath,
  type MachineUpdateManifest,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MediaLinks } from '../../src/server/media-links';
import { MachineUpdates } from '../../src/updates/machine-updates';
import { ReleaseFolder, ReleaseFolderInvalidError } from '../../src/updates/release-folder';
import { machineUpdateRoute } from '../../src/updates/extension';

const NOW = new Date('2026-10-18T10:00:00Z');
const ZIP = Buffer.from('zip bytes of the linux app');
const NUPKG = Buffer.from('nupkg bytes');
const RELEASES = Buffer.from('ABC smarteverything-0.4.2-full.nupkg 11\n');

function sha(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const MANIFEST: MachineUpdateManifest = {
  version: '0.4.2',
  artifacts: [
    {
      platform: 'linux',
      arch: 'x64',
      kind: 'zip',
      file: 'SmartEverything-linux-x64-0.4.2.zip',
      sha256: sha(ZIP),
      size: ZIP.length,
    },
    {
      platform: 'win32',
      arch: 'x64',
      kind: 'nupkg',
      file: 'smarteverything-0.4.2-full.nupkg',
      sha256: sha(NUPKG),
      size: NUPKG.length,
    },
    {
      platform: 'win32',
      arch: 'x64',
      kind: 'releases',
      file: 'RELEASES',
      sha256: sha(RELEASES),
      size: RELEASES.length,
    },
  ],
};

let data = '';

async function release(manifest: unknown = MANIFEST): Promise<void> {
  const folder = join(data, MACHINE_UPDATE_FOLDER);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'SmartEverything-linux-x64-0.4.2.zip'), ZIP);
  await writeFile(join(folder, 'smarteverything-0.4.2-full.nupkg'), NUPKG);
  await writeFile(join(folder, 'RELEASES'), RELEASES);
  await writeFile(join(folder, MACHINE_UPDATE_MANIFEST_FILE), JSON.stringify(manifest));
}

function updates(): MachineUpdates {
  return new MachineUpdates(new ReleaseFolder(data), new MediaLinks(() => NOW));
}

beforeEach(async () => {
  data = await mkdtemp(join(tmpdir(), 'hub-machine-updates-'));
});

afterEach(async () => {
  await rm(data, { recursive: true, force: true });
});

describe('the release folder of the home', () => {
  it('offers nothing while no release was stored', async () => {
    expect(await updates().offer({ platform: 'linux', arch: 'x64' })).toBeNull();
  });

  it('offers the files of the asked platform with signed links', async () => {
    await release();
    const offer = await updates().offer({ platform: 'win32', arch: 'x64' });
    expect(
      MACHINE_UPDATE_OFFER.parse(offer).artifacts.map((artifact) => artifact.kind),
    ).toStrictEqual(['nupkg', 'releases']);
    expect(offer?.artifacts[0]?.url).toMatch(
      /^\/media\/machine-updates\/smarteverything-0\.4\.2-full\.nupkg\?expires=\d+&signature=[0-9a-f]+$/u,
    );
    expect(offer?.version).toBe('0.4.2');
  });

  it('offers nothing for a platform the release does not cover', async () => {
    await release();
    expect(await updates().offer({ platform: 'darwin', arch: 'arm64' })).toBeNull();
  });

  it('names the file that is missing instead of offering a broken release', async () => {
    await release();
    await rm(join(data, MACHINE_UPDATE_FOLDER, 'RELEASES'));
    await expect(updates().offer({ platform: 'linux', arch: 'x64' })).rejects.toThrow(
      ReleaseFolderInvalidError,
    );
  });

  it('refuses a file whose size differs from the manifest', async () => {
    await release();
    await writeFile(
      join(data, MACHINE_UPDATE_FOLDER, 'SmartEverything-linux-x64-0.4.2.zip'),
      'short',
    );
    await expect(updates().offer({ platform: 'linux', arch: 'x64' })).rejects.toThrow(
      /bytes as the manifest says/u,
    );
  });

  it('refuses a manifest that leaves out a file of a platform', async () => {
    const [zip, nupkg] = MANIFEST.artifacts;
    await release({ version: '0.4.2', artifacts: [zip, nupkg] });
    await expect(updates().offer({ platform: 'linux', arch: 'x64' })).rejects.toThrow(
      /release manifest/u,
    );
  });

  it('refuses a manifest that is not JSON', async () => {
    await release();
    await writeFile(join(data, MACHINE_UPDATE_FOLDER, MACHINE_UPDATE_MANIFEST_FILE), '{nope');
    await expect(updates().offer({ platform: 'linux', arch: 'x64' })).rejects.toThrow(/JSON/u);
  });

  it('only serves files the manifest names', async () => {
    await release();
    await expect(updates().artifact('../manifest.json')).rejects.toThrow(/No stored release/u);
    expect((await updates().artifact('RELEASES')).size).toBe(RELEASES.length);
  });
});

describe('downloading a stored release over HTTP', () => {
  let server: Server;
  let base = '';

  beforeEach(async () => {
    await release();
    const links = new MediaLinks(() => NOW);
    const route = machineUpdateRoute(links, updates());
    server = createServer((request, response) => {
      const params = matchPath(route.path, new URL(request.url ?? '/', 'http://hub').pathname);
      route.handle(request, response, params ?? {}).catch((cause: unknown) => {
        response.writeHead(cause instanceof ApiError ? cause.status : 500).end();
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('The test server has no port.');
    base = `http://127.0.0.1:${String(address.port)}`;
    signed = links.machineUpdate('SmartEverything-linux-x64-0.4.2.zip').url;
  });

  let signed = '';

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  it('streams the stored bytes for a signed link', async () => {
    const response = await fetch(`${base}${signed}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(Buffer.from(await response.arrayBuffer())).toStrictEqual(ZIP);
  });

  it('serves a byte range so an interrupted download can continue', async () => {
    const response = await fetch(`${base}${signed}`, { headers: { range: 'bytes=4-8' } });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe(ZIP.subarray(4, 9).toString());
  });

  it('refuses a link with a changed signature', async () => {
    const forged = signed.replace(/signature=[0-9a-f]/u, 'signature=0');
    expect((await fetch(`${base}${forged}`)).status).toBe(401);
  });

  it('describes the endpoint as readable by members', () => {
    expect(API_ENDPOINTS.readMachineUpdate.access).toBe('member');
  });
});
