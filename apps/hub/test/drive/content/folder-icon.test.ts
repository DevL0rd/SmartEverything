import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appleDoubleIconPng } from '../../../src/drive/content/folder-icon/apple-double';
import { desktopIniIcon } from '../../../src/drive/content/folder-icon/desktop-ini';
import { directoryFileIcon } from '../../../src/drive/content/folder-icon/directory-file';
import { detectFolderIcon, iconReference } from '../../../src/drive/content/folder-icon/detect';
import { isPng, largestIcnsPng } from '../../../src/drive/content/folder-icon/icns';
import { icoImagePng } from '../../../src/drive/content/folder-icon/ico';
import { ICON_EDGE, renderFolderIcon } from '../../../src/drive/content/folder-icon/render';
import { appleDoubleOf, dibOf, icnsOf, icoOf, pngOf, solid } from './builders';

const RED = [255, 0, 0, 255] as const;
const GREEN = [0, 255, 0, 255] as const;
const BLUE = [0, 0, 255, 255] as const;

async function pixel(png: Uint8Array, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * 4;
  return [...data.subarray(at, at + 4)];
}

async function dimensions(png: Uint8Array): Promise<readonly [number, number]> {
  const meta = await sharp(png).metadata();
  return [meta.width, meta.height];
}

describe('desktop.ini', () => {
  it('prefers IconResource and drops the icon index', () => {
    expect(
      desktopIniIcon(
        '[.ShellClassInfo]\r\nIconResource=art\\blue.ico,0\r\nIconFile=other.ico\r\nIconIndex=0\r\n',
      ),
    ).toBe('art\\blue.ico');
  });

  it('falls back to IconFile and ignores other sections', () => {
    expect(
      desktopIniIcon('[ViewState]\nIconFile=wrong.ico\n[.ShellClassInfo]\nIconFile=right.ico\n'),
    ).toBe('right.ico');
    expect(desktopIniIcon('[.ShellClassInfo]\nInfoTip=nothing\n')).toBeNull();
  });
});

describe('.directory', () => {
  it('reads Icon from the Desktop Entry section only', () => {
    expect(
      directoryFileIcon(
        '[Settings]\nIcon=nope.png\n[Desktop Entry]\nIcon=./folder/pic.png\nName=x\n',
      ),
    ).toBe('./folder/pic.png');
    expect(directoryFileIcon('[Desktop Entry]\nName=only\n')).toBeNull();
  });
});

describe('icon references', () => {
  const root = '/drive';

  it('resolves relative and absolute-inside references into the drive', () => {
    expect(iconReference('art/pic.png', 'books', root)).toBe('books/art/pic.png');
    expect(iconReference('../shared/pic.PNG', 'books', root)).toBe('shared/pic.PNG');
    expect(iconReference('/drive/icons/pic.ico', 'books', root)).toBe('icons/pic.ico');
    expect(iconReference('file:///drive/icons/a%20b.png', 'books', root)).toBe('icons/a b.png');
    expect(iconReference('"art\\pic.ico"', 'books', root)).toBe('books/art/pic.ico');
  });

  it('skips icon theme names, libraries, outside paths and Windows system paths', () => {
    expect(iconReference('folder-blue', 'books', root)).toBeNull();
    expect(iconReference('shell32.dll', 'books', root)).toBeNull();
    expect(iconReference('%SystemRoot%\\system32\\imageres.dll', 'books', root)).toBeNull();
    expect(iconReference('C:\\Icons\\mine.ico', 'books', root)).toBeNull();
    expect(iconReference('/etc/icons/x.png', 'books', root)).toBeNull();
    expect(iconReference('../../x.png', 'books', root)).toBeNull();
  });
});

