import { describe, expect, it } from 'vitest';
import { coordinateText, locationOfMatch, pinAt, placeName, pointAt, viewOn } from './pick-model';

const FRAME = { width: 400, height: 220 };

describe('map picker', () => {
  it('turns a tap back into the point the pin is drawn at', () => {
    const view = viewOn({ lat: 13.75, lon: 100.5 }, 6);
    const point = { lat: 14.1, lon: 100.2 };
    const at = pinAt(point, view, FRAME);
    const back = pointAt(at, view, FRAME);
    expect(back.lat).toBeCloseTo(point.lat, 6);
    expect(back.lon).toBeCloseTo(point.lon, 6);
  });

  it('puts the centre of the view under the middle of the map', () => {
    const view = viewOn({ lat: -33.9, lon: 18.4 }, 4);
    const centre = pointAt({ x: FRAME.width / 2, y: FRAME.height / 2 }, view, FRAME);
    expect(centre.lat).toBeCloseTo(-33.9, 6);
    expect(centre.lon).toBeCloseTo(18.4, 6);
  });

  it('labels a searched place and keeps its point', () => {
    const match = {
      name: 'Chiang Mai',
      region: 'Chiang Mai',
      country: 'Thailand',
      countryCode: 'TH',
      latitude: 18.79,
      longitude: 98.98,
      timeZone: 'Asia/Bangkok',
    };
    expect(placeName(match)).toBe('Chiang Mai, Thailand');
    expect(locationOfMatch(match)).toEqual({
      latitude: 18.79,
      longitude: 98.98,
      label: 'Chiang Mai, Thailand',
    });
    expect(coordinateText({ lat: -1.5, lon: 36.8 })).toBe('1.5000° S, 36.8000° E');
  });
});
