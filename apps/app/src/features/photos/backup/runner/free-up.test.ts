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
    expect((await loadLedger(t.storage)).has('a')).toBe(false);
  });

  it('keeps the ledger when the person declines the system dialog', async () => {
    const found = await t.runner.findFreeable();
    if (found.kind !== 'ready') throw new Error('expected a freeable set');
    t.library.removeAnswer = false;
    expect(await t.runner.freeUp(found)).toBe(false);
    expect((await loadLedger(t.storage)).has('a')).toBe(true);
  });

  it('checks the hub again at the moment of removal', async () => {
    const found = await t.runner.findFreeable();
    if (found.kind !== 'ready') throw new Error('expected a freeable set');
    t.hub.held.delete(digestOf('a@1000'));
    expect(await t.runner.freeUp(found)).toBe(true);
    expect(t.library.removed).toEqual(['b']);
  });
});
