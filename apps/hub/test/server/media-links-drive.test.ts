import { ApiError } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { MediaLinks } from '../../src/server/media-links';
import { captureLogs } from '../support/logs';

const ITEM = '0e000000-0000-4000-8000-000000000001';

function urlOf(link: { readonly url: string }): URL {
  return new URL(link.url, 'http://hub.local');
}

describe('signed Drive links', () => {
  captureLogs();
  const links = new MediaLinks(() => new Date('2026-11-14T00:00:00.000Z'));

  it('verifies the plain file link as an inline view', () => {
    expect(links.verifyDrive(urlOf(links.driveFile(ITEM, 3)))).toMatchObject({
      rev: 3,
      download: false,
    });
  });

  it('verifies a download link as a download', () => {
    const link = links.driveDownload(ITEM, 3);
    expect(link.url).toContain(`/media/drive/${ITEM}`);
    expect(links.verifyDrive(urlOf(link))).toMatchObject({ rev: 3, download: true });
  });

  it('refuses to turn a view link into a download by adding the flag', () => {
    const url = urlOf(links.driveFile(ITEM, 3));
    url.searchParams.set('download', '1');
    expect(() => links.verifyDrive(url)).toThrow(ApiError);
  });

  it('signs the folder icon like a derived image', () => {
    const link = links.driveFolderIcon(ITEM, 2);
    expect(link.url.startsWith(`/media/drive/${ITEM}/icon?`)).toBe(true);
    expect(links.verifyDrive(urlOf(link))).toMatchObject({ rev: 2, download: false });
  });
});