describe('ICO decoding', () => {
  it('returns the PNG entry of the largest image', async () => {
    const small = await pngOf(16, 16, solid(16, 16, RED));
    const large = await pngOf(48, 48, solid(48, 48, GREEN));
    const ico = icoOf([
      { width: 16, height: 16, bitCount: 32, data: small },
      { width: 48, height: 48, bitCount: 32, data: large },
    ]);
    const png = await icoImagePng(ico);
    expect(isPng(png)).toBe(true);
    expect(await dimensions(png)).toEqual([48, 48]);
    expect(await pixel(png, 3, 3)).toEqual([...GREEN]);
  });

  it('decodes a 32-bit bitmap with alpha, bottom-up', async () => {
    const dib = dibOf({
      width: 4,
      height: 4,
      bits: 32,
      pixel: (x, y) => (y === 0 ? [255, 0, 0, 255] : x === 0 ? [0, 0, 255, 128] : [0, 255, 0, 255]),
    });
    const png = await icoImagePng(icoOf([{ width: 4, height: 4, bitCount: 32, data: dib }]));
    expect(await pixel(png, 2, 0)).toEqual([...RED]);
    expect(await pixel(png, 0, 2)).toEqual([0, 0, 255, 128]);
    expect(await pixel(png, 2, 2)).toEqual([...GREEN]);
  });

  it('decodes a 24-bit bitmap using its AND mask for transparency', async () => {
    const dib = dibOf({
      width: 8,
      height: 2,
      bits: 24,
      pixel: (x) => (x < 4 ? [10, 20, 30, 255] : [0, 0, 0, 0]),
    });
    const png = await icoImagePng(icoOf([{ width: 8, height: 2, bitCount: 24, data: dib }]));
    expect(await pixel(png, 1, 0)).toEqual([10, 20, 30, 255]);
    expect((await pixel(png, 6, 1))[3]).toBe(0);
  });

  it('decodes an 8-bit paletted bitmap', async () => {
    const palette = Array.from({ length: 256 }, (_, index) =>
      index === 1 ? ([200, 100, 50] as const) : ([0, 0, 0] as const),
    );
    const dib = dibOf({ width: 4, height: 4, bits: 8, pixel: () => [1, 0, 0, 255], palette });
    const png = await icoImagePng(icoOf([{ width: 4, height: 4, bitCount: 8, data: dib }]));
    expect(await pixel(png, 1, 1)).toEqual([200, 100, 50, 255]);
  });

  it('uses the mask when a 32-bit bitmap carries no alpha at all', async () => {
    const dib = dibOf({
      width: 8,
      height: 2,
      bits: 32,
      pixel: (x) => (x < 4 ? [9, 9, 9, 255] : [0, 0, 0, 0]),
    });
    const flat = Buffer.from(dib);
    const view = new DataView(flat.buffer, flat.byteOffset, flat.byteLength);
    for (let at = 40; at < 40 + 8 * 2 * 4; at += 4) view.setUint8(at + 3, 0);
    const png = await icoImagePng(icoOf([{ width: 8, height: 2, bitCount: 32, data: flat }]));
    expect((await pixel(png, 1, 0))[3]).toBe(255);
    expect((await pixel(png, 6, 0))[3]).toBe(0);
  });

  it('rejects data that is not an icon', async () => {
    await expect(icoImagePng(Buffer.from('plain text file'))).rejects.toThrow('not an icon');
  });
});

describe('ICNS and AppleDouble', () => {
  it('picks the largest PNG element of an icns file and skips other formats', async () => {
    const small = await pngOf(16, 16, solid(16, 16, RED));
    const large = await pngOf(64, 64, solid(64, 64, BLUE));
    const icns = icnsOf([
      { type: 'is32', data: Buffer.from('rle bytes that are not png') },
      { type: 'ic07', data: small },
      { type: 'ic08', data: large },
    ]);
    const png = largestIcnsPng(icns);
    expect(png).not.toBeNull();
    expect(await dimensions(png ?? new Uint8Array())).toEqual([64, 64]);
    expect(largestIcnsPng(Buffer.from('not icns'))).toBeNull();
  });

  it('finds the icns resource inside the resource fork of an AppleDouble sidecar', async () => {
    const png = await pngOf(32, 32, solid(32, 32, GREEN));
    const sidecar = appleDoubleOf(icnsOf([{ type: 'ic07', data: png }]));
    const found = appleDoubleIconPng(sidecar);
    expect(found).not.toBeNull();
    expect(await pixel(found ?? new Uint8Array(), 5, 5)).toEqual([...GREEN]);
    expect(appleDoubleIconPng(Buffer.from('not apple double'))).toBeNull();
  });
});

describe('rendering', () => {
  it('fits any source inside 128 px as a PNG and hashes the source bytes', async () => {
    const wide = await sharp({ create: { width: 400, height: 200, channels: 4, background: RED } })
      .png()
      .toBuffer();
    const rendered = await renderFolderIcon(wide);
    expect(await dimensions(rendered.png)).toEqual([ICON_EDGE, 64]);
    expect(rendered.sha256).toMatch(/^[0-9a-f]{64}$/u);
    await expect(renderFolderIcon(Buffer.from('not an image'))).rejects.toThrow('not an image');
  });
});

