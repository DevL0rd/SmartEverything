import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MachineUpdateOffer, MachineUpdateStatus } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { InstallKind } from '../../src/updates/install-kind.js';
import {
  UpdateController,
  type StagedUpdate,
  type UpdateControllerOptions,
} from '../../src/updates/update-controller.js';
import { UpdateCleanupError } from '../../src/updates/update-errors.js';

const ZIP = Buffer.from('zip bytes');
const SERVER = { url: 'https://home.example:7880', token: 'set_token' };

let staging = '';

beforeEach(async () => {
  staging = await mkdtemp(join(tmpdir(), 'update-controller-'));
});

afterEach(async () => {
  await rm(staging, { recursive: true, force: true });
});

function offerOf(
  version: string,
  sha256 = createHash('sha256').update(ZIP).digest('hex'),
  link = '/media/machine-updates/app.zip?expires=1&signature=ab',
): MachineUpdateOffer {
  return {
    version,
    artifacts: [
      {
        platform: 'linux',
        arch: 'x64',
        kind: 'zip',
        file: 'app.zip',
        sha256,
        size: ZIP.length,
        url: link,
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

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {
    throw new Error('The deferred promise has no resolver.');
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function isOfferRequest(input: Parameters<typeof fetch>[0]): boolean {
  const url = input instanceof Request ? input.url : input.toString();
  return url.includes('/api/machine-update');
}

function rig(
  install: InstallKind = { kind: 'folder', root: '/opt/x' },
  overrides: Partial<UpdateControllerOptions> = {},
): Rig {
  const applied: StagedUpdate[] = [];
  const state: Rig['state'] = { offer: offerOf('0.4.2'), server: SERVER, fail: null };
  const fake: typeof fetch = (input) => {
    if (isOfferRequest(input)) return Promise.resolve(Response.json(state.offer));
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

function checkedId(controller: UpdateController): string {
  return controller.status().offerId ?? '0'.repeat(64);
}

describe('looking for an update', () => {
  it('starts without claiming the current desktop version is newest', () => {
    expect(rig().controller.status()).toMatchObject({
      state: 'none',
      installable: false,
      detail: 'Desktop updates haven’t been checked yet.',
    });
  });

  it('offers a newer release that can be installed here', async () => {
    const { controller } = rig();
    const { offerId, ...status } = await controller.check();
    expect(status).toStrictEqual({
      state: 'available',
      progress: null,
      version: '0.4.2',
      detail: 'Version 0.4.2 is ready to install.',
      installable: true,
    });
    expect(offerId).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('reports authored notes without changing their line breaks', async () => {
    const { controller, state } = rig();
    const notes = 'Faster startup.\n\n- Improved background reconnect.';
    state.offer = { ...offerOf('0.4.2'), notes };
    expect((await controller.check()).notes).toBe(notes);
  });

  it('says so when the release is not newer', async () => {
    const { controller, state } = rig();
    state.offer = offerOf('0.1.0');
    expect(await controller.check()).toMatchObject({
      state: 'none',
      version: null,
      detail: 'No desktop update available.',
    });
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

  it('keeps the available offer when a later check cannot reach the home', async () => {
    const { controller, state } = reachable();
    const offered = await controller.check();
    state.reachable = false;
    const kept = await controller.check();
    expect(kept).toMatchObject({
      state: 'available',
      version: '0.4.2',
      installable: true,
      offerId: offered.offerId,
    });
    expect(kept.detail).toContain('Checking again failed: the network dropped');
    state.reachable = true;
    expect(await controller.check()).toStrictEqual(offered);
  });

  it('replaces the offer when a later check finds none', async () => {
    const { controller, state } = rig();
    await controller.check();
    state.offer = null;
    expect((await controller.check()).state).toBe('none');
  });

  it('offers a lower version the home names as replacing the running one', async () => {
    const { controller, state } = rig();
    state.offer = { ...offerOf('0.0.9'), replaces: '0.1.0' };
    expect(await controller.check()).toMatchObject({ state: 'available', version: '0.0.9' });
  });

  it('tells listeners about every change', async () => {
    const { controller, statuses } = rig();
    await controller.check();
    expect(statuses.map((status) => status.state)).toStrictEqual(['available']);
  });
});

function reachable(): {
  readonly controller: UpdateController;
  readonly state: { reachable: boolean; offer: unknown };
} {
  const state = { reachable: true, offer: offerOf('0.4.2') };
  const controller = new UpdateController({
    version: '0.1.0',
    platform: 'linux',
    arch: 'x64',
    install: { kind: 'folder', root: '/opt/x' },
    server: (): Promise<typeof SERVER> =>
      state.reachable ? Promise.resolve(SERVER) : Promise.reject(new Error('the network dropped')),
    fetch: (input): Promise<Response> =>
      Promise.resolve(isOfferRequest(input) ? Response.json(state.offer) : new Response(ZIP)),
    stagingDirectory: staging,
    apply: (): Promise<void> => Promise.resolve(),
  });
  return { controller, state };
}

describe('installing an update', () => {
  it('reports received and total bytes while downloading', async () => {
    const { controller, statuses } = rig();
    await controller.check();
    await controller.install(checkedId(controller));
    const downloading = statuses.filter((status) => status.state === 'downloading');
    expect(downloading.at(-1)?.progress).toStrictEqual({
      received: ZIP.length,
      total: ZIP.length,
    });
    expect(downloading[0]?.progress).toBeNull();
    expect(downloading[1]?.progress).toStrictEqual({ received: 0, total: ZIP.length });
    expect(statuses.find((status) => status.state === 'installing')?.progress).toBeNull();
  });

  it('does nothing before a release was found', async () => {
    const { controller, applied } = rig();
    await controller.install(checkedId(controller));
    expect(applied).toStrictEqual([]);
  });

  it('does nothing for a release that cannot be installed here', async () => {
    const { controller, applied } = rig({ kind: 'unmanaged', reason: 'No.' });
    await controller.check();
    await controller.install(checkedId(controller));
    expect(applied).toStrictEqual([]);
  });

  it('downloads the verified files and hands them to the installer', async () => {
    const { controller, applied, statuses } = rig();
    await controller.check();
    await controller.install(checkedId(controller));
    const states = statuses.map((status) => status.state);
    expect([...new Set(states)]).toStrictEqual(['available', 'downloading', 'installing']);
    expect(states.at(-1)).toBe('installing');
    const [staged] = applied;
    expect(staged?.version).toBe('0.4.2');
    expect(await readFile(staged?.files.get('zip') ?? '')).toStrictEqual(ZIP);
  });

  it('refreshes signed links for the exact checked release', async () => {
    const { controller, state, applied } = rig();
    const notes = 'Faster startup.';
    state.offer = { ...offerOf('0.4.2'), notes };
    await controller.check();
    state.offer = {
      ...offerOf('0.4.2', undefined, '/media/machine-updates/app.zip?expires=2&signature=cd'),
      notes,
    };
    await controller.install(checkedId(controller));
    expect(applied[0]?.version).toBe('0.4.2');
  });

  it.each([
    ['a newer version', offerOf('0.4.3')],
    ['different bytes under the same version', offerOf('0.4.2', 'b'.repeat(64))],
    ['new notes under the same version', { ...offerOf('0.4.2'), notes: 'Faster startup.' }],
  ])(
    'requires new confirmation when the download refresh returns %s',
    async (_label, replacement) => {
      const { controller, state, applied } = rig();
      await controller.check();
      state.offer = replacement;
      expect((await controller.install(checkedId(controller))).detail).toContain(
        'the offered update changed',
      );
      expect(applied).toEqual([]);
    },
  );

  it('does not apply a same-version republish after the visible offer was captured', async () => {
    const { controller, state, applied } = rig();
    await controller.check();
    const shown = checkedId(controller);
    state.offer = offerOf('0.4.2', 'b'.repeat(64));
    await controller.check();
    expect(checkedId(controller)).not.toBe(shown);
    expect(await controller.install(shown)).toMatchObject({
      state: 'available',
      version: '0.4.2',
      offerId: checkedId(controller),
    });
    expect(applied).toEqual([]);
  });

  it('requires a new confirmation after a check changes the reviewed notes', async () => {
    const { controller, state, applied } = rig();
    state.offer = { ...offerOf('0.4.2'), notes: 'Faster startup.' };
    await controller.check();
    const reviewed = checkedId(controller);
    const notes = 'Faster startup and reconnect.';
    state.offer = { ...offerOf('0.4.2'), notes };
    await controller.check();
    expect(checkedId(controller)).not.toBe(reviewed);
    expect(await controller.install(reviewed)).toMatchObject({ state: 'available', notes });
    expect(applied).toEqual([]);
  });

  it('coalesces delayed checks without reopening an active installation', async () => {
    const lateCheck = deferred<Response>();
    const started = deferred<undefined>();
    const complete = deferred<undefined>();
    let checks = 0;
    let installs = 0;
    const { controller } = rig(undefined, {
      fetch: (input) => {
        if (!isOfferRequest(input)) return Promise.resolve(new Response(ZIP));
        checks += 1;
        return checks === 2 ? lateCheck.promise : Promise.resolve(Response.json(offerOf('0.4.2')));
      },
      apply: (): Promise<void> => {
        installs += 1;
        started.resolve(undefined);
        return complete.promise;
      },
    });
    await controller.check();
    const delayed = controller.check();
    expect(controller.check()).toBe(delayed);
    const installing = controller.install(checkedId(controller));
    await started.promise;
    lateCheck.resolve(Response.json(offerOf('0.4.3')));
    expect((await delayed).state).toBe('installing');
    expect((await controller.install(checkedId(controller))).state).toBe('installing');
    expect(installs).toBe(1);
    expect(checks).toBe(3);
    complete.resolve(undefined);
    await installing;
  });

  it('reports a failed install with its reason and allows another check', async () => {
    const { controller, state } = rig();
    state.fail = new Error('services would not restart');
    await controller.check();
    const status = await controller.install(checkedId(controller));
    expect(status).toMatchObject({ state: 'failed', version: '0.4.2' });
    expect(status.detail).toContain('services would not restart');
    expect((await controller.check()).state).toBe('available');
  });

  it('gives cleanup failures an actionable status without the raw filesystem error', async () => {
    const { controller, state } = rig();
    state.fail = new UpdateCleanupError(
      new Error("ENOTEMPTY: directory not empty, rmdir '/fixture/desktop.previous/resources'"),
    );
    await controller.check();
    const status = await controller.install(checkedId(controller));
    expect(status).toMatchObject({
      state: 'failed',
      version: '0.4.2',
      installable: false,
    });
    expect(status.detail).toContain('installation folder is writable');
    expect(status.detail).not.toMatch(/ENOTEMPTY|\/fixture/u);
  });

  it('fails when the home dropped the release after it was announced', async () => {
    const { controller, state } = rig();
    await controller.check();
    state.offer = null;
    expect((await controller.install(checkedId(controller))).detail).toContain('no longer stored');
  });

  it('does not start a second check while an install runs', async () => {
    const { controller } = rig(undefined, { apply: () => new Promise(() => undefined) });
    await controller.check();
    void controller.install(checkedId(controller));
    for (let turn = 0; turn < 200 && controller.status().state !== 'installing'; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(controller.status().state).toBe('installing');
    expect((await controller.check()).state).toBe('installing');
  });
});
