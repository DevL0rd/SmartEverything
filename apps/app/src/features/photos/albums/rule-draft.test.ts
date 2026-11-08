import { describe, expect, it } from 'vitest';
import { DRIVE_ALBUM_CHANGE, DRIVE_ALBUM_CREATE, type SmartRule } from '@smarteverything/domain';
import {
  addRow,
  changeBody,
  createBody,
  draftOfRule,
  draftReady,
  newDraft,
  removeRow,
  replaceRow,
  retypeRow,
  ruleOf,
  withKind,
} from './rule-draft';

const KEPT: SmartRule = {
  match: 'any',
  rules: [
    { kind: 'in_root', rootId: 'a1b2c3d4-0000-4000-8000-000000000001' },
    { kind: 'text', field: 'lens', contains: '35mm' },
  ],
};

describe('smart album draft', () => {
  it('starts a smart draft with one kind rule and needs a name before it is ready', () => {
    const draft = newDraft('smart', 'person');
    expect(ruleOf(draft)).toStrictEqual({
      match: 'all',
      rules: [{ kind: 'item_kind', itemKinds: ['image'] }],
    });
    expect(draftReady(draft)).toBe(false);
    expect(draftReady({ ...draft, title: 'Garden' })).toBe(true);
  });

  it('blocks the rule while a row is unfinished or a date is not a day', () => {
    const named = { ...newDraft('smart', 'home'), title: 'Sunsets' };
    const added = addRow(named);
    expect(ruleOf(added)).toBeNull();
    const taken = retypeRow(added, 1, 'taken');
    expect(ruleOf(replaceRow(taken, { key: 1, field: 'taken', from: '3 Nov', to: '' }))).toBeNull();
    expect(
      ruleOf(replaceRow(taken, { key: 1, field: 'taken', from: '2026-11-07', to: '2026-11-03' })),
    ).toBeNull();
    const done = replaceRow(taken, { key: 1, field: 'taken', from: '2026-11-03', to: '' });
    expect(ruleOf(done)?.rules[1]).toStrictEqual({
      kind: 'date_range',
      field: 'takenAt',
      from: '2026-11-03',
      to: null,
    });
  });

  it('keeps rules the editor cannot change and edits the rest', () => {
    const draft = draftOfRule('Library', KEPT, 'person');
    expect(draft.rows.map((row) => row.field)).toStrictEqual(['kept', 'lens']);
    expect(ruleOf(draft)).toStrictEqual(KEPT);
    expect(ruleOf(removeRow(draft, 1))?.rules).toStrictEqual([KEPT.rules[0]]);
  });

  it('builds a strict create body for both kinds and a change body for an edit', () => {
    const manual = { ...newDraft('manual', 'home'), title: ' Tokyo ' };
    expect(DRIVE_ALBUM_CREATE.parse(createBody(manual))).toStrictEqual({
      kind: 'manual',
      title: 'Tokyo',
      surface: 'photos',
      scope: 'home',
      itemIds: [],
    });
    const smart = withKind(manual, 'smart');
    expect(DRIVE_ALBUM_CREATE.parse(createBody(smart)).kind).toBe('smart');
    expect(createBody({ ...smart, title: '  ' })).toBeNull();
  });

  it('sends only the name for a manual album and the name and rule for a smart one', () => {
    const base = {
      id: 'a1b2c3d4-0000-4000-8000-000000000003',
      title: 'Library',
      surface: 'photos',
      scope: 'person',
      ownerProfileId: 'a1b2c3d4-0000-4000-8000-0000000000aa',
      coverItemId: null,
      itemCount: 3,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    } as const;
    const draft = draftOfRule('Lenses', KEPT, 'person');
    expect(
      DRIVE_ALBUM_CHANGE.parse(changeBody({ ...base, kind: 'smart', rule: KEPT }, draft)),
    ).toStrictEqual({
      title: 'Lenses',
      rule: KEPT,
    });
    expect(changeBody({ ...base, kind: 'manual' }, draft)).toStrictEqual({ title: 'Lenses' });
  });
});
