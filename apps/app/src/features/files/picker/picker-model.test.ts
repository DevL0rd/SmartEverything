import { describe, expect, it } from 'vitest';
import { readOnlyOf } from '../source/abilities';
import { COMPUTER_FULL } from '../source/fixture-seeds';
import { nodeOfEntry } from '../source/fixture-tree';
import type { FileLocation, FolderListing } from '../source/types';
import { transferRefusalOf, transferTitleOf } from '../transfer/transfer-model';
import {
  choiceViewOf,
  createdLocationOf,
  pickerRowsOf,
  togglePick,
  writableHereOf,
  type ChoiceInput,
  type PickerHere,
  type PickerRules,
} from './picker-model';

const HOME = '/home/dana';
const here: FileLocation = { place: HOME, folder: null };

const projects = nodeOfEntry({
  key: `${HOME}/Projects`,
  parentKey: HOME,
  name: 'Projects',
  kind: 'folder',
});
const site = nodeOfEntry({
  key: `${HOME}/Projects/site`,
  parentKey: `${HOME}/Projects`,
  name: 'site',
  kind: 'folder',
});
const notes = nodeOfEntry({ key: `${HOME}/notes.txt`, parentKey: HOME, name: 'notes.txt' });
const locked = nodeOfEntry({
  key: `${HOME}/locked.txt`,
  parentKey: HOME,
  name: 'locked.txt',
  writable: false,
});
const dot = nodeOfEntry({
  key: `${HOME}/.config`,
  parentKey: HOME,
  name: '.config',
  kind: 'folder',
});
const entries = [projects, dot, notes, locked];

function listing(change: Partial<FolderListing> = {}): FolderListing {
  return {
    entries,
    folder: null,
    crumbs: [{ key: HOME, label: 'Home', location: here }],
    total: entries.length,
    complete: true,
    loading: false,
    stale: false,
    error: null,
    more: null,
    retry: () => undefined,
    ...change,
  };
}

function at(change: Partial<PickerHere> = {}): PickerHere {
  return {
    location: here,
    listing: listing(),
    abilities: COMPUTER_FULL,
    writable: true,
    ...change,
  };
}

function input(
  here: PickerHere,
  rules: PickerRules,
  picked: readonly string[],
  refusal: string | null,
): ChoiceInput<unknown> {
  return { here, rules, picked, refusal, fallback: 'PC' };
}

const rules = (change: Partial<PickerRules> = {}): PickerRules => ({
  mode: 'folder',
  writableOnly: false,
  showHidden: false,
  ...change,
});

describe('picker rows per mode', () => {
  it('shows only folders in folder mode and hides dot names until asked', () => {
    expect(pickerRowsOf(entries, rules(), []).map((row) => row.node.name)).toEqual(['Projects']);
    expect(
      pickerRowsOf(entries, rules({ showHidden: true }), []).map((row) => row.node.name),
    ).toEqual(['Projects', '.config']);
  });

  it('shows files in file modes, folders open and files pick', () => {
    const rows = pickerRowsOf(entries, rules({ mode: 'file' }), [notes.key]);
    expect(rows.map((row) => [row.node.name, row.opens, row.enabled, row.picked])).toEqual([
      ['Projects', true, true, false],
      ['notes.txt', false, true, true],
      ['locked.txt', false, true, false],
    ]);
  });

  it('disables files that are not writable when only writable ones may be chosen', () => {
    const rows = pickerRowsOf(entries, rules({ mode: 'files', writableOnly: true }), []);
    expect(rows.find((row) => row.node.key === locked.key)?.enabled).toBe(false);
  });
});

describe('picking', () => {
  it('keeps one file in file mode and many in files mode', () => {
    const one = rules({ mode: 'file' });
    expect(togglePick(togglePick([], notes, one), locked, one)).toEqual([locked.key]);
    expect(togglePick([notes.key], notes, one)).toEqual([]);
    const many = rules({ mode: 'files' });
    expect(togglePick(togglePick([], notes, many), locked, many)).toEqual([notes.key, locked.key]);
    expect(togglePick([notes.key, locked.key], notes, many)).toEqual([locked.key]);
  });

  it('never picks folders or files in folder mode', () => {
    expect(togglePick([], projects, rules({ mode: 'files' }))).toEqual([]);
    expect(togglePick([], notes, rules())).toEqual([]);
  });
});

