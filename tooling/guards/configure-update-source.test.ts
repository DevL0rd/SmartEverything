import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { UPDATE_PUSH_SECRET_FILE } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testLayout } from '../../apps/hub/test/support/test-layout.ts';
import {
  configureUpdateSource,
  ConfigureUpdateSourceError,
  ensurePushSecret,
  updateSourceOf,
} from '../configure-update-source.ts';
import { gitSourceText } from '../hub-update-source.ts';
import { dataLayoutOf } from '../release-hub-files.ts';

let scratch: string;
let checkout: string;

function git(folder: string, ...args: string[]): Promise<string> {
  return gitSourceText(folder, args, 'prepare the Git test fixture');
}

async function prepareCheckout(): Promise<void> {
  const upstream = join(scratch, 'upstream');
  await git(scratch, 'init', '-b', 'main', upstream);
  writeFileSync(join(upstream, 'base.txt'), 'base');
  await git(upstream, 'add', '-A');
  await git(
    upstream,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    'base',
  );
  await git(scratch, 'clone', '--no-hardlinks', upstream, checkout);
  mkdirSync(join(checkout, 'tooling'));
  writeFileSync(join(checkout, 'tooling', 'self-update-app-command.ts'), '');
}

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'configure-update-source-'));
  checkout = join(scratch, 'checkout');
  await prepareCheckout();
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

it('derives the remote and branch from the checkout upstream', async () => {
  await expect(updateSourceOf(checkout)).resolves.toStrictEqual({
    checkout,
    remote: 'origin',
    branch: 'main',
  });
});

it('refuses a checkout without an upstream branch', async () => {
  await git(checkout, 'checkout', '-b', 'local-only');
  await expect(updateSourceOf(checkout)).rejects.toThrow(/no upstream/u);
});

it('refuses a folder that is not a SmartEverything checkout', async () => {
  rmSync(join(checkout, 'tooling'), { recursive: true });
  await expect(updateSourceOf(checkout)).rejects.toThrow(ConfigureUpdateSourceError);
});

it('writes the source into service.json and keeps every other field', async () => {
  const layout = await testLayout(join(scratch, 'data'));
  const file = dataLayoutOf(layout.root).system.config.service;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ go2rtcBinary: '/opt/go2rtc', port: 7881 }));
  await configureUpdateSource({ checkout, data: layout.root });
  expect(JSON.parse(readFileSync(file, 'utf8'))).toStrictEqual({
    go2rtcBinary: '/opt/go2rtc',
    port: 7881,
    updateSource: { checkout, remote: 'origin', branch: 'main' },
  });
});

describe('push webhook secret', () => {
  async function secretFile(): Promise<{ root: string; file: string }> {
    const layout = await testLayout(join(scratch, 'secret-data'));
    return {
      root: layout.root,
      file: join(dataLayoutOf(layout.root).system.updates.selfUpdate, UPDATE_PUSH_SECRET_FILE),
    };
  }

  it('creates a private random secret once and returns it for the one-time display', async () => {
    const { root, file } = await secretFile();
    const shown = ensurePushSecret(root, false);
    expect(shown).toMatch(/^[0-9a-f]{64}$/u);
    expect(readFileSync(file, 'utf8').trim()).toBe(shown);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('keeps the existing secret and shows nothing when run again', async () => {
    const { root, file } = await secretFile();
    const shown = ensurePushSecret(root, false);
    expect(ensurePushSecret(root, false)).toBeUndefined();
    expect(readFileSync(file, 'utf8').trim()).toBe(shown);
  });

  it('replaces the secret only when asked to rotate it', async () => {
    const { root, file } = await secretFile();
    const first = ensurePushSecret(root, false);
    const second = ensurePushSecret(root, true);
    expect(second).toMatch(/^[0-9a-f]{64}$/u);
    expect(second).not.toBe(first);
    expect(readFileSync(file, 'utf8').trim()).toBe(second);
  });
});
