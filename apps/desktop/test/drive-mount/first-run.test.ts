import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DrivePlacement } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountedPlacement, syncedPlacement } from './placement-fixture.js';
import { FirstRun } from '../../src/drive-mount/first-run.js';

let folder = '';

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'drive-first-run-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function run(mountable = true): FirstRun {
  return new FirstRun({ file: join(folder, 'first-run.json'), home: '/home/u', mountable });
}

function placement(mode: 'mounted' | 'synced'): DrivePlacement {
  return mode === 'mounted' ? mountedPlacement() : syncedPlacement('/home/u/docs');
}

describe('FirstRun', () => {
  it('offers the mounts once on a mountable computer with none yet', async () => {
    const first = run();
    expect(first.defaultParent).toBe('/home/u/SmartEverything');
    expect(await first.pending([])).toBe(true);
    expect(await first.pending([placement('synced')])).toBe(true);
  });

  it('does not offer when a mount exists or the computer cannot mount', async () => {
    expect(await run().pending([placement('mounted')])).toBe(false);
    expect(await run(false).pending([])).toBe(false);
  });

  it('remembers an answer across restarts', async () => {
    const first = run();
    await first.settle('dismissed');
    expect(await first.pending([])).toBe(false);
    expect(await run().pending([])).toBe(false);
  });
});
