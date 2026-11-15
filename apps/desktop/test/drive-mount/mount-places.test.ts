import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Logger } from '@smarteverything/logging';
import {
  MountPlaces,
  gtkBookmarksWith,
  kdePlacesWith,
  nodePlacesFs,
  placesFilesOf,
  type MountPlace,
} from '../../src/drive-mount/mount-places.js';

const AREA = '/run/user/1000/smarteverything';
const PHOTOS: MountPlace = {
  placementId: '11111111-1111-4111-8111-111111111111',
  point: `${AREA}/Photos & Films`,
  name: 'Photos & Films',
};
const HOME = ` <bookmark href="file:///home/u">
  <title>Home</title>
  <info>
   <metadata owner="http://www.kde.org">
    <ID>1779657843/0</ID>
   </metadata>
  </info>
 </bookmark>
`;
const KDE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xbel>
<xbel xmlns:bookmark="http://www.freedesktop.org/standards/desktop-bookmarks">
${HOME}</xbel>
`;

const scratch = join(process.cwd(), 'tmp', 'mount-location', 'places');

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('file manager places', () => {
  it('adds one KDE place per mount and removes only its own entries', () => {
    const added = kdePlacesWith(KDE, [PHOTOS]);
    expect(added).toContain(HOME);
    expect(added).toContain(
      '<bookmark href="file:///run/user/1000/smarteverything/Photos%20&amp;%20Films">',
    );
    expect(added).toContain('<title>Photos &amp; Films</title>');
    expect(added).toContain(`<ID>smarteverything-mount/${PHOTOS.placementId}</ID>`);
    expect(added.endsWith('</xbel>\n')).toBe(true);
    expect(kdePlacesWith(added, [PHOTOS])).toBe(added);
    expect(kdePlacesWith(added, [])).toBe(KDE);
    expect(() => kdePlacesWith('<xbel>', [])).toThrow(/closing xbel/);
  });

  it('adds GTK bookmarks in the mount area and keeps the others', () => {
    const other = 'file:///home/u/Music Music\n';
    const added = gtkBookmarksWith(other, AREA, [PHOTOS]);
    expect(added).toBe(
      `${other}file:///run/user/1000/smarteverything/Photos%20&%20Films Photos & Films\n`,
    );
    expect(gtkBookmarksWith(added, AREA, [])).toBe(other);
    expect(gtkBookmarksWith(null, AREA, [])).toBe('');
  });

  it('names the files from the XDG folders', () => {
    expect(placesFilesOf({}, '/home/u', AREA)).toEqual({
      kde: '/home/u/.local/share/user-places.xbel',
      gtk: '/home/u/.config/gtk-3.0/bookmarks',
      area: AREA,
    });
    expect(placesFilesOf({ XDG_DATA_HOME: '/d', XDG_CONFIG_HOME: '/c' }, '/home/u', AREA)).toEqual({
      kde: '/d/user-places.xbel',
      gtk: '/c/gtk-3.0/bookmarks',
      area: AREA,
    });
  });

  it('writes both files, leaves a missing KDE file alone and cleans up on unmount', async () => {
    const files = {
      kde: join(scratch, 'user-places.xbel'),
      gtk: join(scratch, 'gtk', 'bookmarks'),
      area: AREA,
    };
    const places = new MountPlaces(files, nodePlacesFs, new Logger('desktop.test'));
    await places.show([PHOTOS]);
    await expect(readFile(files.kde, 'utf8')).rejects.toThrow();
    expect(await readFile(files.gtk, 'utf8')).toContain('Photos & Films');
    await mkdir(scratch, { recursive: true });
    await writeFile(files.kde, KDE);
    await places.show([PHOTOS]);
    expect(await readFile(files.kde, 'utf8')).toContain('smarteverything-mount/');
    await places.show([]);
    expect(await readFile(files.kde, 'utf8')).toBe(KDE);
    expect(await readFile(files.gtk, 'utf8')).toBe('');
  });
});
