import { describe, expect, it } from 'vitest';
import { UNSET_FITNESS_GOALS, type ProfileRow } from '@smarteverything/domain';
import { AlbumSharingBar, PartnerTab, SharingScreen } from './index';
import { albumLinkRequest } from './link-sheet';
import { outsidersOf } from './members-sheet';
import { savedText } from './partner-tab';

const ALBUM = 'a1b2c3d4-0000-4000-8000-000000000010';
const NOW = Date.parse('2026-11-15T12:00:00Z');

describe('sharing screens', () => {
  it('loads every screen module', () => {
    expect(
      [SharingScreen, AlbumSharingBar, PartnerTab].every((part) => typeof part === 'function'),
    ).toBe(true);
  });

  it('asks for a link to the album with the chosen access, end and password', () => {
    expect(
      albumLinkRequest(ALBUM, { permission: 'download', end: 'week', password: 'pine' }, NOW),
    ).toEqual({
      albumId: ALBUM,
      permission: 'download',
      expiresAt: '2026-11-22T12:00:00.000Z',
      password: 'pine',
    });
    expect(
      albumLinkRequest(ALBUM, { permission: 'view', end: 'never', password: '' }, NOW),
    ).toBeNull();
  });

  it('offers only people outside the album when adding people', () => {
    const profile = (id: string, name: string): ProfileRow => ({
      id,
      name,
      colour: 'aqua',
      sex: null,
      birth_date: null,
      height_cm: null,
      scale_user: null,
      fitness_goals: UNSET_FITNESS_GOALS,
      max_heart_rate: null,
      position: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    const album = {
      id: ALBUM,
      title: 'Trip',
      surface: 'photos' as const,
      scope: 'person' as const,
      ownerProfileId: 'owner',
      coverItemId: null,
      itemCount: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      kind: 'manual' as const,
    };
    const people = [profile('owner', 'Me'), profile('ana', 'Ana'), profile('ben', 'Ben')];
    expect(outsidersOf(people, album, ['ana']).map((person) => person.name)).toEqual(['Ben']);
  });

  it('says how many partner photos were saved', () => {
    expect(savedText(3, 3)).toBe('Saved 3 photos to your library');
    expect(savedText(0, 1)).toBe('That photo is already in your library');
    expect(savedText(0, 4)).toBe('These photos are already in your library');
  });
});
