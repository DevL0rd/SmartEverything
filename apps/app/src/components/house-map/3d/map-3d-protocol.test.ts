import { describe, expect, it, vi, type Mock } from 'vitest';
import { HOME_MAP_SCAN_FORMATS, type HomeMapScan } from '@smarteverything/domain';
import {
  SCAN_BAND_MESSAGE,
  SCAN_FORMATS,
  SCAN_MESSAGE,
  SCAN_PLACEMENT_MESSAGE,
  VIEW_INSETS,
} from './map-3d-messages';
import { ScanSender, scanPlacementOf, scanSourceOf, type ScanHandle } from './map-3d-protocol';

const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);

function scanOf(hash: string, yawDeg = 0): HomeMapScan {
  return {
    file: { hash, format: 'spz', bytes: 71_500, name: 'house.spz' },
    lod: null,
    transform: { tx: 1, ty: 2, tz: 0, yawDeg, scale: 1, levelled: true },
    opacity: 0.8,
    points: [],
    residualM: null,
    uploadedAt: '2026-10-25T10:00:00.000Z',
    uploadedBy: 'person-1',
  };
}

const urlOf = (mapId: string, variant: string): string =>
  `https://hub.test/api/home-maps/${mapId}/scan/file?variant=${variant}`;

type Spy = Mock<(...args: readonly unknown[]) => void>;

interface FakeHandle extends ScanHandle {
  readonly setScan: Spy;
  readonly clearScan: Spy;
  readonly setScanPlacement: Spy;
  readonly setScanBand: Spy;
  readonly clearScanBand: Spy;
}

function fakeHandle(): FakeHandle {
  return {
    setScan: vi.fn(),
    clearScan: vi.fn(),
    setScanPlacement: vi.fn(),
    setScanBand: vi.fn(),
    clearScanBand: vi.fn(),
  };
}

function connected(): { sender: ScanSender; handle: FakeHandle } {
  const handle = fakeHandle();
  const sender = new ScanSender(() => handle);
  sender.ready();
  return { sender, handle };
}

function show(sender: ScanSender, scan: HomeMapScan, mapId = 'map-1'): void {
  sender.show(scanSourceOf(mapId, scan, urlOf), scanPlacementOf(scan));
}

describe('scan message', () => {
  it('accepts exactly the stored scan formats', () => {
    expect([...SCAN_FORMATS].sort()).toEqual([...HOME_MAP_SCAN_FORMATS].sort());
  });

  it('sends nothing to a fresh view for a map without a scan or band', () => {
    const { sender, handle } = connected();
    sender.show(null, null);
    sender.setBand(null);
    expect(handle.clearScan).not.toHaveBeenCalled();
    expect(handle.clearScanBand).not.toHaveBeenCalled();
  });
});

describe('scanSourceOf', () => {
  it('keys the scan by its map and file hash and points at the original file', () => {
    expect(scanSourceOf('map-1', scanOf(HASH), urlOf)).toEqual({
      key: `map-1:original:${HASH}`,
      url: urlOf('map-1', 'original'),
      format: 'spz',
    });
  });

  it('prefers the level-of-detail file once it exists', () => {
    const scan = { ...scanOf(HASH), lod: { hash: OTHER_HASH, bytes: 9 } };
    expect(scanSourceOf('map-1', scan, urlOf)).toEqual({
      key: `map-1:lod:${OTHER_HASH}`,
      url: urlOf('map-1', 'lod'),
      format: 'rad',
    });
  });

  it('has no source without a scan', () => {
    expect(scanSourceOf('map-1', null, urlOf)).toBeNull();
  });
});

