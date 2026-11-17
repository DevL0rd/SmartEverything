import { describe, expect, it } from 'vitest';
import { momentOf, NOTHING, type MediaFacts } from '../../src/drive/metadata-read';
import { gifXmpDate, isGif } from '../../src/drive/metadata-xmp';
import {
  inZone,
  isZoneless,
  MissingZoneError,
  waitsForDevice,
  zoneEvidence,
  zonePicker,
  type DeviceZones,
} from '../../src/drive/metadata-zone';
import { newContent } from '../../src/store/repositories/drive-media-revision';

function wall(text: string): NonNullable<ReturnType<typeof momentOf>> {
  const moment = momentOf(text, 'metadata');
  if (moment === null) throw new Error(`${text} is no moment`);
  return moment;
}

function gif(xmp: string): Buffer {
  return Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.from(xmp, 'utf8')]);
}

describe('placing a zoneless photo time', () => {
  it('reads an EXIF time without a zone as a wall time in the given zone', () => {
    const local = wall('2025-06-14 21:30:15');
    expect(isZoneless(local)).toBe(true);
    expect(inZone(local, { zone: 'Asia/Bangkok', source: 'hub' })).toEqual({
      iso: '2025-06-14T21:30:15+07:00',
      offsetMin: 420,
      source: 'metadata',
    });
  });

  it('uses the offset in effect on that date, across daylight saving', () => {
    const zone = { zone: 'Europe/Berlin', source: 'hub' } as const;
    expect(inZone(wall('2025-01-10 08:00:00'), zone).offsetMin).toBe(60);
    expect(inZone(wall('2025-07-10 08:00:00.5'), zone).iso).toBe('2025-07-10T08:00:00.5+02:00');
    expect(
      inZone(wall('2025-03-01 12:00:00'), { zone: 'America/New_York', source: 'hub' }).iso,
    ).toBe('2025-03-01T12:00:00-05:00');
  });

  it('leaves times that carry a zone and non-metadata times alone', () => {
    expect(isZoneless(wall('2025-06-14 21:30:15+02:00'))).toBe(false);
    expect(isZoneless(wall('2025-06-14 21:30:15 UTC'))).toBe(false);
    expect(isZoneless(momentOf('2025-06-14 21:30:15', 'container'))).toBe(false);
    expect(isZoneless(null)).toBe(false);
  });

  it('fails loudly when the zone is unknown', () => {
    expect(() =>
      inZone(wall('2025-06-14 21:30:15'), { zone: 'Nowhere/Here', source: 'hub' }),
    ).toThrow(RangeError);
    expect(() =>
      inZone(
        { iso: '2025-06-14T21:30:15+02:00', offsetMin: null, source: 'metadata' },
        {
          zone: 'UTC',
          source: 'hub',
        },
      ),
    ).toThrow(MissingZoneError);
  });
});

