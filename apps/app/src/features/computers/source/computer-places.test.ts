import type { FilePlaces } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { crumbsOf, placeOfPath } from './computer-crumbs';
import { placesOfData } from './computer-places';

const PLACES: FilePlaces = {
  home: '/home/dana',
  abilities: ['write', 'trash'],
  places: [
    { label: 'Home', path: '/home/dana', kind: 'home' },
    { label: 'Documents', path: '/home/dana/Documents', kind: 'folder' },
    { label: 'Computer', path: '/', kind: 'root' },
    { label: 'Backup', path: '/mnt/backup', kind: 'drive' },
  ],
};

describe('computer places', () => {
  it('keys a place by its path and adds Trash when the computer has one', () => {
    const places = placesOfData(PLACES);
    expect(places.map((place) => [place.key, place.kind])).toEqual([
      ['/home/dana', 'home'],
      ['/home/dana/Documents', 'folder'],
      ['/', 'root'],
      ['/mnt/backup', 'volume'],
      ['trash', 'trash'],
    ]);
    expect(places.at(-1)?.location).toEqual({ place: 'trash', folder: null });
  });

  it('shows no Trash when the computer cannot trash and nothing before the places load', () => {
    expect(placesOfData({ ...PLACES, abilities: [] }).some((place) => place.kind === 'trash')).toBe(
      false,
    );
    expect(placesOfData(undefined)).toEqual([]);
  });

  it('uses the Trash place a computer lists itself', () => {
    const places = placesOfData({
      ...PLACES,
      places: [...PLACES.places, { label: 'Recycle Bin', path: '/trash', kind: 'trash' }],
    });
    expect(places.filter((place) => place.kind === 'trash')).toEqual([
      expect.objectContaining({ key: 'trash', label: 'Recycle Bin' }),
    ]);
  });

  it('puts a typed path under its root place', () => {
    expect(placeOfPath('/etc')).toEqual({ place: '/', folder: '/etc' });
    expect(placeOfPath('/')).toEqual({ place: '/', folder: null });
    expect(placeOfPath('C:\\Users')).toEqual({ place: 'C:\\', folder: 'C:\\Users' });
  });
});

describe('computer crumbs', () => {
  const places = placesOfData(PLACES);

  it('starts at the place and adds one crumb per folder below it', () => {
    const crumbs = crumbsOf({ place: '/home/dana', folder: '/home/dana/Projects/site' }, places);
    expect(crumbs.map((crumb) => crumb.label)).toEqual(['Home', 'Projects', 'site']);
    expect(crumbs.map((crumb) => crumb.location)).toEqual([
      { place: '/home/dana', folder: null },
      { place: '/home/dana', folder: '/home/dana/Projects' },
      { place: '/home/dana', folder: '/home/dana/Projects/site' },
    ]);
  });

  it('shows a single crumb at the place root', () => {
    expect(crumbsOf({ place: '/home/dana', folder: null }, places)).toHaveLength(1);
  });

  it('names the top of the drive Computer', () => {
    const crumbs = crumbsOf({ place: '/', folder: '/etc/ssh' }, []);
    expect(crumbs.map((crumb) => crumb.label)).toEqual(['Computer', 'etc', 'ssh']);
  });

  it('starts at the root when the folder is outside the place', () => {
    const crumbs = crumbsOf({ place: '/home/dana', folder: '/var/log' }, places);
    expect(crumbs.map((crumb) => crumb.label)).toEqual(['Computer', 'var', 'log']);
    expect(crumbs[1]?.location).toEqual({ place: '/', folder: '/var' });
  });

  it('shows Trash as the only crumb', () => {
    const crumbs = crumbsOf({ place: 'trash', folder: null }, places);
    expect(crumbs).toEqual([
      { key: 'trash', label: 'Trash', location: { place: 'trash', folder: null } },
    ]);
  });
});
