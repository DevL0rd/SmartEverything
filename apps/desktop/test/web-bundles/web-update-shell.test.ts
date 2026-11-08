import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WEB_UPDATE_STATUS, type AppUpdateCompatible } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../../src/window.js', () => ({ revealWindow: (): void => undefined }));

import { WebBundleStore } from '../../src/web-bundles/bundle-store.js';
import {
  WebUpdateShell,
  WebUpdateWindowError,
  type WebUpdateWindow,
} from '../../src/web-bundles/web-update-shell.js';

const RUNTIME = 'c'.repeat(32);
const EMBEDDED_AT = '2026-10-01T00:00:00.000Z';
const SERVER = { url: 'https://home.example:7880', token: 'set_token' };
const PAGE = Buffer.from('<html>updated</html>');

class FakeWindow {
  readonly sent: { channel: string; value: unknown }[] = [];
  readonly rendererGone: ((reason: string) => void)[] = [];
  readonly loadFailed: ((code: number, description: string) => void)[] = [];
  readonly reloadWaiters: (() => void)[] = [];
  reloads = 0;
  revealed = 0;
  destroyed = false;

  readonly port: WebUpdateWindow = {
    isDestroyed: () => this.destroyed,
    send: (channel, value) => {
      this.sent.push({ channel, value });
    },
    reload: () => {
      this.reloads += 1;
      for (const wake of this.reloadWaiters.splice(0)) wake();
    },
    reveal: () => {
      this.revealed += 1;
    },
    onRendererGone: (listener) => {
      this.rendererGone.push(listener);
    },
    onMainFrameLoadFailed: (listener) => {
      this.loadFailed.push(listener);
    },
  };

  async untilReloads(count: number): Promise<void> {
    while (this.reloads < count) {
      await new Promise<void>((resolve) => {
        this.reloadWaiters.push(resolve);
      });
    }
  }

  crash(reason: string): void {
    for (const listener of this.rendererGone) listener(reason);
  }

  failLoad(code: number, description: string): void {
    for (const listener of this.loadFailed) listener(code, description);
  }
}

let parent = '';
let appPath = '';
let userData = '';
let embedded = '';

beforeEach(async () => {
  parent = await mkdtemp(path.join(tmpdir(), 'web-shell-'));
  appPath = path.join(parent, 'app');
  userData = path.join(parent, 'user');
  embedded = path.join(parent, 'embedded');
  await mkdir(appPath);
  await mkdir(embedded);
  await writeFile(
    path.join(appPath, 'package.json'),
    JSON.stringify({ webRuntime: RUNTIME, webEmbedded: { createdAt: EMBEDDED_AT } }),
  );
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(parent, { recursive: true, force: true });
});

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function offerFor(id: string): AppUpdateCompatible {
  return {
    id,
    createdAt: '2026-10-20T00:00:00.000Z',
    appVersion: '1.2.3',
    notes: 'a change',
    size: PAGE.length,
    files: [
      {
        path: 'index.html',
        sha256: sha256(PAGE),
        size: PAGE.length,
        contentType: 'text/html',
        url: `/media/app-updates/${sha256(PAGE)}?expires=1&signature=ab`,
      },
    ],
  };
}

function homeServing(compatible: AppUpdateCompatible | null): typeof fetch {
  return (input, init) => {
    const url = new URL(new Request(input, init).url);
    if (url.pathname === '/api/app-updates/latest') {
      return Promise.resolve(
        Response.json({ compatible, newerIncompatible: null, rollBackToEmbedded: false }),
      );
    }
    return Promise.resolve(new Response(PAGE));
  };
}

async function shellFor(
  options: { managedBy?: 'stable-app'; packaged?: boolean; fetch?: typeof fetch } = {},
): Promise<WebUpdateShell> {
  return WebUpdateShell.create({
    managedBy: options.managedBy,
    packaged: options.packaged ?? true,
    appPath,
    userDataPath: userData,
    embeddedRoot: embedded,
    server: () => Promise.resolve(SERVER),
    fetch: options.fetch ?? homeServing(null),
  });
}

function attached(shell: WebUpdateShell): {
  window: FakeWindow;
  changes: number[];
} {
  const window = new FakeWindow();
  const changes: number[] = [];
  shell.attach(window.port, () => {
    changes.push(changes.length);
  });
  return { window, changes };
}

async function applied(shell: WebUpdateShell, id: string): Promise<ReturnType<typeof attached>> {
  const setup = attached(shell);
  await shell.check('release');
  await shell.download(id);
  await shell.apply({ kind: 'update', id });
  expect(setup.window.reloads).toBe(1);
  expect(shell.root()).toBe(path.join(userData, 'web-bundles', id));
  return setup;
}

const STATE = z.object({ active: z.string(), trial: z.boolean(), failed: z.array(z.string()) });

async function stateOf(): Promise<z.infer<typeof STATE>> {
  const file = path.join(userData, 'web-bundles', 'state.json');
  return STATE.parse(JSON.parse(await readFile(file, 'utf8')));
}

