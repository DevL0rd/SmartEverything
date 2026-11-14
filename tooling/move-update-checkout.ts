import { execFile, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { env } from 'node:process';
import { parseArgs, promisify } from 'node:util';
import { z } from 'zod';
import { lockHeld } from '../apps/hub/src/self-update/stale-jobs.ts';
import { findUpdateSource } from '../apps/hub/src/self-update/update-source.ts';
import { applyBuildHost, pnpmProgram } from './build-host.ts';
import { configureUpdateSource } from './configure-update-source.ts';
import { dataRootOf } from './data-root.ts';
import { gitSource } from './hub-update-source.ts';
import { dataLayoutOf } from './release-hub-files.ts';

const execute = promisify(execFile);

const OPTIONS = z.strictObject({
  to: z.string().refine(isAbsolute, { message: 'must be an absolute path' }),
  data: z.string().min(1).optional(),
  'remove-old-caches': z.boolean().optional(),
});

export const LEGACY_CACHE_FOLDERS: readonly string[] = [
  '.android',
  '.gradle',
  '.npm',
  join('.local', 'share', 'pnpm'),
  join('.cache', 'pnpm'),
];

export class MoveCheckoutError extends Error {
  override readonly name = 'MoveCheckoutError';
}

export interface MovePorts {
  readonly relink: (checkout: string, data: string) => void;
  readonly home: string;
}

export function relinkDependencies(checkout: string, data: string): void {
  applyBuildHost(dataLayoutOf(data), checkout);
  const result = spawnSync(pnpmProgram(), ['install', '--frozen-lockfile'], {
    cwd: checkout,
    stdio: 'inherit',
  });
  if (result.status !== 0)
    throw new MoveCheckoutError(
      `The checkout was moved and the update source saved, but pnpm install --frozen-lockfile failed in ${checkout}; run it there with the build host pnpm.`,
    );
}

async function requireIdle(data: string): Promise<void> {
  const directory = dataLayoutOf(data).system.updates.selfUpdate;
  for (const lock of ['executor.lock', 'hub-release.lock']) {
    if (await lockHeld(join(directory, lock)))
      throw new MoveCheckoutError(
        'An update build or hub release is running; wait for it to finish before moving the checkout.',
      );
  }
}

async function requireCleanCheckout(from: string): Promise<void> {
  const status = await gitSource(from, ['status', '--porcelain']);
  if (status.code !== 0 || status.text.trim() !== '')
    throw new MoveCheckoutError(
      `${from} has uncommitted changes or is not a Git checkout; commit or discard them before moving it.`,
    );
}

function requireDestination(from: string, to: string, data: string): void {
  if (existsSync(to)) throw new MoveCheckoutError(`${to} already exists.`);
  const inside = relative(from, to);
  if (!inside.startsWith('..') && !isAbsolute(inside))
    throw new MoveCheckoutError(`${to} is inside the checkout being moved.`);
  const parent = dirname(to);
  if (!existsSync(parent)) throw new MoveCheckoutError(`${parent} does not exist.`);
  if (statSync(parent).dev !== statSync(data).dev)
    throw new MoveCheckoutError(
      `${to} is not on the data disk: choose a folder on the same disk as the data folder ${data}.`,
    );
}

export async function moveUpdateCheckout(
  input: { readonly to: string; readonly data: string; readonly removeOldCaches: boolean },
  ports: MovePorts,
): Promise<{ readonly from: string; readonly to: string }> {
  const to = resolve(input.to);
  const source = findUpdateSource(dataLayoutOf(input.data));
  if (source === undefined)
    throw new MoveCheckoutError(
      'No update source is configured; run tooling/configure-update-source.ts first.',
    );
  const from = source.checkout;
  requireDestination(from, to, input.data);
  await requireIdle(input.data);
  await requireCleanCheckout(from);
  try {
    await execute('mv', ['--', from, to]);
  } catch (cause) {
    await rm(to, { recursive: true, force: true });
    throw cause;
  }
  await configureUpdateSource({ checkout: to, data: input.data });
  ports.relink(to, input.data);
  if (input.removeOldCaches)
    await Promise.all(
      LEGACY_CACHE_FOLDERS.map((folder) =>
        rm(join(ports.home, folder), { recursive: true, force: true }),
      ),
    );
  return { from, to };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      to: { type: 'string' },
      data: { type: 'string' },
      'remove-old-caches': { type: 'boolean' },
    },
  });
  const options = OPTIONS.parse(values);
  const data = await dataRootOf(options.data, env);
  const moved = await moveUpdateCheckout(
    { to: options.to, data, removeOldCaches: options['remove-old-caches'] === true },
    { relink: relinkDependencies, home: homedir() },
  );
  process.stdout.write(
    `Update checkout moved from ${moved.from} to ${moved.to}; the old folder is gone. Restart the Hub so the source watcher uses the new path.\n`,
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  }
}
