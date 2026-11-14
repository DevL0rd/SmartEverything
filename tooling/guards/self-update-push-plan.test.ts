import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gitSourceText, type HubUpdateSource } from '../hub-update-source.ts';
import type { PlanResult } from '../../apps/hub/src/self-update/plan-contract.ts';
import { planPush } from '../self-update-push-plan.ts';

const NOTES_FILE = join('release-notes', 'hub.json');

let scratch: string;
let upstream: string;
let checkout: string;
let source: HubUpdateSource;
let base: string;

function git(folder: string, ...args: string[]): Promise<string> {
  return gitSourceText(folder, args, 'prepare the plan fixture');
}

async function commit(folder: string, files: Record<string, string>): Promise<string> {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(folder, path, '..'), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  await git(folder, 'add', '-A');
  await git(
    folder,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    'change',
  );
  return (await git(folder, 'rev-parse', 'HEAD')).trim();
}

function notes(from: string): Record<string, string> {
  return { [NOTES_FILE]: JSON.stringify({ from, notes: 'Faster startup\n\n- Loads sooner.' }) };
}

function plan(
  tip: string,
  pushedFrom: string | null = base,
  from: string | null = null,
): Promise<PlanResult> {
  return planPush(source, { tip, pushedFrom, base: from });
}

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'self-update-plan-'));
  upstream = join(scratch, 'upstream');
  checkout = join(scratch, 'checkout');
  await git(scratch, 'init', '-b', 'main', upstream);
  base = await commit(upstream, { 'apps/hub/src/a.ts': 'a', 'docs/a.md': 'a' });
  await git(scratch, 'clone', '--no-hardlinks', upstream, checkout);
  source = { folder: checkout, remote: 'origin', branch: 'main' };
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('plan a pushed revision', () => {
  it('plans the Hub from changed paths and returns the authored notes', async () => {
    const tip = await commit(upstream, { 'apps/hub/src/a.ts': 'b', ...notes(base) });
    expect(await plan(tip)).toEqual({
      status: 'planned',
      base,
      components: ['hub'],
      notes: 'Faster startup\n\n- Loads sooner.',
    });
  });

  it('plans the UI update for app code and every component for a dependency change', async () => {
    const ui = await commit(upstream, { 'apps/app/src/a.tsx': 'x', ...notes(base) });
    expect(await plan(ui)).toMatchObject({ status: 'planned', components: ['ui'] });
    const all = await commit(upstream, { 'pnpm-lock.yaml': 'x', ...notes(ui) });
    expect(await plan(all, ui)).toMatchObject({
      status: 'planned',
      components: ['hub', 'app', 'desktop', 'ui'],
    });
  });

  it('plans nothing for a push that only touches docs and tests and needs no notes', async () => {
    const tip = await commit(upstream, { 'docs/a.md': 'b', 'apps/hub/test/a.test.ts': 'x' });
    expect(await plan(tip)).toEqual({ status: 'planned', base, components: [], notes: null });
  });

  it('compares against the last released revision, not the checkout head, when one is given', async () => {
    const first = await commit(upstream, { 'apps/app/src/a.tsx': 'x', ...notes(base) });
    const tip = await commit(upstream, { 'docs/a.md': 'c', ...notes(first) });
    expect(await plan(tip, first, base)).toMatchObject({
      status: 'planned',
      base,
      components: ['ui'],
    });
  });

  it('reads notes written for the pushed-from revision when pushes were coalesced', async () => {
    const first = await commit(upstream, { 'apps/hub/src/a.ts': 'b' });
    const tip = await commit(upstream, { 'apps/hub/src/a.ts': 'c', ...notes(first) });
    expect(await plan(tip, first, base)).toMatchObject({ status: 'planned', components: ['hub'] });
  });

  it('refuses a code push without release notes in that commit, saying so plainly', async () => {
    const tip = await commit(upstream, { 'apps/hub/src/a.ts': 'b' });
    const result = await plan(tip);
    expect(result).toMatchObject({ status: 'refused' });
    expect(JSON.stringify(result)).toContain('release-notes/hub.json');
  });

  it('refuses notes written for a different revision', async () => {
    const tip = await commit(upstream, { 'apps/hub/src/a.ts': 'b', ...notes('f'.repeat(40)) });
    expect(await plan(tip)).toMatchObject({ status: 'refused' });
  });

  it('hands over to the newer push when the branch moved after this one', async () => {
    const stale = await commit(upstream, { 'apps/hub/src/a.ts': 'b', ...notes(base) });
    const newer = await commit(upstream, { 'apps/hub/src/a.ts': 'c', ...notes(stale) });
    const result = await plan(stale);
    expect(result).toMatchObject({ status: 'superseded' });
    expect(JSON.stringify(result)).toContain(newer.slice(0, 12));
  });

  it('refuses and changes nothing when the checkout has uncommitted work', async () => {
    const tip = await commit(upstream, { 'apps/hub/src/a.ts': 'b', ...notes(base) });
    writeFileSync(join(checkout, 'apps', 'hub', 'src', 'a.ts'), 'edited locally');
    expect(await plan(tip)).toMatchObject({ status: 'refused' });
    expect(await git(checkout, 'status', '--porcelain')).toContain('a.ts');
  });

  it('refuses when the checkout has commits the remote branch does not have', async () => {
    const tip = await commit(upstream, { 'apps/hub/src/a.ts': 'b', ...notes(base) });
    await commit(checkout, { 'local.txt': 'x' });
    const localHead = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    expect(await plan(tip)).toMatchObject({ status: 'refused' });
    expect((await git(checkout, 'rev-parse', 'HEAD')).trim()).toBe(localHead);
  });

  it('refuses when the checkout is on another branch', async () => {
    const tip = await commit(upstream, { 'apps/hub/src/a.ts': 'b', ...notes(base) });
    await git(checkout, 'checkout', '-b', 'elsewhere');
    expect(await plan(tip)).toMatchObject({ status: 'refused' });
  });

  it('refuses when the revision to compare against is not in the checkout', async () => {
    const tip = await commit(upstream, { 'apps/hub/src/a.ts': 'b', ...notes(base) });
    expect(await plan(tip, base, 'e'.repeat(40))).toMatchObject({ status: 'refused' });
  });
});
