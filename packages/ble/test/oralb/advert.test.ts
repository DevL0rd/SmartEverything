import { describe, expect, it } from 'vitest';
import {
  OralbFrameError,
  UnsupportedOralbProtocol,
  advertDelta,
  advertSector,
  decodeOralbAdvert,
  hexToBytes,
  oralbAdvertDelta,
} from '../../src';
import { adverts, capture } from './fixtures';

describe('the iO adverts of the open-source test suites and the captures', () => {
  it.each(adverts().decoded)('decodes $name', ({ name, hex, ...expected }) => {
    expect(name).not.toBe('');
    expect(decodeOralbAdvert(hexToBytes(hex))).toEqual(expected);
  });

  it('reads the advert of the S4 capture the same way as the one in the research', () => {
    expect(decodeOralbAdvert(hexToBytes(capture().advert))).toMatchObject({
      protocol: 8,
      modelId: 0x36,
      firmware: 0x52,
      state: 8,
    });
  });
});

describe('the older handles', () => {
  it.each(adverts().refused)('refuses $name with the protocol it speaks', ({ hex, protocol }) => {
    const attempt = (): unknown => decodeOralbAdvert(hexToBytes(hex));
    expect(attempt).toThrow(UnsupportedOralbProtocol);
    expect(attempt).toThrow(expect.objectContaining({ protocol }));
  });
});

describe('a frame that is too short', () => {
  it.each([0, 1, 10])('throws the named error for %i bytes', (length) => {
    const attempt = (): unknown => decodeOralbAdvert(new Uint8Array(length).fill(8));
    expect(attempt).toThrow(OralbFrameError);
    expect(attempt).toThrow(/advert/);
  });

  it('checks the length before it looks at the protocol', () => {
    expect(() => decodeOralbAdvert(new Uint8Array(3))).toThrow(OralbFrameError);
  });

  it('accepts a frame with extra bytes and ignores them', () => {
    const [first] = adverts().decoded;
    const longer = new Uint8Array([...hexToBytes(first?.hex ?? ''), 0xaa]);
    expect(decodeOralbAdvert(longer).modeId).toBe(first?.modeId);
  });
});

describe('the status bits', () => {
  const frame = (status: number, sector = 0): Uint8Array =>
    Uint8Array.of(6, 0x31, 0x16, 3, status, 1, 5, 2, sector, 7, 4);

  it('reports high pressure only for bit 7', () => {
    for (const status of [0x30, 0x32, 0x38, 0x3a, 0x52, 0x72, 0x7f]) {
      expect(decodeOralbAdvert(frame(status)).pressure).toBe('normal');
    }
    for (const status of [0x80, 0x90, 0x92, 0xb2, 0xf0, 0xf2]) {
      expect(decodeOralbAdvert(frame(status)).pressure).toBe('high');
    }
  });

  it('reads the power button from bit 3 and the mode button from bit 2', () => {
    expect(decodeOralbAdvert(frame(0x08))).toMatchObject({ powerButton: true, modeButton: false });
    expect(decodeOralbAdvert(frame(0x04))).toMatchObject({ powerButton: false, modeButton: true });
    expect(decodeOralbAdvert(frame(0x0c))).toMatchObject({ powerButton: true, modeButton: true });
    expect(decodeOralbAdvert(frame(0x73))).toMatchObject({ powerButton: false, modeButton: false });
  });

  it('keeps the whole status byte for diagnostics', () => {
    expect(decodeOralbAdvert(frame(0xb2)).status).toBe(0xb2);
  });

  it('reads the timer as minutes and seconds', () => {
    expect(decodeOralbAdvert(frame(0)).timerS).toBe(65);
  });

  it('masks the sector bits and the face bits apart', () => {
    expect(decodeOralbAdvert(frame(0, 0b10100011))).toMatchObject({
      sector: { position: 3, last: false },
      face: 4,
    });
    expect(decodeOralbAdvert(frame(0, 0x37))).toMatchObject({
      sector: { position: null, last: true },
      face: 6,
    });
    expect(decodeOralbAdvert(frame(0, 0xc0))).toMatchObject({
      sector: { position: null, last: false },
      face: 0,
    });
  });
});

describe('the sector code', () => {
  it('maps zero to none, one to six to a quadrant and seven to the last sector', () => {
    expect(advertSector(0)).toEqual({ position: null, last: false });
    expect(advertSector(1)).toEqual({ position: 1, last: false });
    expect(advertSector(6)).toEqual({ position: 6, last: false });
    expect(advertSector(7)).toEqual({ position: null, last: true });
  });
});

describe('the delta of an advert', () => {
  it('carries the raw numbers and a numeric pressure state', () => {
    const [normal, , , , , , , , io4] = adverts().decoded;
    const hex = normal?.hex ?? '';
    expect(oralbAdvertDelta(hexToBytes(hex))).toEqual(
      advertDelta(decodeOralbAdvert(hexToBytes(hex))),
    );
    expect(oralbAdvertDelta(hexToBytes(hex))).toMatchObject({
      protocol: 6,
      modelId: 0x32,
      firmware: 0x6b,
      state: 2,
      statusBits: 0x72,
      pressure: 1,
      powerButton: false,
      modeButton: false,
      timerS: 0,
      modeId: 1,
      sector: { position: 1, last: false },
      face: 0,
      secondsInSector: 0,
      sectorCount: 4,
    });
    expect(oralbAdvertDelta(hexToBytes(io4?.hex ?? '')).powerButton).toBe(true);
    const high = Uint8Array.of(6, 0x31, 0x16, 3, 0xb2, 0, 0, 0, 0, 0, 4);
    expect(oralbAdvertDelta(high).pressure).toBe(2);
  });
});
