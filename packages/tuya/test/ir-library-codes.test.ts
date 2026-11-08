import { describe, expect, it } from 'vitest';
import { IrCodeError, MAX_PULSE_MICROSECONDS, pulsesFromBase64 } from '../src';
import {
  longGapsLimited,
  pulsesFromBroadlink,
  pulsesFromSigned,
  pulsesFromSignedText,
  pulsesToCode,
} from '../src/ir-library/pulse-train';
import { protocolPulses } from '../src/ir-library/protocols';

function broadlink(units: readonly number[]): string {
  const payload = units.flatMap((unit) => (unit > 0xff ? [0x00, unit >> 8, unit & 0xff] : [unit]));
  const header = [0x26, 0x00, payload.length & 0xff, payload.length >> 8];
  return Buffer.from([...header, ...payload]).toString('base64');
}

describe('Broadlink codes', () => {
  it('reads one byte per pulse in 30.45 microsecond ticks and three bytes for a long one', () => {
    expect(pulsesFromBroadlink(broadlink([0x17, 0x11, 0x0129, 0x0d05]))).toStrictEqual([
      700, 518, 9045, 101_502,
    ]);
  });

  it('accepts a code whose base64 padding was left off', () => {
    const code = broadlink([0x17, 0x11, 0x17]);
    expect(pulsesFromBroadlink(code.replace(/=+$/, ''))).toStrictEqual([700, 518, 700]);
  });

  it('names a packet that is not infrared, is cut short or is not base64', () => {
    expect(() => pulsesFromBroadlink(Buffer.from([0x25, 0, 1, 0, 5]).toString('base64'))).toThrow(
      IrCodeError,
    );
    expect(() => pulsesFromBroadlink(Buffer.from([0x26, 0, 9, 0, 5]).toString('base64'))).toThrow(
      /announces 9 bytes but holds 1/,
    );
    expect(() => pulsesFromBroadlink('not base64!')).toThrow(/is not base64/);
  });
});

describe('signed pulse trains', () => {
  it('turns positive marks and negative gaps into pulse lengths', () => {
    expect(pulsesFromSigned([9000, -4500, 560, -560])).toStrictEqual([9000, 4500, 560, 560]);
    expect(pulsesFromSignedText('9040 -4410 650 -1590')).toStrictEqual([9040, 4410, 650, 1590]);
  });

  it('refuses a train that does not alternate or contains a zero', () => {
    expect(() => pulsesFromSigned([9000, 4500])).toThrow(IrCodeError);
    expect(() => pulsesFromSigned([-9000, 4500])).toThrow(IrCodeError);
    expect(() => pulsesFromSigned([9000, 0])).toThrow(IrCodeError);
  });
});

describe('pulses to a Tuya code', () => {
  it('limits only the gaps to the 16-bit field, so a long frame gap still ends the frame', () => {
    expect(longGapsLimited([9000, 100_000, 560, 70_000])).toStrictEqual([
      9000,
      MAX_PULSE_MICROSECONDS,
      560,
      MAX_PULSE_MICROSECONDS,
    ]);
  });

  it('still refuses a mark that does not fit', () => {
    expect(() => pulsesToCode([70_000, 560])).toThrow(IrCodeError);
  });

  it('encodes little-endian 16-bit microseconds in base64', () => {
    expect(pulsesFromBase64(pulsesToCode([9000, 4500, 560]))).toStrictEqual([9000, 4500, 560]);
  });
});

function bitsOf(pulses: readonly number[], skip: number, spaceOne: number): string {
  return pulses
    .slice(skip)
    .filter((_, index) => index % 2 === 1)
    .map((space) => (space === spaceOne ? '1' : '0'))
    .join('');
}

