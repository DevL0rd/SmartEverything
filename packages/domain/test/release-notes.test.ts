import { describe, expect, it } from 'vitest';
import {
  APP_PUBLICATION_INPUT,
  HUB_UPDATE_SOURCE_CHECK,
  RELEASE_NOTES,
  RELEASE_NOTES_MAX_LENGTH,
} from '../src';

describe('authored release notes', () => {
  it('trims outer whitespace and preserves multiline text', () => {
    const notes = 'Faster startup.\n\n- Improved background reconnect.';
    expect(RELEASE_NOTES.parse(`  ${notes}\n`)).toBe(notes);
  });

  it.each([
    { kind: 'null', notes: null },
    { kind: 'an array', notes: [] },
    { kind: 'blank', notes: ' \n ' },
    { kind: 'overlong', notes: 'a'.repeat(RELEASE_NOTES_MAX_LENGTH + 1) },
  ])('rejects $kind notes', ({ notes }) => {
    expect(RELEASE_NOTES.safeParse(notes).success).toBe(false);
  });

  it.each(['app', 'ui'])('allows full-length notes when publishing %s updates', (action) => {
    const runId = '00000000-0000-4000-8000-000000000001';
    const notes = 'a'.repeat(RELEASE_NOTES_MAX_LENGTH);
    expect(APP_PUBLICATION_INPUT.parse({ action, runId, notes }).notes).toBe(notes);
    expect(APP_PUBLICATION_INPUT.safeParse({ action, runId, notes: `${notes}a` }).success).toBe(
      false,
    );
  });
});

describe('Hub source check notes', () => {
  const result = {
    remote: 'origin',
    branch: 'main',
    head: 'a'.repeat(40),
    tip: 'b'.repeat(40),
    relation: 'remote_ahead',
    availableUpdate: 'source_ahead',
    pending: { staged: 0, unstaged: 0, untracked: 0, conflicts: 0 },
  };

  it('allows available source offers that predate authored notes', () => {
    expect(HUB_UPDATE_SOURCE_CHECK.parse(result)).not.toHaveProperty('notes');
  });

  it('accepts the one authored notes field and rejects unknown fields', () => {
    const notes = 'Faster startup.\n\n- Improved background reconnect.';
    expect(HUB_UPDATE_SOURCE_CHECK.parse({ ...result, notes }).notes).toBe(notes);
    expect(HUB_UPDATE_SOURCE_CHECK.safeParse({ ...result, changelog: notes }).success).toBe(false);
  });
});
