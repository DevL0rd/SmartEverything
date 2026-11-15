import { describe, expect, it } from 'vitest';
import { NO_ABILITIES } from './abilities';
import { COMPUTER_HOME, COMPUTER_TRASH, computerSeedOf } from './fixture-seeds';
import type { ComputerFixture } from './fixture-seeds';
import { createFixtureSource, searchOf, type FixtureSource } from './fixture-source';
import type { FixtureOrigin } from './fixture-tree';
import {
  describeSourceContract,
  type ContractHarness,
} from '../../../test-support/file-source-contract';

function rig(
  fixture: ComputerFixture,
): ContractHarness<FixtureOrigin> & { readonly source: FixtureSource } {
  const source = createFixtureSource(computerSeedOf(fixture));
  return {
    source,
    home: COMPUTER_HOME,
    trash: COMPUTER_TRASH,
    list: (location) => Promise.resolve(source.listing(location)),
    abilities: source.abilitiesAt,
  };
}

describeSourceContract('the Linux fixture source', () => rig('linux'));

describeSourceContract('the read-only fixture source', () => rig('windows'));

describe('fixture source', () => {
  it('refuses every change on a read-only place', async () => {
    const { source, home } = rig('windows');
    const [first] = source.listing(home);
    if (first === undefined) throw new Error('the home folder has entries');
    const result = await source.run({ kind: 'trash', nodes: [first] });
    expect(result.done).toEqual([]);
    expect(source.listing(home).map((node) => node.key)).toContain(first.key);
  });

  it('lists seeded Trash items and deletes them for good', async () => {
    const { source } = rig('linux');
    const trashed = source.listing(COMPUTER_TRASH);
    expect(trashed.map((node) => node.name)).toEqual([
      'old-draft.txt',
      'Screenshot 2026-11-01.png',
    ]);
    await source.run({ kind: 'delete_now', nodes: trashed.slice(0, 1) });
    expect(source.listing(COMPUTER_TRASH).map((node) => node.name)).toEqual([
      'Screenshot 2026-11-01.png',
    ]);
  });

  it('finds names everywhere below the folder and text inside files only for contents', () => {
    const { source } = rig('linux');
    const below = [...source.tree.get().nodes.values()];
    expect(
      searchOf(below, { text: 'readme', contents: false }).map((match) => match.node.name),
    ).toEqual(['readme.md']);
    expect(searchOf(below, { text: 'invoice', contents: false })).toEqual([]);
    const hits = searchOf(below, { text: 'invoice', contents: true });
    expect(hits.map((match) => [match.node.name, match.hit.where])).toEqual([
      ['notes.txt', 'text'],
      ['readme.md', 'text'],
    ]);
    expect(hits[0]?.hit.ranges).toEqual([{ start: 16, end: 23 }]);
  });

  it('has no places and no abilities without the files scope', () => {
    const seed = computerSeedOf('no_scope');
    expect(seed.places).toEqual([]);
    expect(seed.abilities(COMPUTER_HOME)).toEqual(NO_ABILITIES);
  });
});