describe('detecting a folder icon on disk', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'drive-icons-'));
    await mkdir(join(root, 'folder'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function place(path: string, data: Uint8Array | string): Promise<void> {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), data);
  }

  const png = (colour: readonly [number, number, number, number]): Promise<Buffer> =>
    pngOf(8, 8, solid(8, 8, colour));

  it('returns nothing for a folder with no icon file', async () => {
    await place('folder/readme.txt', 'x');
    expect(await detectFolderIcon(root, 'folder')).toBeNull();
  });

  it('reads a named file case-insensitively', async () => {
    await place('folder/Folder.PNG', await png(GREEN));
    const found = await detectFolderIcon(root, 'folder');
    expect(found).toMatchObject({ source: 'named_file', relPath: 'folder/Folder.PNG' });
    expect(await pixel(found?.png ?? new Uint8Array(), 1, 1)).toEqual([...GREEN]);
  });

  it('follows the named file order, folder.ico before icon.png', async () => {
    await place('folder/icon.png', await png(BLUE));
    await place(
      'folder/folder.ico',
      icoOf([{ width: 8, height: 8, bitCount: 32, data: await png(RED) }]),
    );
    expect((await detectFolderIcon(root, 'folder'))?.relPath).toBe('folder/folder.ico');
  });

  it('prefers .directory, then desktop.ini, then the mac icon, then named files', async () => {
    await place('folder/folder.png', await png(BLUE));
    await place(
      'folder/._Icon\r',
      appleDoubleOf(icnsOf([{ type: 'ic07', data: await png(GREEN) }])),
    );
    expect((await detectFolderIcon(root, 'folder'))?.source).toBe('mac_icon');
    await place('folder/Desktop.ini', '[.ShellClassInfo]\r\nIconResource=mine.png,0\r\n');
    await place('folder/mine.png', await png(RED));
    const ini = await detectFolderIcon(root, 'folder');
    expect(ini).toMatchObject({ source: 'desktop_ini', relPath: 'folder/mine.png' });
    await place('folder/.directory', '[Desktop Entry]\nIcon=kde.png\n');
    await place('folder/kde.png', await png(GREEN));
    const kde = await detectFolderIcon(root, 'folder');
    expect(kde).toMatchObject({ source: 'directory_file', relPath: 'folder/kde.png' });
    expect(await pixel(kde?.png ?? new Uint8Array(), 1, 1)).toEqual([...GREEN]);
  });

  it('finds a Windows reference with different case and backslashes', async () => {
    await place('folder/desktop.ini', '[.ShellClassInfo]\r\nIconResource=Art\\Blue.ICO,0\r\n');
    await place(
      'folder/art/blue.ico',
      icoOf([{ width: 8, height: 8, bitCount: 32, data: await png(BLUE) }]),
    );
    expect(await detectFolderIcon(root, 'folder')).toMatchObject({
      source: 'desktop_ini',
      relPath: 'folder/art/blue.ico',
    });
  });

  it('skips icon theme names and .dll icons and goes on to the next rule', async () => {
    await place('folder/.directory', '[Desktop Entry]\nIcon=folder-blue\n');
    await place(
      'folder/desktop.ini',
      '[.ShellClassInfo]\nIconResource=%SystemRoot%\\system32\\shell32.dll,3\n',
    );
    await place('folder/icon.png', await png(GREEN));
    expect(await detectFolderIcon(root, 'folder')).toMatchObject({
      source: 'named_file',
      relPath: 'folder/icon.png',
    });
  });

  it('skips a reference to a missing or unreadable image and goes on', async () => {
    await place('folder/.directory', '[Desktop Entry]\nIcon=missing.png\n');
    await place('folder/desktop.ini', '[.ShellClassInfo]\nIconFile=broken.ico\n');
    await place('folder/broken.ico', 'not an icon');
    await place(
      'folder/folder.jpg',
      await sharp({ create: { width: 8, height: 8, channels: 3, background: RED } })
        .jpeg()
        .toBuffer(),
    );
    expect((await detectFolderIcon(root, 'folder'))?.source).toBe('named_file');
  });

  it('refuses a reference that leaves the drive through a link', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'drive-icons-outside-'));
    try {
      await writeFile(join(outside, 'secret.png'), await png(RED));
      await symlink(outside, join(root, 'folder', 'link'));
      await place('folder/.directory', '[Desktop Entry]\nIcon=link/secret.png\n');
      expect(await detectFolderIcon(root, 'folder')).toBeNull();
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
