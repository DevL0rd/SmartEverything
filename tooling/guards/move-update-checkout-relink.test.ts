import type * as ChildProcess from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { testLayout } from '../../apps/hub/test/support/test-layout.ts';
import { relinkDependencies } from '../move-update-checkout.ts';

interface Spawn {
  readonly args: readonly string[];
  readonly env: unknown;
}

const spawned = vi.hoisted((): { calls: Spawn[] } => ({ calls: [] }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual: typeof ChildProcess = await importOriginal();
  return {
    ...actual,
    spawnSync: (
      _program: string,
      args: readonly string[],
      options: { env?: unknown },
    ): { status: number } => {
      spawned.calls.push({ args, env: options.env });
      return { status: 0 };
    },
  };
});

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'relink-'));
  spawned.calls.length = 0;
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

it('installs the moved checkout dependencies without a terminal', async () => {
  const data = (await testLayout(join(scratch, 'data'))).root;
  const checkout = join(scratch, 'checkout');
  mkdirSync(checkout);
  writeFileSync(join(checkout, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11.3.0' }));
  relinkDependencies(checkout, data);
  expect(spawned.calls).toHaveLength(1);
  expect(spawned.calls[0]?.args).toEqual(['install', '--frozen-lockfile']);
  expect(spawned.calls[0]?.env).toMatchObject({ CI: 'true' });
});
