import { describe, expect, it } from 'vitest';
import { SMART_RULE, type SmartRule } from '@smarteverything/domain';
import {
  blankAdding,
  cancelAdding,
  commitAdding,
  createBody,
  draftOfRule,
  draftReady,
  editAdding,
  leafOfAdding,
  newDraft,
  removeChip,
  renameBody,
  ruleOfDraft,
  startAdding,
} from './rule-chips';
import { leafLabel, ruleSummary } from './rule-labels';

const ROOT = 'a1b2c3d4-0000-4000-8000-000000000001';
const FOLDER = 'a1b2c3d4-0000-4000-8000-000000000002';

const EVERY_LEAF: SmartRule = SMART_RULE.parse({
  match: 'any',
  rules: [
    { kind: 'item_kind', itemKinds: ['video', 'image'] },
    { kind: 'text', field: 'name', contains: 'receipt' },
    { kind: 'text', field: 'lens', contains: '35mm' },
    { kind: 'date_range', field: 'addedAt', from: '2026-01-01', to: null },
    { kind: 'date_range', field: 'takenAt', from: '2026-03-01', to: '2026-03-31' },
    { kind: 'in_root', rootId: ROOT },
    { kind: 'in_folder', folderId: FOLDER },
    { kind: 'starred', starred: false },
    { kind: 'size_range', minBytes: 1_000_000_000, maxBytes: null },
    { kind: 'duration_range', minMs: null, maxMs: 60_000 },
  ],
});

const NO_PLACE = (): string | null => null;

describe('the rule chip model', () => {
  it('turns every SMART_RULE leaf into a chip and back without losing anything', () => {
    const draft = draftOfRule('Everything', EVERY_LEAF, 'home');
    expect(draft.chips).toHaveLength(EVERY_LEAF.rules.length);
    expect(ruleOfDraft(draft)).toEqual(EVERY_LEAF);
    expect(createBody(draft)).toEqual({
      kind: 'smart',
      title: 'Everything',
      surface: 'drive',
      scope: 'home',
      rule: EVERY_LEAF,
    });
  });

  it('keeps the chip order and keys stable when a chip is removed and another added', () => {
    const draft = draftOfRule('Receipts', EVERY_LEAF, 'person');
    const fewer = removeChip(draft, 1);
    const added = commitAdding(
      editAdding(startAdding(fewer, 'path'), { field: 'path', contains: 'Taxes' }),
    );
    expect(added.chips.map((chip) => chip.key)).toEqual([0, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ruleOfDraft(added)?.rules.at(-1)).toEqual({
      kind: 'text',
      field: 'path',
      contains: 'Taxes',
    });
  });

  it('builds a valid leaf from each added rule and refuses an unfinished one', () => {
    expect(leafOfAdding({ field: 'kind', kind: 'audio' })).toEqual({
      kind: 'item_kind',
      itemKinds: ['audio'],
    });
    expect(leafOfAdding({ field: 'name', contains: '  plan ' })).toEqual({
      kind: 'text',
      field: 'name',
      contains: 'plan',
    });
    expect(leafOfAdding({ field: 'changed', since: '2026-11-01' })).toEqual({
      kind: 'date_range',
      field: 'modifiedAt',
      from: '2026-11-01',
      to: null,
    });
    expect(leafOfAdding({ field: 'starred' })).toEqual({ kind: 'starred', starred: true });
    expect(leafOfAdding({ field: 'name', contains: '   ' })).toBeNull();
    expect(leafOfAdding({ field: 'added', since: '1 Nov' })).toBeNull();
    expect(commitAdding(startAdding(newDraft('x', 'person'), 'name')).chips).toHaveLength(0);
  });

  it('is only ready with a name and at least one rule, and renames need only the name', () => {
    const blank = newDraft('', 'person');
    expect(blank.adding).toEqual(blankAdding('kind'));
    expect(draftReady(blank, 'create')).toBe(false);
    const named = { ...blank, title: 'Docs' };
    expect(draftReady(named, 'create')).toBe(false);
    expect(createBody(named)).toBeNull();
    const ruled = commitAdding(named);
    expect(ruled.adding).toBeNull();
    expect(draftReady(ruled, 'create')).toBe(true);
    expect(draftReady(named, 'rename')).toBe(true);
    expect(renameBody({ ...named, title: '  Docs 2 ' })).toEqual({ title: 'Docs 2' });
    expect(renameBody(blank)).toBeNull();
    expect(cancelAdding(named).adding).toBeNull();
  });
});

describe('rule labels', () => {
  it('names places when they are known and says what they are otherwise', () => {
    const places = (id: string): string | null => (id === ROOT ? 'Media disk' : null);
    expect(leafLabel({ kind: 'in_root', rootId: ROOT }, places)).toBe('In Media disk');
    expect(leafLabel({ kind: 'in_folder', folderId: FOLDER }, places)).toBe('In one folder');
  });

  it('reads like the design chips', () => {
    expect(leafLabel({ kind: 'item_kind', itemKinds: ['document', 'image'] }, NO_PLACE)).toBe(
      'Documents or Photos',
    );
    expect(
      leafLabel({ kind: 'size_range', minBytes: 1_000_000_000, maxBytes: null }, NO_PLACE),
    ).toMatch(/^Size over /);
    expect(
      leafLabel({ kind: 'date_range', field: 'addedAt', from: '2026-01-01', to: null }, NO_PLACE),
    ).toBe('Added since 1 Jan 2026');
    expect(
      ruleSummary(
        SMART_RULE.parse({
          match: 'all',
          rules: [
            { kind: 'starred', starred: true },
            { kind: 'text', field: 'name', contains: 'tax' },
          ],
        }),
        NO_PLACE,
      ),
    ).toBe('Starred · Name has tax');
  });
});
