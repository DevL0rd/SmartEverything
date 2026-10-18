import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MachineUpdateStatus } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { InstallKind } from '../../src/updates/install-kind.js';
import {
  UpdateController,
  type StagedUpdate,
  type UpdateControllerOptions,
} from '../../src/updates/update-controller.js';

const ZIP = Buffer.from('zip bytes');
const SERVER = { url: 'https://home.example:7880', token: 'set_token' };

let staging = '';

beforeEach(async () => {
  staging = await mkdtemp(join(tmpdir(), 'update-controller-'));
});

afterEach(async () => {
  await rm(staging, { recursive: true, force: true });
});

function offerOf(version: string): unknown {
  return {
    version,
    artifacts: [
      {
        platform: 'linux',
        arch: 'x64',
        kind: 'zip',
        file: 'app.zip',
        sha256: createHash('sha256').update(ZIP).digest('hex'),
        size: ZIP.length,
        url: '/media/machine-updates/app.zip?expires=1&signature=ab',
      },
    ],
    expiresAt: '2026-10-18T10:10:00.000Z',
  };
}

interface Rig {
  readonly controller: UpdateController;
  readonly applied: StagedUpdate[];
  readonly statuses: MachineUpdateStatus[];
  readonly state: { offer: unknown; server: typeof SERVER | null; fail: Error | null };
}

function rig(
  install: InstallKind = { kind: 'folder', root: '/opt/x' },
  overrides: Partial<UpdateControllerOptions> = {},
): Rig {
  const applied: StagedUpdate[] = [];
  const state: Rig['state'] = { offer: offerOf('0.4.2'), server: SERVER, fail: null };
  const fake: typeof fetch = (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.includes('/api/machine-update')) return Promise.resolve(Response.json(state.offer));
    return Promise.resolve(new Response(ZIP));
  };
  const controller = new UpdateController({
    version: '0.1.0',
    platform: 'linux',
    arch: 'x64',
    install,
    server: (): Promise<typeof SERVER | null> => Promise.resolve(state.server),
    fetch: fake,
    stagingDirectory: staging,
    apply: (staged): Promise<void> => {
      applied.push(staged);
      return state.fail === null ? Promise.resolve() : Promise.reject(state.fail);
    },
    ...overrides,
  });
  const statuses: MachineUpdateStatus[] = [];
  controller.onChange((status) => {
    statuses.push(status);
  });
  return { controller, applied, statuses, state };
}

describe('looking for an update', () => {
  it('starts out saying the newest version is installed', () => {
    expect(rig().controller.status()).toMatchObject({ state: 'none', installable: false });
  });

  it('offers a newer release that can be installed here', async () => {
    const { controller } = rig();
    expect(await controller.check()).toStrictEqual({
      state: 'available',
      version: '0.4.2',
      detail: 'Version 0.4.2 is ready to install.',
      installable: true,
    });
  });

  it('says so when the release is not newer', async () => {
    const { controller, state } = rig();
    state.offer = offerOf('0.1.0');
    expect(await controller.check()).toMatchObject({ state: 'none', version: null });
  });

  it('says so when the home stores no release', async () => {
    const { controller, state } = rig();
    state.offer = null;
    expect(await controller.check()).toMatchObject({ state: 'none' });
  });

  it('shows a newer release but keeps it uninstallable for a package-managed copy', async () => {
    const { controller } = rig({
      kind: 'unmanaged',
      reason: 'This copy was installed by a package; update it there.',
    });
    expect(await controller.check()).toMatchObject({
      state: 'available',
      installable: false,
      detail: 'Version 0.4.2 is available. This copy was installed by a package; update it there.',
    });
  });

  it('asks the person to connect when the computer is not paired', async () => {
    const { controller, state } = rig();
    state.server = null;
    expect((await controller.check()).detail).toBe(
      'Connect this computer to your home to get updates.',
    );
  });

  it('offers nothing for a processor it has no build for', async () => {
    const { controller } = rig(undefined, { arch: 'ia32' });
    expect((await controller.check()).detail).toBe('Updates are not offered for linux on ia32.');
  });

  it('reports why it could not look', async () => {
    const { controller } = rig(undefined, {
      server: () => Promise.reject(new Error('the server is stopped')),
    });
    expect(await controller.check()).toMatchObject({
      state: 'failed',
      detail: 'Could not look for an update: the server is stopped',
    });
  });

  it('tells listeners about every change', async () => {
    const { controller, statuses } = rig();
    await controller.check();
    expect(statuses.map((status) => status.state)).toStrictEqual(['available']);
  });
});

describe('installing an update', () => {
  it('does nothing before a release was found', async () => {
    const { controller, applied } = rig();
    await controller.install();
    expect(applied).toStrictEqual([]);
  });

  it('does nothing for a release that cannot be installed here', async () => {
    const { controller, applied } = rig({ kind: 'unmanaged', reason: 'No.' });
    await controller.check();
    await controller.install();
    expect(applied).toStrictEqual([]);
  });

  it('downloads the verified files and hands them to the installer', async () => {
    const { controller, applied, statuses } = rig();
    await controller.check();
    await controller.install();
    expect(statuses.map((status) => status.state)).toStrictEqual([
      'available',
      'downloading',
      'installing',
    ]);
    const [staged] = applied;
    expect(staged?.version).toBe('0.4.2');
    expect(await readFile(staged?.files.get('zip') ?? '')).toStrictEqual(ZIP);
  });

  it('asks the home again for fresh links before downloading', async () => {
    const { controller, state, applied } = rig();
    await controller.check();
    state.offer = offerOf('0.4.3');
    await controller.install();
    expect(applied[0]?.version).toBe('0.4.3');
  });

  it('reports a failed install with its reason and allows another check', async () => {
    const { controller, state } = rig();
    state.fail = new Error('services would not restart');
    await controller.check();
    const status = await controller.install();
    expect(status).toMatchObject({ state: 'failed', version: '0.4.2' });
    expect(status.detail).toContain('services would not restart');
    expect((await controller.check()).state).toBe('available');
  });

  it('fails when the home dropped the release after it was announced', async () => {
    const { controller, state } = rig();
    await controller.check();
    state.offer = null;
    expect((await controller.install()).detail).toContain('no longer stored');
  });

  it('does not start a second check while an install runs', async () => {
    const { controller } = rig(undefined, { apply: () => new Promise(() => undefined) });
    await controller.check();
    void controller.install();
    for (let turn = 0; turn < 200 && controller.status().state !== 'installing'; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(controller.status().state).toBe('installing');
    expect((await controller.check()).state).toBe('installing');
  });
});
