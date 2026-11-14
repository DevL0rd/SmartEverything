import { describe, expect, it } from 'vitest';
import type { DriveRoot } from '@smarteverything/domain';
import { bytes, count } from '../../../format/number';
import { personalRootRow, rootRow } from '../data/fixtures';
import {
  SHARED_LOCKED_NOTE,
  driveSettingsCardsOf,
  driveStateLineOf,
  driveTilesOf,
} from './drive-card-model';

const MINE = '00000000-0000-4000-8000-000000000201';
const HOME = '00000000-0000-4000-8000-000000000202';
const THEIRS = '00000000-0000-4000-8000-000000000203';
const ME = '00000000-0000-4000-8000-000000000301';
const OTHER = '00000000-0000-4000-8000-000000000302';
const NOW = Date.parse('2026-11-14T12:00:00.000Z');

const ROOTS: readonly DriveRoot[] = [
  rootRow(HOME, 'ready'),
  personalRootRow(THEIRS, OTHER),
  personalRootRow(MINE, ME),
];

describe('driveSettingsCardsOf', () => {
  it('shows My Drive then the Shared Drive and never another person’s drive', () => {
    const cards = driveSettingsCardsOf(ROOTS, ME, true);
    expect(cards.map((card) => [card.label, card.root.id])).toEqual([
      ['My Drive', MINE],
      ['Shared Drive', HOME],
    ]);
  });

  it('lets the owner change the Shared Drive and everyone their own drive', () => {
    const cards = driveSettingsCardsOf(ROOTS, ME, true);
    expect(cards.map((card) => [card.editable, card.note])).toEqual([
      [true, null],
      [true, null],
    ]);
  });

  it('shows a member the Shared Drive read only with a note', () => {
    const cards = driveSettingsCardsOf(ROOTS, ME, false);
    expect(cards.map((card) => [card.label, card.editable, card.note])).toEqual([
      ['My Drive', true, null],
      ['Shared Drive', false, SHARED_LOCKED_NOTE],
    ]);
  });

  it('shows no cards before the Hub has made the drives', () => {
    expect(driveSettingsCardsOf([], ME, false)).toEqual([]);
  });
});

describe('driveStateLineOf', () => {
  it('says a ready drive is up to date and when it was read', () => {
    const root = { ...rootRow(HOME, 'ready'), scannedAt: '2026-11-14T10:00:00.000Z' };
    expect(driveStateLineOf(root, NOW)).toEqual({
      text: 'Up to date · read 2 h ago',
      tone: 'positive',
    });
    expect(driveStateLineOf(rootRow(HOME, 'ready'), NOW)).toEqual({
      text: 'Up to date',
      tone: 'positive',
    });
  });

  it('names reading, a silent disk, a broken drive and damaged files', () => {
    expect(driveStateLineOf(rootRow(HOME, 'scanning'), NOW)).toEqual({
      text: 'Reading files',
      tone: 'info',
    });
    expect(driveStateLineOf({ ...rootRow(HOME, 'ready'), state: 'unresponsive' }, NOW)).toEqual({
      text: 'The data disk is not answering',
      tone: 'warning',
    });
    expect(
      driveStateLineOf(
        { ...rootRow(HOME, 'ready'), state: 'error', stateReason: 'Marker missing' },
        NOW,
      ),
    ).toEqual({ text: 'This drive cannot be read · Marker missing', tone: 'critical' });
    const damaged = rootRow(HOME, 'ready');
    expect(
      driveStateLineOf({ ...damaged, health: { ...damaged.health, corrupt: 2 } }, NOW),
    ).toEqual({ text: '2 damaged files found', tone: 'warning' });
  });
});

describe('driveTilesOf', () => {
  it('shows the size, files and folders of the drive', () => {
    const root = { ...rootRow(HOME, 'ready'), bytes: 5_000_000, items: 1234, folders: 56 };
    expect(driveTilesOf(root).map((tile) => [tile.label, tile.value])).toEqual([
      ['Size', bytes(5_000_000)],
      ['Files', count(1234)],
      ['Folders', count(56)],
    ]);
  });
});
