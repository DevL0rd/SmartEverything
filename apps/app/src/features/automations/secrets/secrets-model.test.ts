import type { AutomationSecretEntry, AutomationSecretUser } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_DRAFT,
  dateLine,
  dayText,
  draftBody,
  draftIssues,
  removeVerdict,
  replaceDraft,
  secretRows,
  sheetCopy,
  usersBySecret,
  usesLabel,
  type SecretRowModel,
} from './secrets-model';

const NOW = new Date('2026-10-19T12:00:00Z');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const USER: AutomationSecretUser = {
  automationId: '33333333-3333-4333-8333-333333333333',
  name: 'Notify phone',
};

function entry(id: string, name: string, created: string, updated: string): AutomationSecretEntry {
  return { id, name, createdAt: created, updatedAt: updated };
}

const ENTRIES = [
  entry(B, 'Webhook token', '2025-03-04T12:00:00Z', '2025-03-04T12:00:00Z'),
  entry(A, 'Calendar key', '2026-10-02T12:00:00Z', '2026-10-12T12:00:00Z'),
];

function rowAt(rows: readonly SecretRowModel[], index: number): SecretRowModel {
  const row = rows[index];
  if (row === undefined) throw new Error(`no row ${String(index)}`);
  return row;
}

describe('secret rows', () => {
  it('sorts by name and attaches the automations that use each secret', () => {
    const rows = secretRows(ENTRIES, usersBySecret([[A, USER]]), NOW);
    expect(rows.map((row) => row.name)).toEqual(['Calendar key', 'Webhook token']);
    expect(rows[0]?.users).toEqual([USER]);
    expect(rows[0]?.usesLabel).toBe('Used by 1 automation');
    expect(rows[1]?.usesLabel).toBe('Not used yet');
  });

  it('writes dates without a year in the current year', () => {
    expect(dayText('2026-10-02T12:00:00Z', NOW)).toBe('2 Oct');
    expect(dayText('2025-03-04T12:00:00Z', NOW)).toBe('4 Mar 2025');
  });

  it('shows the replaced date only when the value changed', () => {
    const rows = secretRows(ENTRIES, new Map(), NOW);
    expect(dateLine(rowAt(rows, 0))).toBe('Added 2 Oct · Value replaced 12 Oct');
    expect(dateLine(rowAt(rows, 1))).toBe('Added 4 Mar 2025');
  });

  it('pluralises the usage label', () => {
    expect(usesLabel(0)).toBe('Not used yet');
    expect(usesLabel(3)).toBe('Used by 3 automations');
  });

  it('groups users by secret id', () => {
    const grouped = usersBySecret([
      [A, USER],
      [A, { ...USER, name: 'Other' }],
      [B, USER],
    ]);
    expect(grouped.get(A)).toHaveLength(2);
    expect(grouped.get(B)).toHaveLength(1);
  });
});

describe('remove verdict', () => {
  it('refuses while used and lists the users', () => {
    const verdict = removeVerdict(rowAt(secretRows(ENTRIES, usersBySecret([[A, USER]]), NOW), 0));
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.title).toBe('Calendar key is still in use');
      expect(verdict.users).toEqual([USER]);
    }
  });

  it('allows an unused secret', () => {
    const rows = secretRows(ENTRIES, new Map(), NOW);
    expect(removeVerdict(rowAt(rows, 0))).toEqual({ allowed: true });
  });
});

describe('write-only sheet', () => {
  it('never prefills the value when replacing', () => {
    const rows = secretRows(ENTRIES, new Map(), NOW);
    expect(replaceDraft(rowAt(rows, 0))).toEqual({ name: 'Calendar key', value: '' });
  });

  it('names the sheet by intent', () => {
    const rows = secretRows(ENTRIES, new Map(), NOW);
    expect(sheetCopy(EMPTY_DRAFT, ENTRIES, null).submit).toBe('Save secret');
    const replacing = sheetCopy(replaceDraft(rowAt(rows, 0)), ENTRIES, rowAt(rows, 0));
    expect(replacing.title).toBe('Replace Calendar key');
    expect(replacing.replaces).toBe(true);
  });

  it('treats a typed existing name as a replacement', () => {
    const copy = sheetCopy({ name: ' Webhook token ', value: 'x' }, ENTRIES, null);
    expect(copy.replaces).toBe(true);
    expect(copy.valueLabel).toBe('New value');
  });

  it('reports issues only after the first attempt', () => {
    expect(draftIssues(EMPTY_DRAFT, false)).toEqual({ name: null, value: null });
    const issues = draftIssues(EMPTY_DRAFT, true);
    expect(issues.name).toBe('a secret needs a name');
    expect(issues.value).toBe('a secret needs a value');
  });

  it('builds a trimmed body only from a valid draft', () => {
    expect(draftBody(EMPTY_DRAFT)).toBeNull();
    expect(draftBody({ name: ' Key ', value: 'abc' })).toEqual({ name: 'Key', value: 'abc' });
  });
});
