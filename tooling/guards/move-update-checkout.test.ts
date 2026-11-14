import { mkdirSync, mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { testLayout } from '../../apps/hub/test/support/test-layout.ts';
import { configureUpdateSource } from '../configure-update-source.ts';
import { gitSourceText } from '../hub-update-source.ts';
import { dataLayoutOf } from '../release-hub-files.ts';
import {
  LEGACY_CACHE_FOLDERS,
  MoveCheckoutError,
  moveUpdateCheckout,
  type MovePorts,
} from '../move-update-checkout.ts';

let scratch: string;
let checkout: string;
let data: string;
let relinked: string[];

function git(folder: string, ...args: string[]): Promise<string> {
  return gitSourceText(folder, args, 'prepare the Git test fixture');
}

const ports = (home: string): MovePorts => ({
  relink: (folder: string): void => {
    relinked.push(folder);
  },
  home,
});

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'move-checkout-'));
  checkout = join(scratch, 'old', 'checkout');
  relinked = [];
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
  mkdirSync(dirname(checkout));
  await git(scratch, 'clone', '--no-hardlinks', upstream, checkout);
  mkdirSync(join(checkout, 'tooling'));
  writeFileSync(join(checkout, 'tooling', 'self-update-app-command.ts'), '');
  writeFileSync(join(checkout, '.gitignore'), 'node_modules\n');
  mkdirSync(join(checkout, 'node_modules'));
  writeFileSync(join(checkout, 'node_modules', 'big.bin'), 'x');
  await git(checkout, 'add', '-A');
  await git(
    checkout,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    'tooling',
  );
  await git(checkout, 'branch', '--set-upstream-to=origin/main');
  data = (await testLayout(join(scratch, 'data'))).root;
  const file = dataLayoutOf(data).system.config.service;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ go2rtcBinary: '/opt/go2rtc' }));
  await configureUpdateSource({ checkout, data });
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

it('moves the checkout with its ignored files, saves the new path and leaves no old folder', async () => {
  const to = join(scratch, 'storage', 'SmartEverything');
  mkdirSync(dirname(to));
  const moved = await moveUpdateCheckout({ to, data, removeOldCaches: false }, ports(scratch));
  expect(moved).toEqual({ from: checkout, to });
  expect(existsSync(checkout)).toBe(false);
  expect(readFileSync(join(to, 'node_modules', 'big.bin'), 'utf8')).toBe('x');
  const saved = z
    .object({ updateSource: z.object({ checkout: z.string() }) })
    .parse(JSON.parse(readFileSync(dataLayoutOf(data).system.config.service, 'utf8')));
  expect(saved.updateSource.checkout).toBe(to);
  expect(relinked).toEqual([to]);
});

it('removes the old default cache folders only when asked', async () => {
  const to = join(scratch, 'storage', 'SmartEverything');
  mkdirSync(dirname(to));
  const home = join(scratch, 'home');
  for (const folder of LEGACY_CACHE_FOLDERS) mkdirSync(join(home, folder), { recursive: true });
  await moveUpdateCheckout({ to, data, removeOldCaches: false }, ports(home));
  expect(LEGACY_CACHE_FOLDERS.every((folder) => existsSync(join(home, folder)))).toBe(true);
  const again = join(scratch, 'storage', 'Again');
  await moveUpdateCheckout({ to: again, data, removeOldCaches: true }, ports(home));
  expect(LEGACY_CACHE_FOLDERS.some((folder) => existsSync(join(home, folder)))).toBe(false);
});

it('refuses a checkout with uncommitted changes and leaves everything in place', async () => {
  writeFileSync(join(checkout, 'dirty.txt'), 'changed');
  const to = join(scratch, 'storage', 'SmartEverything');
  mkdirSync(dirname(to));
  await expect(
    moveUpdateCheckout({ to, data, removeOldCaches: false }, ports(scratch)),
  ).rejects.toThrow(MoveCheckoutError);
  expect(existsSync(join(checkout, 'dirty.txt'))).toBe(true);
  expect(existsSync(to)).toBe(false);
});

it('refuses a destination that exists, is inside the checkout or has no parent', async () => {
  const existing = join(scratch, 'taken');
  mkdirSync(existing);
  for (const to of [existing, join(checkout, 'inner'), join(scratch, 'missing-parent', 'x')]) {
    await expect(
      moveUpdateCheckout({ to, data, removeOldCaches: false }, ports(scratch)),
    ).rejects.toThrow(MoveCheckoutError);
  }
  expect(existsSync(checkout)).toBe(true);
});
