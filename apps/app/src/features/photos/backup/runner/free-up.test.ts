import { beforeEach, describe, expect, it } from 'vitest';
import { INITIAL_BACKUP_STATUS, backupStatus } from '../model/status';
import { digestOf, rig, rowOf, type Rig } from './fixtures';
import { loadLedger } from './ledger-store';

describe('free up space', () => {
  let t: Rig;

  beforeEach(async () => {
    backupStatus.set(INITIAL_BACKUP_STATUS);
    t = rig();
    t.library.rows = [rowOf('a', 1000), rowOf('b', 2000)];
    t.native.sizes.set('a', 400);
    t.native.sizes.set('b', 600);
    await t.runner.request();
  });

  it('lists the items the hub verified now, with their size', async () => {
    expect(await t.runner.findFreeable()).toEqual({
      kind: 'ready',
      localIds: ['a', 'b'],
      bytes: 1000,
    });
  });

  it('leaves out an item the hub no longer holds', async () => {
    t.hub.held.delete(digestOf('b@2000'));
    expect(await t.runner.findFreeable()).toMatchObject({ localIds: ['a'], bytes: 400 });
  });

  it('leaves out an item edited since it was backed up', async () => {
    t.library.rows = [rowOf('a', 1000), rowOf('b', 9000)];
    expect(await t.runner.findFreeable()).toMatchObject({ localIds: ['a'] });
  });

  it('does not offer to free space on a platform where the library cannot delete', async () => {
    const ios = rig('ios');
    ios.library.rows = [rowOf('a', 1000)];
    await ios.runner.request();
    expect(await ios.runner.findFreeable()).toEqual({ kind: 'unsupported' });
  });

  it('removes the confirmed items and forgets them', async () => {
    const found = await t.runner.findFreeable();
    if (found.kind !== 'ready') throw new Error('expected a freeable set');
    expect(await t.runner.freeUp(found)).toBe(true);
    expect(t.library.removed).toEqual(['a', 'b']);
    expect((await loadLedger(t.ports)).has('a')).toBe(false);
  });

  it('keeps the ledger when the person declines the system dialog', async () => {
    const found = await t.runner.findFreeable();
    if (found.kind !== 'ready') throw new Error('expected a freeable set');
    t.library.removeAnswer = false;
    expect(await t.runner.freeUp(found)).toBe(false);
    expect((await loadLedger(t.ports)).has('a')).toBe(true);
  });

  it('checks the hub again at the moment of removal', async () => {
    const found = await t.runner.findFreeable();
    if (found.kind !== 'ready') throw new Error('expected a freeable set');
    t.hub.held.delete(digestOf('a@1000'));
    expect(await t.runner.freeUp(found)).toBe(true);
    expect(t.library.removed).toEqual(['b']);
  });

  it('re-checks only the confirmed items without scanning the library again', async () => {
    const found = await t.runner.findFreeable();
    if (found.kind !== 'ready') throw new Error('expected a freeable set');
    const pages = t.library.pagesRead;
    t.library.timeLookups.length = 0;
    await t.runner.freeUp(found);
    expect(t.library.pagesRead).toBe(pages);
    expect(t.library.timeLookups).toEqual([['a', 'b']]);
  });

  it('leaves out a confirmed item edited after the person confirmed', async () => {
    const found = await t.runner.findFreeable();
    if (found.kind !== 'ready') throw new Error('expected a freeable set');
    t.library.rows = [rowOf('a', 1000), rowOf('b', 9000)];
    expect(await t.runner.freeUp(found)).toBe(true);
    expect(t.library.removed).toEqual(['a']);
  });

  it('never removes an item the person did not confirm', async () => {
    const found = await t.runner.findFreeable();
    if (found.kind !== 'ready') throw new Error('expected a freeable set');
    expect(await t.runner.freeUp({ localIds: ['a'], bytes: found.bytes })).toBe(true);
    expect(t.library.removed).toEqual(['a']);
  });

  describe('with a very large library', () => {
    const COUNT = 2300;
    let big: Rig;

    beforeEach(async () => {
      big = rig();
      big.library.pageSize = 500;
      big.library.rows = Array.from({ length: COUNT }, (_, at) =>
        rowOf(`p${String(at)}`, 1000 + at),
      );
      await big.runner.request();
    });

    it('looks the hub up in chunks that cover every item', async () => {
      big.hub.checkPurposes.length = 0;
      big.hub.checks.length = 0;
      const found = await big.runner.findFreeable();
      if (found.kind !== 'ready') throw new Error('expected a freeable set');
      expect(found.localIds).toHaveLength(COUNT);
      const lookups = big.hub.checks.filter((_, at) => big.hub.checkPurposes[at] === 'lookup');
      expect(lookups.length).toBeGreaterThan(1);
      expect(lookups.reduce((sum, check) => sum + check.assets.length, 0)).toBe(COUNT);
    });

    it('removes every item across several calls and forgets them all', async () => {
      const found = await big.runner.findFreeable();
      if (found.kind !== 'ready') throw new Error('expected a freeable set');
      expect(await big.runner.freeUp(found)).toBe(true);
      expect(big.library.removeCalls.length).toBeGreaterThan(1);
      expect(big.library.removed).toHaveLength(COUNT);
      expect((await loadLedger(big.ports)).has('p0')).toBe(false);
    });

    it('stops at a declined chunk and keeps the rest in the ledger', async () => {
      const found = await big.runner.findFreeable();
      if (found.kind !== 'ready') throw new Error('expected a freeable set');
      big.library.removeAnswer = false;
      expect(await big.runner.freeUp(found)).toBe(false);
      expect(big.library.removeCalls).toHaveLength(1);
      expect((await loadLedger(big.ports)).has('p0')).toBe(true);
    });
  });
});