describe('picking the zone of a zoneless photo', () => {
  const camera = { make: 'SONY', model: 'ILCE-7M4', lens: null };
  const asked: string[] = [];
  const devices: DeviceZones = {
    nearest: (device, wallAt, exceptItemId) => {
      asked.push(`${device.model} ${wallAt} ${exceptItemId}`);
      return device.model === 'ILCE-7M4' ? 'Europe/Berlin' : null;
    },
    keep: () => undefined,
  };
  const picker = zonePicker(devices, () => 'Asia/Bangkok');
  const facts = (
    text: string,
    fields: Partial<Pick<MediaFacts, 'place' | 'camera'>> = {},
  ): MediaFacts => ({ ...NOTHING, takenAt: wall(text), ...fields });

  it('reads a photo with GPS in its own place: Bangkok, and New York on both sides of a DST change', () => {
    const bangkok = facts('2025-06-14 21:30:15', {
      place: { lat: 13.7563, lon: 100.5018 },
      camera,
    });
    expect(picker.pick('a', bangkok)).toEqual({ zone: 'Asia/Bangkok', source: 'gps' });
    const newYork = { lat: 40.7128, lon: -74.006 };
    const before = facts('2025-03-09 01:30:00', { place: newYork });
    const after = facts('2025-03-09 03:30:00', { place: newYork });
    const zone = picker.pick('b', before);
    expect(zone).toEqual({ zone: 'America/New_York', source: 'gps' });
    expect(inZone(wall('2025-03-09 01:30:00'), zone).iso).toBe('2025-03-09T01:30:00-05:00');
    expect(inZone(wall('2025-03-09 03:30:00'), picker.pick('c', after)).iso).toBe(
      '2025-03-09T03:30:00-04:00',
    );
    expect(asked).toEqual([]);
  });

  it('asks the device next and the Hub last', () => {
    expect(picker.pick('d', facts('2025-06-14 21:30:15.5', { camera }))).toEqual({
      zone: 'Europe/Berlin',
      source: 'device',
    });
    expect(asked).toEqual(['ILCE-7M4 2025-06-14T21:30:15 d']);
    const other = { make: 'SONY', model: 'ILCE-1', lens: null };
    expect(picker.pick('e', facts('2025-06-14 21:30:15', { camera: other }))).toEqual({
      zone: 'Asia/Bangkok',
      source: 'hub',
    });
    expect(picker.pick('f', facts('2025-06-14 21:30:15'))).toEqual({
      zone: 'Asia/Bangkok',
      source: 'hub',
    });
    expect(asked).toHaveLength(2);
  });

  it('keeps as device evidence only a known place or an own offset with a local wall time', () => {
    expect(zoneEvidence(facts('2025-06-14 21:30:15+07:00', { camera }))).toEqual({
      make: 'SONY',
      model: 'ILCE-7M4',
      wallAt: '2025-06-14T21:30:15',
      zone: '+07:00',
    });
    expect(
      zoneEvidence(facts('2025-06-14 21:30:15', { camera, place: { lat: 13.75, lon: 100.5 } })),
    ).toMatchObject({ wallAt: '2025-06-14T21:30:15', zone: 'Asia/Bangkok' });
    expect(zoneEvidence(facts('2025-06-14 21:30:15', { camera }))).toBeNull();
    expect(
      zoneEvidence(facts('2025-06-14 14:30:15 UTC', { camera, place: { lat: 13.75, lon: 100.5 } })),
    ).toBeNull();
    expect(zoneEvidence(facts('2025-06-14 21:30:15+07:00'))).toBeNull();
    expect(waitsForDevice(facts('2025-06-14 21:30:15', { camera }))).toBe(true);
    expect(
      waitsForDevice(facts('2025-06-14 21:30:15', { camera, place: { lat: 1, lon: 1 } })),
    ).toBe(false);
  });
});

describe('reading XMP dates in a GIF', () => {
  it('reads a dated XMP attribute or element and keeps its zone', () => {
    const attribute = gif(
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:Description xmp:CreateDate="2024-12-31T23:10:05+07:00"/></x:xmpmeta>',
    );
    expect(isGif(attribute)).toBe(true);
    expect(gifXmpDate(attribute)).toBe('2024-12-31 23:10:05+07:00');
    const element = gif(
      '<x:xmpmeta><photoshop:DateCreated>2024-12-31T23:10</photoshop:DateCreated></x:xmpmeta>',
    );
    expect(gifXmpDate(element)).toBe('2024-12-31 23:10:00');
  });

  it('prefers the original date and reports none without a packet', () => {
    const both = gif(
      '<x:xmpmeta><rdf:Description xmp:CreateDate="2020-01-01T00:00:00Z" exif:DateTimeOriginal="2019-05-05T10:00:00Z"/></x:xmpmeta>',
    );
    expect(gifXmpDate(both)).toBe('2019-05-05 10:00:00Z');
    expect(gifXmpDate(gif('no packet here'))).toBeNull();
    expect(isGif(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false);
  });
});

describe('telling new content apart', () => {
  const base = { kind: 'image', bytes: 10, modifiedAt: '2025-01-01T00:00:00.000Z' };

  it('counts a change of size or modified time of the same kind as new content', () => {
    expect(newContent(base, { ...base, bytes: 11 })).toBe(true);
    expect(newContent(base, { ...base, modifiedAt: '2025-01-02T00:00:00.000Z' })).toBe(true);
    expect(newContent(base, base)).toBe(false);
    expect(newContent(base, { ...base, kind: 'video', bytes: 11 })).toBe(false);
  });
});
