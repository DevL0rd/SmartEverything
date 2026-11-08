import { describe, expect, it } from 'vitest';
import { HOME_MAP_MAP_ID, type HomeMapScan } from '@smarteverything/domain';
import { scanSourceOf } from '../../../components/house-map/3d/map-3d-protocol';
import { scanLinkKey, shownHashOf, shownScanOf } from './scan-link';

const FILE = 'a'.repeat(64);
const LOD = 'b'.repeat(64);
const MAP = HOME_MAP_MAP_ID.parse('map-1');
const SIGNED = 'https://hub.test/media/home-maps/map-1/scans/abc?expires=1&signature=x';

function scanOf(lod: string | null): HomeMapScan {
  return {
    file: { hash: FILE, format: 'spz', bytes: 10, name: 'house.spz' },
    lod: lod === null ? null : { hash: lod, bytes: 5 },
    transform: { tx: 0, ty: 0, tz: 0, yawDeg: 0, scale: 1, levelled: false },
    opacity: 1,
    points: [],
    residualM: null,
    uploadedAt: '2026-10-25T10:00:00.000Z',
    uploadedBy: 'person-1',
  };
}

describe('the shown scan link', () => {
  it('asks for the file the realistic view draws, the converted one when there is one', () => {
    expect(shownHashOf(scanOf(null))).toBe(FILE);
    expect(shownHashOf(scanOf(LOD))).toBe(LOD);
  });

  it('keys the link by map and content hash so a replaced scan asks again', () => {
    expect(scanLinkKey(MAP, FILE)).toStrictEqual(['home-map-scan-link', MAP, FILE]);
    expect(scanLinkKey(MAP, FILE)).not.toStrictEqual(scanLinkKey(MAP, LOD));
  });

  it('shows no scan until its signed link is there, then draws from that link', () => {
    const scan = scanOf(LOD);
    expect(shownScanOf(scan, null).scan).toBeNull();
    expect(shownScanOf(null, SIGNED).scan).toBeNull();
    const shown = shownScanOf(scan, SIGNED);
    expect(shown.scan).toBe(scan);
    expect(scanSourceOf(MAP, shown.scan, shown.urlOf)).toStrictEqual({
      key: `${MAP}:lod:${LOD}`,
      url: SIGNED,
      format: 'rad',
    });
  });
});