describe('Flipper protocols', () => {
  it('sends NEC as address, its inverse, command and its inverse, least significant bit first', () => {
    const pulses = protocolPulses('NEC', { address: 0x04, command: 0x08 });
    expect(pulses.slice(0, 2)).toStrictEqual([9000, 4500]);
    expect(pulses).toHaveLength(2 + 64 + 1);
    expect(bitsOf(pulses, 2, 1690).slice(0, 32)).toBe(
      '00100000' + '11011111' + '00010000' + '11101111',
    );
  });

  it('sends extended NEC with a 16 bit address and a 16 bit command', () => {
    const pulses = protocolPulses('NECext', { address: 0x0102, command: 0x0304 });
    expect(bitsOf(pulses, 2, 1690).slice(0, 32)).toBe(
      '01000000' + '10000000' + '00100000' + '11000000',
    );
  });

  it('sends NEC42 with a 13 bit address', () => {
    const pulses = protocolPulses('NEC42', { address: 0x1fff, command: 0 });
    expect(pulses).toHaveLength(2 + 84 + 1);
    expect(bitsOf(pulses, 2, 1690).slice(0, 26)).toBe('1111111111111' + '0000000000000');
  });

  it('sends Samsung32 with the address twice when it is one byte', () => {
    const pulses = protocolPulses('Samsung32', { address: 0x07, command: 0x02 });
    expect(pulses.slice(0, 2)).toStrictEqual([4500, 4500]);
    expect(bitsOf(pulses, 2, 1650).slice(0, 32)).toBe(
      '11100000' + '11100000' + '01000000' + '10111111',
    );
  });

  it('sends Sony SIRC as the command then the address with 600 microsecond gaps and no stop', () => {
    const pulses = protocolPulses('SIRC', { address: 1, command: 21 });
    expect(pulses.slice(0, 2)).toStrictEqual([2400, 600]);
    expect(pulses).toHaveLength(2 + 2 * 12 - 1);
    const marks = pulses.slice(2).filter((_, index) => index % 2 === 0);
    expect(marks.map((mark) => (mark === 1200 ? '1' : '0')).join('')).toBe('1010100' + '10000');
  });

  it('sends RC5 as Manchester halves of 889 microseconds that start with a mark', () => {
    const pulses = protocolPulses('RC5', { address: 0, command: 0 });
    expect(pulses.map((pulse) => pulse / 889)).toStrictEqual([
      1,
      1,
      2,
      1,
      ...Array.from({ length: 20 }, () => 1),
      1,
    ]);
  });

  it('puts the inverted seventh command bit of RC5X in the second start bit', () => {
    const plain = protocolPulses('RC5', { address: 0, command: 0 });
    const extended = protocolPulses('RC5X', { address: 0, command: 64 });
    expect(extended).not.toStrictEqual(plain);
    expect(extended[0]).toBe(1778);
  });

  it('sends RC6 with its 6 and 2 unit leader and ends on a mark', () => {
    const pulses = protocolPulses('RC6', { address: 0, command: 0 });
    expect(pulses.slice(0, 3)).toStrictEqual([2664, 888, 444]);
    expect(pulses.length % 2).toBe(1);
  });

  it('sends RCA as four address bits, eight command bits and their inverses', () => {
    const pulses = protocolPulses('RCA', { address: 0, command: 0 });
    expect(pulses.slice(0, 2)).toStrictEqual([4000, 4000]);
    expect(pulses).toHaveLength(2 + 48 + 1);
    expect(bitsOf(pulses, 2, 2000).slice(0, 24)).toBe('0000' + '00000000' + '1111' + '11111111');
  });

  it('refuses an address or command that does not fit its protocol', () => {
    expect(() => protocolPulses('NEC', { address: 300, command: 0 })).toThrow(
      /does not fit in 8 bits/,
    );
    expect(() => protocolPulses('SIRC15', { address: 3738, command: 1 })).toThrow(IrCodeError);
    expect(() => protocolPulses('RC6', { address: 0, command: -1 })).toThrow(IrCodeError);
  });
});