describe('ScanSender', () => {
  it('sends the scan message once per scan change', () => {
    const { sender, handle } = connected();
    show(sender, scanOf(HASH));
    show(sender, scanOf(HASH));
    show(sender, scanOf(HASH));
    expect(handle.setScan).toHaveBeenCalledTimes(1);
    expect(SCAN_MESSAGE.parse(handle.setScan.mock.calls[0])).toEqual([
      `map-1:original:${HASH}`,
      urlOf('map-1', 'original'),
      'spz',
    ]);
    show(sender, scanOf(OTHER_HASH));
    expect(handle.setScan).toHaveBeenCalledTimes(2);
    show(sender, scanOf(OTHER_HASH), 'map-2');
    expect(handle.setScan).toHaveBeenCalledTimes(3);
  });

  it('sends transform edits as small number messages without resending the scan', () => {
    const { sender, handle } = connected();
    show(sender, scanOf(HASH));
    show(sender, scanOf(HASH, 15));
    show(sender, scanOf(HASH, 30));
    expect(handle.setScan).toHaveBeenCalledTimes(1);
    expect(handle.setScanPlacement).toHaveBeenCalledTimes(3);
    const last = SCAN_PLACEMENT_MESSAGE.parse(handle.setScanPlacement.mock.calls[2]);
    expect(last).toEqual([1, 2, 0, 30, 1, 0.8]);
    expect(JSON.stringify(last).length).toBeLessThan(40);
  });

  it('does not resend an unchanged transform', () => {
    const { sender, handle } = connected();
    show(sender, scanOf(HASH));
    show(sender, scanOf(HASH));
    expect(handle.setScanPlacement).toHaveBeenCalledTimes(1);
  });

  it('clears the scan once when the map has none', () => {
    const { sender, handle } = connected();
    show(sender, scanOf(HASH));
    sender.show(null, null);
    sender.show(null, null);
    expect(handle.clearScan).toHaveBeenCalledTimes(1);
  });

  it('sends the floor band only when it changes', () => {
    const { sender, handle } = connected();
    sender.setBand({ bottom: 0, top: 2.6 });
    sender.setBand({ bottom: 0, top: 2.6 });
    sender.setBand({ bottom: 2.7, top: 5.4 });
    sender.setBand(null);
    expect(handle.setScanBand.mock.calls.map((call) => SCAN_BAND_MESSAGE.parse(call))).toEqual([
      [0, 2.6],
      [2.7, 5.4],
    ]);
    expect(handle.clearScanBand).toHaveBeenCalledTimes(1);
  });

  it('holds messages until the view is ready and sends the current state once on reconnect', () => {
    const handle = fakeHandle();
    const sender = new ScanSender(() => handle);
    show(sender, scanOf(HASH));
    show(sender, scanOf(HASH, 15));
    expect(handle.setScan).not.toHaveBeenCalled();
    sender.ready();
    expect(handle.setScan).toHaveBeenCalledTimes(1);
    expect(handle.setScanPlacement).toHaveBeenCalledTimes(1);
    sender.lost();
    show(sender, scanOf(HASH, 30));
    sender.ready();
    expect(handle.setScan).toHaveBeenCalledTimes(2);
    expect(handle.setScanPlacement).toHaveBeenCalledTimes(2);
  });
});

describe('view insets', () => {
  it('accepts the measured top and bottom bars', () => {
    expect(VIEW_INSETS.parse({ top: 64, bottom: 120.5 })).toEqual({ top: 64, bottom: 120.5 });
    expect(VIEW_INSETS.parse({ top: 0, bottom: 0 })).toEqual({ top: 0, bottom: 0 });
  });

  it('rejects negative, non finite, missing and extra values', () => {
    expect(VIEW_INSETS.safeParse({ top: -1, bottom: 0 }).success).toBe(false);
    expect(VIEW_INSETS.safeParse({ top: Number.NaN, bottom: 0 }).success).toBe(false);
    expect(VIEW_INSETS.safeParse({ top: Number.POSITIVE_INFINITY, bottom: 0 }).success).toBe(false);
    expect(VIEW_INSETS.safeParse({ top: 4 }).success).toBe(false);
    expect(VIEW_INSETS.safeParse({ top: 4, bottom: 4, left: 4 }).success).toBe(false);
  });
});
