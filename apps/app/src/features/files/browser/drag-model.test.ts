import { describe, expect, it } from 'vitest';
import { abilitiesOf } from '../source/abilities';
import { COMPUTER_FULL } from '../source/fixture-seeds';
import { nodeOfEntry } from '../source/fixture-tree';
import {
  dropLabelOf,
  dropVerdictOf,
  uploadDropOf,
  type DragPayload,
  type DropTarget,
} from './drag-model';

const home = '/home/dana';
const projects = nodeOfEntry({
  key: `${home}/Projects`,
  parentKey: home,
  name: 'Projects',
  kind: 'folder',
});
const site = nodeOfEntry({
  key: `${home}/Projects/site`,
  parentKey: `${home}/Projects`,
  name: 'site',
  kind: 'folder',
});
const notes = nodeOfEntry({ key: `${home}/notes.txt`, parentKey: home, name: 'notes.txt' });

function target(
  key: string,
  ancestors: readonly string[],
  change: Partial<DropTarget> = {},
): DropTarget {
  return {
    sourceId: 'pc',
    location: { place: home, folder: key },
    key,
    ancestors,
    writable: true,
    ...change,
  };
}

const payload = (nodes: readonly (typeof notes)[], sourceId = 'pc'): DragPayload => ({
  sourceId,
  nodes,
});

describe('drag move rules', () => {
  it('moves into another folder of the same source', () => {
    const verdict = dropVerdictOf(
      payload([notes]),
      target(projects.key, [home]),
      COMPUTER_FULL,
      false,
    );
    expect(verdict).toEqual({
      kind: 'move',
      op: { kind: 'move', nodes: [notes], to: { place: home, folder: projects.key } },
    });
    expect(dropLabelOf(verdict, 'Projects')).toBe('Move 1 item to Projects');
  });

  it('refuses a move into the item itself or one of its own folders', () => {
    expect(
      dropVerdictOf(payload([projects]), target(projects.key, [home]), COMPUTER_FULL, false),
    ).toEqual({
      kind: 'refused',
      reason: 'into_itself',
    });
    expect(
      dropVerdictOf(
        payload([projects]),
        target(site.key, [home, projects.key]),
        COMPUTER_FULL,
        false,
      ),
    ).toEqual({
      kind: 'refused',
      reason: 'into_child',
    });
  });

  it('refuses a move across sources, into its own folder or into a read-only folder', () => {
    expect(
      dropVerdictOf(payload([notes], 'drive'), target(projects.key, [home]), COMPUTER_FULL, false),
    ).toMatchObject({ reason: 'other_source' });
    expect(dropVerdictOf(payload([notes]), target(home, []), COMPUTER_FULL, false)).toMatchObject({
      reason: 'already_here',
    });
    const topLevel = { ...notes, parentKey: null };
    const rootTarget = target('my_drive', [], { location: { place: 'my_drive', folder: null } });
    expect(dropVerdictOf(payload([topLevel]), rootTarget, COMPUTER_FULL, false)).toMatchObject({
      reason: 'already_here',
    });
    expect(
      dropVerdictOf(
        payload([notes]),
        target(projects.key, [home], { writable: false }),
        COMPUTER_FULL,
        false,
      ),
    ).toMatchObject({ reason: 'not_writable' });
    expect(
      dropVerdictOf(payload([]), target(projects.key, [home]), COMPUTER_FULL, false),
    ).toMatchObject({ reason: 'nothing' });
  });

  it('copies with Alt, even into the same folder, only when the source copies', () => {
    expect(dropVerdictOf(payload([notes]), target(home, []), COMPUTER_FULL, true)).toMatchObject({
      kind: 'copy',
    });
    expect(
      dropVerdictOf(
        payload([notes]),
        target(projects.key, [home]),
        abilitiesOf(['move', 'dragMove']),
        true,
      ),
    ).toMatchObject({ reason: 'not_allowed' });
  });

  it('needs drag move as well as move', () => {
    expect(
      dropVerdictOf(payload([notes]), target(projects.key, [home]), abilitiesOf(['move']), false),
    ).toMatchObject({ reason: 'not_allowed' });
  });

  it('takes dropped files from the system only where uploads are allowed', () => {
    expect(uploadDropOf(target(projects.key, [home]), COMPUTER_FULL)).toEqual({
      kind: 'upload',
      to: { place: home, folder: projects.key },
    });
    expect(uploadDropOf(target(projects.key, [home], { writable: false }), COMPUTER_FULL)).toEqual({
      kind: 'refused',
      reason: 'not_writable',
    });
    expect(uploadDropOf(target(projects.key, [home]), abilitiesOf([]))).toEqual({
      kind: 'refused',
      reason: 'not_allowed',
    });
  });
});
