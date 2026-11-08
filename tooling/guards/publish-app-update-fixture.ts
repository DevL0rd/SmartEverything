import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { hubLayout, type HubLayout } from '../../apps/hub/src/data-layout/index.ts';
import {
  startAppUpdateHub,
  type AppUpdateHub,
} from '../../apps/hub/test/support/app-update-hub.ts';
import { publisherTarget, type PublisherTarget } from '../machine-update-client.ts';
import type { Command } from '../release-android.ts';
import type { Dependencies, PublishRequest } from '../publish-app-update-shared.ts';

export const SERVER = 'https://hub.example.test';
export const ID = '3f1c2a7e-8f44-4b8d-9f0e-0a2f6a1b7c11';
export const DEFAULTS = { server: SERVER };
export const REMOTE = { hub: SERVER, tokenFile: '/publisher.token' };
export const CLI_TARGET = ['--hub', REMOTE.hub, '--token-file', REMOTE.tokenFile];

const BUNDLE = '_expo/static/js/android/entry-1.hbc';
const MAGIC = Buffer.from('c61fbc03c103191f', 'hex');
const LENGTH_OFFSET = 32;
const FOOTER_BYTES = 20;

export const workspace: { base: string; data: HubLayout; exportDirectory: string } = {
  base: '',
  data: hubLayout('/unset', {}),
  exportDirectory: '',
};

const remote: { hub: AppUpdateHub | null; target: PublisherTarget | null } = {
  hub: null,
  target: null,
};

export function updateHub(): AppUpdateHub {
  if (remote.hub === null) throw new Error('useWorkspace must initialize the fake update hub');
  return remote.hub;
}

export function publisher(): PublisherTarget {
  if (remote.target === null) throw new Error('useWorkspace must initialize the publisher target');
  return remote.target;
}

export function useWorkspace(): void {
  beforeEach(async () => {
    workspace.base = mkdtempSync(join(tmpdir(), 'publish-app-update-'));
    remote.hub = await startAppUpdateHub({ tls: true });
    remote.hub.setNow(new Date('2026-10-25T11:12:13.000Z'));
    const tokenFile = join(workspace.base, 'publisher.token');
    writeFileSync(tokenFile, `${remote.hub.tokenFor('owner')}\n`, { mode: 0o600 });
    remote.target = await publisherTarget({
      hub: remote.hub.url.href,
      pin: remote.hub.pin,
      tokenFile,
    });
    workspace.data = remote.hub.layout;
    workspace.exportDirectory = join(workspace.base, 'export');
  });

  afterEach(async () => {
    await remote.hub?.close();
    remote.hub = null;
    remote.target = null;
    rmSync(workspace.base, { recursive: true, force: true });
  });
}

function hermesBundle(): Buffer {
  const body = Buffer.alloc(128);
  MAGIC.copy(body);
  body.write('SHA-256', 64);
  body.writeUInt32LE(body.length + FOOTER_BYTES, LENGTH_OFFSET);
  return Buffer.concat([body, createHash('sha1').update(body).digest()]);
}

function put(path: string, bytes: Buffer | string): void {
  const file = join(workspace.exportDirectory, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}

export interface FixtureAsset {
  readonly path: string;
  readonly ext: string;
}

export function fixture(assets: readonly FixtureAsset[] = []): void {
  put(BUNDLE, hermesBundle());
  for (const asset of assets) put(asset.path, `asset ${asset.path}`);
  put('metadata.json', JSON.stringify({ fileMetadata: { android: { bundle: BUNDLE, assets } } }));
}

export function runOutput(command: Command): string {
  if (command.args.includes('runtimeversion:resolve')) return '{"runtimeVersion":"rt-1"}';
  if (command.args.includes('config'))
    return '{"name":"simulation","android":{"package":"test.smarteverything"}}';
  return '';
}

export function dependencies(): Dependencies {
  return {
    run: runOutput,
    exportDirectory: workspace.exportDirectory,
    webDirectory: join(workspace.base, 'web'),
    desktopRuntime: () => Promise.resolve('desktop-runtime-1'),
  };
}

export function args(overrides: Partial<PublishRequest> = {}): PublishRequest {
  return {
    target: publisher(),
    server: SERVER,
    channel: 'release',
    notes: 'A simulation of release notes.',
    ...overrides,
  };
}
