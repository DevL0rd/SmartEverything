import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createPackage } from '@electron/asar';
import { desktopPackageResources } from '../../apps/desktop/src/package-layout.ts';
import { afterEach, beforeEach } from 'vitest';
import {
  startMachineUpdateHub,
  type MachineUpdateHub,
} from '../../apps/hub/test/support/machine-update-hub.ts';
import type { PublisherTarget } from '../machine-update-client.ts';
import { announceHub } from './local-hub-fixture.ts';

export interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export const NOTES = '- Desktop setup is clearer.\n\n- The installer checks the packaged version.';
export const PUBLICATION = { notes: NOTES };

export const workspace = { base: '' };

export interface ReleaseHub {
  readonly hub: MachineUpdateHub;
  readonly target: PublisherTarget;
}

class ReleaseHubMissingError extends Error {
  override readonly name = 'ReleaseHubMissingError';

  constructor() {
    super('useReleaseHub must be called before the hub is read.');
  }
}

const started: { current: ReleaseHub | null } = { current: null };

export function releaseHub(): ReleaseHub {
  if (started.current === null) throw new ReleaseHubMissingError();
  return started.current;
}

export async function publisherFor(
  hub: MachineUpdateHub,
  role: 'owner' | 'member',
): Promise<ReleaseHub> {
  return { hub, target: await announceHub(hub, role) };
}

export function useReleaseHub(): void {
  beforeEach(async () => {
    const hub = await startMachineUpdateHub({ tls: false });
    started.current = await publisherFor(hub, 'owner');
  });

  afterEach(async () => {
    await started.current?.hub.close();
    started.current = null;
  });
}

export function useReleaseWorkspace(): void {
  beforeEach(async () => {
    workspace.base = await mkdtemp(join(tmpdir(), 'release-machine-update-'));
  });

  afterEach(async () => {
    await rm(workspace.base, { recursive: true, force: true });
  });
}

export const FIXTURE_ARCHIVES = {
  linux: {
    executable: 'SmartEverything-linux-x64/smarteverything',
    resources: 'SmartEverything-linux-x64/resources',
  },
  darwin: {
    executable: 'SmartEverything.app/Contents/MacOS/smarteverything',
    resources: 'SmartEverything.app/Contents/Resources',
  },
  win32: {
    executable: 'lib/net45/smarteverything.exe',
    resources: 'lib/net45/resources',
  },
} as const;
export const WEB_PAYLOAD = 'fixture web renderer CRC payload';

interface ArchiveFixture {
  readonly platform?: keyof typeof FIXTURE_ARCHIVES;
  readonly resources?: string;
  readonly extra?: readonly string[];
  readonly omit?: string;
}

export async function built(
  name: string,
  version: string,
  fixture: ArchiveFixture = {},
): Promise<string> {
  const file = join(workspace.base, 'out', name);
  const staging = await mkdtemp(join(workspace.base, 'staging-'));
  const layout = FIXTURE_ARCHIVES[fixture.platform ?? 'linux'];
  const resources = fixture.resources ?? layout.resources;
  const entries = [
    layout.executable,
    ...desktopPackageResources(fixture.platform ?? 'linux')
      .filter((entry) => entry !== fixture.omit)
      .map((entry) => `${resources}/${entry}`),
    ...(fixture.extra ?? []),
  ];
  await mkdir(join(workspace.base, 'out'), { recursive: true });
  for (const entry of entries) {
    const source = join(staging, entry);
    await mkdir(dirname(source), { recursive: true });
    if (entry.endsWith('/app.asar')) {
      const app = await mkdtemp(join(workspace.base, 'app-'));
      await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'desktop', version }));
      await createPackage(app, source);
    } else {
      await writeFile(source, entry.endsWith('/dist/index.html') ? WEB_PAYLOAD : 'fixture payload');
    }
  }
  execFileSync('zip', ['-0', '-q', file, ...entries], { cwd: staging });
  return file;
}
