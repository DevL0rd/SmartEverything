import { describe, expect, it } from 'vitest';
import { DRIVE_ALBUM, SMART_RULE } from '@smarteverything/domain';
import { commitAdding, createBody, draftReady, removeChip, renameBody } from './rule-chips';
import { openedOfRename, openedOfRequest, panelTitleOf, withDraft } from './save-smart-folder';
import type { SmartFolder } from './smart-model';

const FOLDER_ID = 'a1b2c3d4-0000-4000-8000-000000000002';

const FILTER_RULE = SMART_RULE.parse({
  match: 'all',
  rules: [
    { kind: 'in_folder', folderId: FOLDER_ID },
    { kind: 'text', field: 'name', contains: 'plan' },
  ],
});

describe('the Save as smart folder opener', () => {
  it('opens on the caller’s rule, kept private by default, and saves it for Drive', () => {
    const opened = openedOfRequest({
      rule: FILTER_RULE,
      title: 'plan',
      matches: 3,
      places: new Map([[FOLDER_ID, 'Kitchen remodel']]),
    });
    expect(opened.mode).toBe('create');
    expect(opened.matches).toBe(3);
    expect(opened.draft.adding).toBeNull();
    expect(opened.places.get(FOLDER_ID)).toBe('Kitchen remodel');
    expect(panelTitleOf(opened.mode)).toBe('Save as smart folder');
    expect(createBody(opened.draft)).toEqual({
      kind: 'smart',
      title: 'plan',
      surface: 'drive',
      scope: 'person',
      rule: FILTER_RULE,
    });
  });

  it('keeps the caller’s match count only while the rules are the ones it counted', () => {
    const opened = openedOfRequest({
      rule: FILTER_RULE,
      title: 'plan',
      matches: 3,
      from: 'the filter in Projects › Home › Finance',
    });
    expect(opened.from).toBe('the filter in Projects › Home › Finance');
    const renamed = withDraft(opened, { ...opened.draft, title: 'Plans' });
    expect(renamed.matches).toBe(3);
    expect(renamed.draft.title).toBe('Plans');
    const fewer = withDraft(renamed, removeChip(renamed.draft, 1));
    expect(fewer.matches).toBeNull();
    expect(fewer.draft.chips).toHaveLength(1);
    const anyOf = withDraft(opened, { ...opened.draft, match: 'any' });
    expect(anyOf.matches).toBeNull();
    const added = withDraft(
      opened,
      commitAdding({ ...opened.draft, adding: { field: 'starred' } }),
    );
    expect(added.matches).toBeNull();
    expect(added.draft.chips).toHaveLength(3);
  });

  it('starts with a rule being added when the caller has no rule yet', () => {
    const opened = openedOfRequest({ rule: null, title: '', matches: null });
    expect(opened.draft.chips).toHaveLength(0);
    expect(opened.draft.adding?.field).toBe('kind');
    expect(opened.anchorRef).toBeNull();
    expect(draftReady(opened.draft, 'create')).toBe(false);
  });

  it('renames a smart folder without touching its rule or who sees it', () => {
    const parsed = DRIVE_ALBUM.parse({
      id: 'a1b2c3d4-0000-4000-8000-000000000020',
      title: 'Receipts',
      surface: 'drive',
      scope: 'home',
      ownerProfileId: null,
      coverItemId: null,
      itemCount: 146,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      kind: 'smart',
      rule: FILTER_RULE,
    });
    if (parsed.kind !== 'smart') throw new Error('not a smart folder');
    const folder: SmartFolder = parsed;
    const opened = openedOfRename(folder, null);
    expect(opened.mode).toBe('rename');
    expect(panelTitleOf(opened.mode)).toBe('Rename smart folder');
    expect(renameBody({ ...opened.draft, title: 'Receipts 2026' })).toEqual({
      title: 'Receipts 2026',
    });
  });
});