describe('choice', () => {
  it('chooses the folder being shown', () => {
    const view = choiceViewOf(input(at(), rules(), [], null));
    expect(view.choice).toEqual({ kind: 'folder', location: here, folder: null, label: 'Home' });
    expect(view.summary).toBe('Choosing Home');
    expect(view.label).toBe('Choose this folder');
  });

  it('waits for the folder and refuses a read only one when writable is required', () => {
    expect(
      choiceViewOf(input(at({ listing: listing({ loading: true }) }), rules(), [], null)),
    ).toEqual({
      choice: null,
      label: 'Choose this folder',
      summary: 'Reading the folder…',
      reason: null,
    });
    const view = choiceViewOf(
      input(at({ writable: false }), rules({ writableOnly: true }), [], null),
    );
    expect(view.choice).toBeNull();
    expect(view.reason).toBe('You can only view this folder, so it can’t be chosen.');
  });

  it('passes the host refusal through', () => {
    const view = choiceViewOf(input(at(), rules(), [], 'Not here.'));
    expect(view.choice).toBeNull();
    expect(view.reason).toBe('Not here.');
  });

  it('chooses picked files with a counted label', () => {
    const many = rules({ mode: 'files' });
    expect(choiceViewOf(input(at(), many, [], null))).toMatchObject({
      choice: null,
      summary: 'Select files',
    });
    const view = choiceViewOf(input(at(), many, [notes.key, locked.key], null));
    expect(view.choice).toEqual({ kind: 'files', nodes: [notes, locked] });
    expect(view.label).toBe('Choose 2 files');
    expect(choiceViewOf(input(at(), rules({ mode: 'file' }), [notes.key], null)).summary).toBe(
      'Choosing notes.txt',
    );
  });
});

describe('writable and created folders', () => {
  it('uses the folder node when there is one and the abilities at a place root', () => {
    expect(writableHereOf(listing(), true)).toBe(true);
    expect(writableHereOf(listing({ folder: locked }), true)).toBe(false);
    expect(writableHereOf(listing({ folder: projects }), false)).toBe(false);
  });

  it('opens the folder the source created', () => {
    expect(createdLocationOf(here, { done: [`${HOME}/New`], failed: [], undo: null })).toEqual({
      place: HOME,
      folder: `${HOME}/New`,
    });
    expect(createdLocationOf(here, { done: [], failed: [], undo: null })).toBeNull();
  });
});

describe('move and copy targets', () => {
  const inside: PickerHere = at({
    location: { place: HOME, folder: site.key },
    listing: listing({
      folder: site,
      crumbs: [
        { key: HOME, label: 'Home', location: here },
        { key: projects.key, label: 'Projects', location: { place: HOME, folder: projects.key } },
        { key: site.key, label: 'site', location: { place: HOME, folder: site.key } },
      ],
    }),
  });

  it('refuses moving a folder into itself, its own folders or where it already is', () => {
    expect(transferRefusalOf('pc', 'move', [site], inside)).toBe(
      'A folder can’t be moved into itself.',
    );
    expect(transferRefusalOf('pc', 'move', [projects], inside)).toBe(
      'A folder can’t be moved into one of its own folders.',
    );
    expect(transferRefusalOf('pc', 'move', [notes], at())).toBe(
      'These items are already in this folder.',
    );
  });

  it('copies into the same folder and refuses where the abilities say no', () => {
    expect(transferRefusalOf('pc', 'copy', [notes], at())).toBeNull();
    expect(transferRefusalOf('pc', 'move', [notes], inside)).toBeNull();
    expect(
      transferRefusalOf('pc', 'move', [notes], { ...inside, abilities: readOnlyOf(COMPUTER_FULL) }),
    ).toBe('These items can’t be moved.');
  });

  it('titles the sheet by what moves', () => {
    expect(transferTitleOf('move', [notes])).toBe('Move notes.txt');
    expect(transferTitleOf('copy', [notes, locked])).toBe('Copy 2 items');
  });
});