describe('the modes', () => {
  it('is disabled with a reason for the development copy and keeps the embedded root', async () => {
    const shell = await shellFor({ managedBy: 'stable-app' });

    expect(shell.status()).toMatchObject({ state: 'disabled' });
    await shell.launch();
    expect(shell.root()).toBe(embedded);
  });

  it('is disabled for an unpackaged copy', async () => {
    const shell = await shellFor({ packaged: false });

    const status = shell.status();
    expect(status.state).toBe('disabled');
    expect(status.state === 'disabled' && status.reason).toContain('runs from source');
  });
});

describe('apply and rollback', () => {
  it('applies by switching the served root, reloading once and forwarding the status', async () => {
    const id = randomUUID();
    const shell = await shellFor({ fetch: homeServing(offerFor(id)) });

    const { window, changes } = await applied(shell, id);

    expect(await stateOf()).toMatchObject({ active: id, trial: true });
    const states = window.sent
      .filter((message) => message.channel === 'desktop:web-update-status-changed')
      .map((message) => WEB_UPDATE_STATUS.parse(message.value).state);
    expect(states).toContain('ready');
    expect(states.at(-1)).toBe('applying');
    expect(changes.length).toBe(states.length);
    await shell.confirm();
  });

  it('keeps a slow-starting trial bundle until a real failure signal or confirmation arrives', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const id = randomUUID();
    const shell = await shellFor({ fetch: homeServing(offerFor(id)) });
    const { window } = await applied(shell, id);

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(window.reloads).toBe(1);
    expect(shell.root()).toBe(path.join(userData, 'web-bundles', id));

    await shell.confirm();
    expect(window.reloads).toBe(1);
    expect(await stateOf()).toMatchObject({ active: id, trial: false, failed: [] });
  });

  it('rolls back to the embedded bundle when the renderer dies during the trial', async () => {
    const id = randomUUID();
    const shell = await shellFor({ fetch: homeServing(offerFor(id)) });
    const { window } = await applied(shell, id);

    window.crash('crashed');
    await window.untilReloads(2);

    expect(shell.root()).toBe(embedded);
    expect(window.reloads).toBe(2);
    expect(shell.status()).toMatchObject({ state: 'rolled_back', failedId: id });
    expect(await stateOf()).toMatchObject({ active: 'embedded', trial: false, failed: [id] });
  });

  it('rolls back when the main frame fails to load', async () => {
    const id = randomUUID();
    const shell = await shellFor({ fetch: homeServing(offerFor(id)) });
    const { window } = await applied(shell, id);

    window.failLoad(-6, 'FILE_NOT_FOUND');
    await window.untilReloads(2);

    expect(window.reloads).toBe(2);
    expect(shell.root()).toBe(embedded);
    expect(shell.status()).toMatchObject({
      state: 'rolled_back',
      reason: 'The window failed to load (-6): FILE_NOT_FOUND.',
    });
  });

  it('reverts once when several failures arrive together', async () => {
    const id = randomUUID();
    const shell = await shellFor({ fetch: homeServing(offerFor(id)) });
    const { window } = await applied(shell, id);

    window.crash('crashed');
    window.failLoad(-2, 'FAILED');
    await shell.reportFailure('the app shell threw');

    expect(window.reloads).toBe(2);
    expect((await stateOf()).failed).toStrictEqual([id]);
  });

  it('does nothing outside a trial, including after the boot is confirmed', async () => {
    const id = randomUUID();
    const shell = await shellFor({ fetch: homeServing(offerFor(id)) });
    const { window } = await applied(shell, id);

    await shell.confirm();
    window.crash('crashed');
    await shell.reportFailure('late');

    expect(window.reloads).toBe(1);
    expect(shell.root()).toBe(path.join(userData, 'web-bundles', id));
    expect(shell.status()).toMatchObject({ state: 'idle', running: { id } });
  });

  it('reverts a trial that never confirmed at launch, before any window exists', async () => {
    const id = randomUUID();
    const bundles = path.join(userData, 'web-bundles');
    await mkdir(path.join(bundles, id), { recursive: true });
    await writeFile(
      path.join(bundles, id, 'bundle.json'),
      JSON.stringify({ id, runtimeVersion: RUNTIME, createdAt: '2026-10-20T00:00:00.000Z' }),
    );
    await new WebBundleStore(bundles).begin(id);

    const shell = await shellFor();
    await shell.launch();

    expect(shell.root()).toBe(embedded);
    expect(shell.status()).toMatchObject({ state: 'rolled_back', failedId: id });
    expect(await stateOf()).toMatchObject({ active: 'embedded', trial: false, failed: [id] });
  });

  it('serves a confirmed bundle at the next launch', async () => {
    const id = randomUUID();
    const first = await shellFor({ fetch: homeServing(offerFor(id)) });
    await applied(first, id);
    await first.confirm();

    const next = await shellFor();
    await next.launch();

    expect(next.root()).toBe(path.join(userData, 'web-bundles', id));
  });
});

describe('asking to restart', () => {
  it('shows the window and asks it to open its confirm dialog', async () => {
    const shell = await shellFor();
    const { window } = attached(shell);

    shell.askToRestart();

    expect(window.revealed).toBe(1);
    expect(window.sent).toStrictEqual([
      { channel: 'desktop:web-update-confirm-requested', value: undefined },
    ]);
  });

  it('names the missing window instead of failing silently', async () => {
    const shell = await shellFor();

    expect(() => {
      shell.askToRestart();
    }).toThrow(WebUpdateWindowError);
  });
});
