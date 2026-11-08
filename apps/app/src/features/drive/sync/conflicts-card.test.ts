import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIVE_CONFLICT, type DriveConflict } from '@smarteverything/domain';
import { ROOT_ID } from '../../nas/data/fixtures';

interface Seen {
  conflicts: readonly DriveConflict[];
  more: boolean;
}

const seen = vi.hoisted((): Seen => ({ conflicts: [], more: false }));

vi.mock('../../nas/data', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDriveConflicts: (): unknown => ({
    data: { pages: [{ items: seen.conflicts }], pageParams: [null] },
    hasNextPage: seen.more,
    isFetchingNextPage: false,
    fetchNextPage: (): Promise<void> => Promise.resolve(),
  }),
}));
vi.mock('../conflicts/conflict-row', () => ({
  ConflictRow: ({ conflict }: { readonly conflict: DriveConflict }): ReactNode =>
    createElement('li', {}, conflict.relPath),
}));
vi.mock('../conflicts/edit-beats-delete', () => ({
  EditBeatsDeleteRow: (): ReactNode => createElement('p', {}, 'An edit beats a delete'),
}));
vi.mock('../conflicts/conflict-sheet', () => ({ ConflictSheet: (): null => null }));
vi.mock('../conflicts/conflict-compare', () => ({ ConflictCompare: (): null => null }));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode => createElement('button', {}, label),
}));
vi.mock('../../../components/card', () => ({
  Card: ({
    title,
    children,
  }: {
    readonly title: string;
    readonly children: ReactNode;
  }): ReactNode => createElement('article', {}, createElement('h2', {}, title), children),
}));

const { ConflictsCard, conflictsTitleOf } = await import('./conflicts-card');

function conflict(index: number, relPath: string, resolvedAt: string | null = null): DriveConflict {
  return DRIVE_CONFLICT.parse({
    id: `e0000000-0000-4000-8000-00000000000${String(index)}`,
    rootId: ROOT_ID,
    itemId: `e1000000-0000-4000-8000-00000000000${String(index)}`,
    conflictItemId: `e2000000-0000-4000-8000-00000000000${String(index)}`,
    relPath,
    conflictRelPath: `${relPath}.conflict`,
    hubRev: 2,
    baseRev: 1,
    deviceId: 'b0000000-0000-4000-8000-000000000002',
    profileId: 'c0000000-0000-4000-8000-000000000001',
    at: '2026-11-07T10:00:00.000Z',
    resolvedAt,
    resolution: resolvedAt === null ? null : 'keep_both',
  });
}

function render(): string {
  return renderToStaticMarkup(createElement(ConflictsCard));
}

beforeEach(() => {
  seen.conflicts = [];
  seen.more = false;
});

describe('ConflictsCard', () => {
  it('is absent when nothing is in conflict', () => {
    seen.conflicts = [conflict(1, 'Budget.xlsx', '2026-11-07T11:00:00.000Z')];
    expect(render()).toBe('');
  });

  it('lists each open conflict with the edit beats delete row', () => {
    seen.conflicts = [
      conflict(1, 'Budget.xlsx'),
      conflict(2, 'Notes.md'),
      conflict(3, 'Old.txt', '2026-11-07T11:00:00.000Z'),
    ];
    const html = render();
    expect(html).toContain('<h2>2 conflicts</h2>');
    expect(html).toContain('<li>Budget.xlsx</li>');
    expect(html).toContain('<li>Notes.md</li>');
    expect(html).not.toContain('Old.txt');
    expect(html).toContain('An edit beats a delete');
    expect(html).not.toContain('Show more conflicts');
  });

  it('offers more when the hub has further pages', () => {
    seen.conflicts = [conflict(1, 'Budget.xlsx')];
    seen.more = true;
    const html = render();
    expect(html).toContain('<h2>1+ conflicts</h2>');
    expect(html).toContain('Show more conflicts');
  });
});

describe('conflictsTitleOf', () => {
  it('counts conflicts in words', () => {
    expect(conflictsTitleOf(1, false)).toBe('1 conflict');
    expect(conflictsTitleOf(3, false)).toBe('3 conflicts');
    expect(conflictsTitleOf(3, true)).toBe('3+ conflicts');
  });
});
