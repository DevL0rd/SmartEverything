import { describe, expect, it } from 'vitest';
import type { FilePlace } from '../../files';
import { crumbsOf } from '../source/computer-crumbs';
import { locationOfParam, paramOfLocation } from './computer-route';

function place(key: string, label: string, kind: FilePlace['kind']): FilePlace {
  return { key, label, kind, location: { place: key, folder: null } };
}

const PLACES: readonly FilePlace[] = [
  place('/home/alex', 'Home', 'home'),
  place('/', 'Computer', 'root'),
  place('/home/alex/Documents', 'Documents', 'folder'),
  place('/media/alex/Backup', 'Backup', 'volume'),
  place('trash', 'Trash', 'trash'),
];

const WINDOWS: readonly FilePlace[] = [
  place('C:\\Users\\alex', 'Home', 'home'),
  place('C:\\', 'C:', 'volume'),
  place('D:\\', 'D:', 'volume'),
];

describe('the computer page route', () => {
  it('opens the home place when there is no path', () => {
    expect(locationOfParam(undefined, PLACES, '/home/alex')).toEqual({
      place: '/home/alex',
      folder: null,
    });
    expect(locationOfParam('  ', PLACES, '/home/alex')).toEqual({
      place: '/home/alex',
      folder: null,
    });
  });

  it('waits for the places while the home folder is not known', () => {
    expect(locationOfParam(undefined, [], null)).toBeNull();
  });

  it('puts a path in the deepest place that holds it', () => {
    expect(locationOfParam('/home/alex/Documents/Taxes/', PLACES, null)).toEqual({
      place: '/home/alex/Documents',
      folder: '/home/alex/Documents/Taxes',
    });
    expect(locationOfParam('/home/alex/Music', PLACES, null)).toEqual({
      place: '/home/alex',
      folder: '/home/alex/Music',
    });
    expect(locationOfParam('/etc/ssh', PLACES, null)).toEqual({ place: '/', folder: '/etc/ssh' });
    expect(locationOfParam('/media/alex/Backup', PLACES, null)).toEqual({
      place: '/media/alex/Backup',
      folder: null,
    });
  });

  it('reads Windows paths against their drives', () => {
    expect(locationOfParam('D:\\Games\\Saves', WINDOWS, null)).toEqual({
      place: 'D:\\',
      folder: 'D:\\Games\\Saves',
    });
    expect(locationOfParam('C:\\Users\\alex\\Desktop', WINDOWS, null)).toEqual({
      place: 'C:\\Users\\alex',
      folder: 'C:\\Users\\alex\\Desktop',
    });
  });

  it('opens a path before the places are known from its root', () => {
    expect(locationOfParam('/home/alex/Music', [], null)).toEqual({
      place: '/',
      folder: '/home/alex/Music',
    });
  });

  it('keeps Trash as its own place', () => {
    expect(locationOfParam('trash', PLACES, '/home/alex')).toEqual({
      place: 'trash',
      folder: null,
    });
    expect(paramOfLocation({ place: 'trash', folder: null })).toBe('trash');
  });

  it('writes the folder path, or the place, back into the route', () => {
    expect(paramOfLocation({ place: '/home/alex', folder: '/home/alex/Music' })).toBe(
      '/home/alex/Music',
    );
    expect(paramOfLocation({ place: '/home/alex', folder: null })).toBe('/home/alex');
  });

  it('round trips a folder through the route', () => {
    const start = { place: '/home/alex', folder: '/home/alex/Music/Live' };
    expect(locationOfParam(paramOfLocation(start), PLACES, null)).toEqual(start);
  });

  it('names the crumbs from the places', () => {
    const location = locationOfParam('/home/alex/Music/Live', PLACES, null);
    expect(location).not.toBeNull();
    if (location === null) return;
    expect(crumbsOf(location, PLACES).map((crumb) => crumb.label)).toEqual([
      'Home',
      'Music',
      'Live',
    ]);
    const deep = locationOfParam('/home/alex/Documents/Taxes', PLACES, null);
    if (deep === null) return;
    expect(crumbsOf(deep, PLACES).map((crumb) => crumb.label)).toEqual(['Documents', 'Taxes']);
  });
});
