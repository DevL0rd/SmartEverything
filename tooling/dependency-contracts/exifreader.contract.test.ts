import { readFileSync } from 'node:fs';
import ExifReader from 'exifreader';
import { describe, expect, it } from 'vitest';
import { declaredVersion, HUB_MANIFEST } from './contract-helpers';
import { installedVersion, repositoryFile } from './versions';

const fixture = (name: string): Buffer =>
  readFileSync(repositoryFile(`apps/hub/test/fixtures/drive-media/${name}`));

describe('exifreader contract', () => {
  it('is declared at the installed version by the hub', () => {
    expect(declaredVersion(HUB_MANIFEST, 'exifreader')).toBe(installedVersion('exifreader'));
  });

  it('groups the tags of a JPEG and describes the values the drive reads', () => {
    expect(ExifReader.load(fixture('exif-full.jpg'), { expanded: true })).toMatchObject({
      exif: {
        DateTimeOriginal: { description: '2025:06:14 09:30:15' },
        OffsetTimeOriginal: { description: '+07:00' },
        FNumber: { value: [14, 5] },
        ExposureTime: { value: [1, 250] },
        Orientation: { value: 6 },
      },
      file: { 'Image Width': { value: 96 } },
      gps: { Latitude: 13.7563, Longitude: 100.5018 },
    });
  });

  it('reads a HEIC and a TIFF based RAW container', () => {
    expect(ExifReader.load(fixture('exif-full.heic'), { expanded: true })).toMatchObject({
      exif: { Model: { description: 'ILCE-7M4' } },
    });
    expect(ExifReader.load(fixture('synthetic.arw'), { expanded: true })).toMatchObject({
      exif: { ImageWidth: { value: 96 } },
    });
  });

  it('keeps the size of a PNG in its own group', () => {
    const tags = ExifReader.load(fixture('screenshot.png'), { expanded: true });
    expect(tags).toMatchObject({ pngFile: { 'Image Width': { value: 64 } } });
    expect(tags).not.toHaveProperty('exif');
  });

  it('refuses bytes that are no image', () => {
    expect(() => ExifReader.load(Buffer.from('not an image at all'), { expanded: true })).toThrow();
  });
});
