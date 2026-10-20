import { describe, expect, it } from 'vitest';
import * as ble from '../../src';
import {
  CONFIG_PREFIX,
  ORALB_KEY,
  OralbRefusedError,
  clockPayload,
  configWrite,
  decodeOralbClock,
  decodeOralbHead,
  decodeOralbModeSlots,
  decodeOralbPacerConfig,
  decodeOralbRingColour,
  extendConnection,
  headResetPayload,
  headSnoozePayload,
  metadataSelect,
  modeSlotsPayload,
  pacerPayload,
  readSelect,
  ringColourOf,
  ringColourPayload,
} from '../../src';

const hex = (bytes: Uint8Array): string => bytes.toHex();

describe('read selects', () => {
  it('selects a stored session by index', () => {
    expect(hex(readSelect(0))).toBe('0200');
    expect(hex(readSelect(29))).toBe('021d');
  });

  it('selects the service data and software versions', () => {
    expect(hex(readSelect(250))).toBe('02fa');
    expect(hex(readSelect(255))).toBe('02ff');
  });

  it('refuses indexes outside both ranges', () => {
    for (const index of [-1, 30, 100, 249, 256, 1.5, Number.NaN]) {
      expect(() => readSelect(index)).toThrow(OralbRefusedError);
    }
  });

  it('selects the read-only metadata ids', () => {
    expect(hex(metadataSelect(255))).toBe('05ff');
    expect(hex(metadataSelect(1))).toBe('0501');
    expect(hex(metadataSelect(3))).toBe('0503');
    expect(hex(metadataSelect(6))).toBe('0506');
    expect(hex(metadataSelect(9))).toBe('0509');
  });

  it('refuses any other metadata id', () => {
    for (const index of [0, 2, 4, 5, 10, 254, 256]) {
      expect(() => metadataSelect(index)).toThrow(OralbRefusedError);
    }
  });
});

describe('extend connection', () => {
  it('keeps the link for the given seconds', () => {
    expect(hex(extendConnection(0))).toBe('3100');
    expect(hex(extendConnection(30))).toBe('311e');
    expect(hex(extendConnection(255))).toBe('31ff');
  });

  it('refuses values that do not fit a byte', () => {
    for (const seconds of [-1, 256, 0.5]) {
      expect(() => extendConnection(seconds)).toThrow(OralbRefusedError);
    }
  });
});

describe('config writes', () => {
  const payload = Uint8Array.of(1, 2);

  it('puts the 37 prefix in front of each characteristic code when prefixed', () => {
    expect(hex(configWrite('prefixed', ORALB_KEY.clock, payload).prefix ?? new Uint8Array())).toBe(
      '3726',
    );
    expect(
      hex(configWrite('prefixed', ORALB_KEY.modeSlots, payload).prefix ?? new Uint8Array()),
    ).toBe('3729');
    expect(hex(configWrite('prefixed', ORALB_KEY.pacer, payload).prefix ?? new Uint8Array())).toBe(
      '372a',
    );
    expect(
      hex(configWrite('prefixed', ORALB_KEY.ringColour, payload).prefix ?? new Uint8Array()),
    ).toBe('372f');
  });

  it('uses the plain command byte when plain', () => {
    expect(hex(configWrite('plain', ORALB_KEY.clock, payload).prefix ?? new Uint8Array())).toBe(
      '26',
    );
    expect(hex(configWrite('plain', ORALB_KEY.modeSlots, payload).prefix ?? new Uint8Array())).toBe(
      '29',
    );
    expect(hex(configWrite('plain', ORALB_KEY.pacer, payload).prefix ?? new Uint8Array())).toBe(
      '2a',
    );
    expect(
      hex(configWrite('plain', ORALB_KEY.ringColour, payload).prefix ?? new Uint8Array()),
    ).toBe('2f');
  });

  it('has no prefix for the brush head, whose code is unknown', () => {
    expect(configWrite('prefixed', ORALB_KEY.head, payload).prefix).toBeNull();
    expect(configWrite('plain', ORALB_KEY.head, payload).prefix).toBeNull();
  });

  it('carries the target characteristic and the payload as given', () => {
    const write = configWrite('prefixed', ORALB_KEY.pacer, payload);
    expect(write.characteristic).toBe('ff26');
    expect(write.payload).toBe(payload);
    expect(CONFIG_PREFIX).toBe(0x37);
  });
});

describe('payload builders', () => {
  it('builds the mode slots and pads with ff', () => {
    expect(hex(modeSlotsPayload([11, 0, 1, 3, 2, 4, 6, 7]))).toBe('0b00010302040607');
    expect(hex(modeSlotsPayload([0, 1]))).toBe('0001ffffffffffff');
    expect(hex(modeSlotsPayload([0, null, 6]))).toBe('00ff06ffffffffff');
    expect(hex(modeSlotsPayload([]))).toBe('ffffffffffffffff');
  });

  it('round trips the mode slots through the decoder', () => {
    const slots = [11, 0, 1, 3, null, 4, 6, 7];
    expect(decodeOralbModeSlots(modeSlotsPayload(slots)).modeSlots).toEqual(slots);
  });

  it('refuses nine slots and ids that are not a mode', () => {
    expect(() => modeSlotsPayload(new Array<number>(9).fill(0))).toThrow(OralbRefusedError);
    expect(() => modeSlotsPayload([255])).toThrow(OralbRefusedError);
    expect(() => modeSlotsPayload([-1])).toThrow(OralbRefusedError);
    expect(() => modeSlotsPayload([254])).not.toThrow();
  });

  it('builds the pacer with unused sectors at zero', () => {
    expect(hex(pacerPayload([30, 30, 30, 30]))).toBe('1e1e1e1e00000000');
    expect(hex(pacerPayload([]))).toBe('0000000000000000');
    expect(hex(pacerPayload([255, 1, 2, 3, 4, 5, 6, 7]))).toBe('ff01020304050607');
  });

  it('round trips the pacer through the decoder', () => {
    expect(decodeOralbPacerConfig(pacerPayload([30, 30, 30, 30]))).toMatchObject({
      pacerSectorCount: 4,
      pacerTargetS: 120,
    });
  });

  it('refuses nine sectors and seconds that do not fit a byte', () => {
    expect(() => pacerPayload(new Array<number>(9).fill(1))).toThrow(OralbRefusedError);
    expect(() => pacerPayload([256])).toThrow(OralbRefusedError);
    expect(() => pacerPayload([-1])).toThrow(OralbRefusedError);
    expect(() => pacerPayload([1.5])).toThrow(OralbRefusedError);
  });

  it('builds the named ring colours from the captured drive levels', () => {
    expect(hex(ringColourPayload('white'))).toBe('44cf6300');
    expect(hex(ringColourPayload('yellow'))).toBe('80ff0000');
    expect(hex(ringColourPayload('orange'))).toBe('fc700000');
    expect(hex(ringColourPayload('blue'))).toBe('0f5bcc00');
    expect(hex(ringColourPayload('turquoise'))).toBe('00ff3d00');
    expect(hex(ringColourPayload('pink'))).toBe('b2091a00');
  });

  it('round trips a ring colour through the decoder and the namer', () => {
    const drive = decodeOralbRingColour(ringColourPayload('pink')).ringDrive;
    expect(drive).toBeDefined();
    expect(ringColourOf([drive?.[0] ?? 0, drive?.[1] ?? 0, drive?.[2] ?? 0]).name).toBe('pink');
  });

  it('builds the brush head reset and snooze', () => {
    expect(hex(headResetPayload())).toBe('0100000000');
    expect(hex(headSnoozePayload())).toBe('0200000000');
    expect(decodeOralbHead(headResetPayload()).headState).toBe(1);
    expect(decodeOralbHead(headSnoozePayload()).headState).toBe(2);
  });

  it('builds the clock as little endian seconds', () => {
    expect(hex(clockPayload(838853670))).toBe('26e4ff31');
    expect(hex(clockPayload(0))).toBe('00000000');
    expect(hex(clockPayload(0xffffffff))).toBe('ffffffff');
    expect(decodeOralbClock(clockPayload(838853670)).clock).toBe(838853670);
  });

  it('refuses a clock that does not fit four bytes', () => {
    for (const seconds of [-1, 0x100000000, 1.5]) {
      expect(() => clockPayload(seconds)).toThrow(OralbRefusedError);
    }
  });
});

describe('the refusal messages', () => {
  it('say what was refused', () => {
    expect(() => readSelect(30)).toThrow(
      'Read-select index 30 is not a stored session or service id.',
    );
    expect(() => metadataSelect(2)).toThrow('Metadata index 2 is not a read-only metadata id.');
    expect(() => extendConnection(256)).toThrow(
      'Extension seconds 256 is not an integer from 0 to 255.',
    );
    expect(() => modeSlotsPayload([255])).toThrow('Mode id 255 is not an integer from 0 to 254.');
    expect(() => pacerPayload([256])).toThrow(
      'Sector seconds 256 is not an integer from 0 to 255.',
    );
    expect(() => clockPayload(-1)).toThrow(
      'Clock seconds -1 is not an integer from 0 to 4294967295.',
    );
    expect(() => modeSlotsPayload(new Array<number>(9).fill(0))).toThrow(
      'Mode slots take at most 8 entries.',
    );
    expect(() => pacerPayload(new Array<number>(9).fill(1))).toThrow(
      'The pacer takes at most 8 sectors.',
    );
  });

  it('carry the name of the error', () => {
    expect(() => readSelect(30)).toThrow(expect.objectContaining({ name: 'OralbRefusedError' }));
  });
});

describe('the commands that are never encoded', () => {
  const functions = Object.entries(ble)
    .filter(([, value]) => typeof value === 'function')
    .map(([name]) => name);

  it('exports no factory reset, firmware, feature toggle, mode, motor, guide, clear or stream encoder', () => {
    const forbidden =
      /factory|ota|firmware|toggle|feature|setMode|motor|ramp|guide|clear|dashboard|stream|ff0c/i;
    const oralb = functions.filter((name) =>
      /oralb|select|extend|config|payload|reset/i.test(name),
    );
    expect(oralb.filter((name) => forbidden.test(name))).toEqual([]);
    expect(oralb.filter((name) => /reset/i.test(name) && !name.endsWith('Payload'))).toEqual([]);
  });

  it('exports exactly the encoders of the design', () => {
    const encoders = [
      'readSelect',
      'metadataSelect',
      'extendConnection',
      'configWrite',
      'modeSlotsPayload',
      'pacerPayload',
      'ringColourPayload',
      'headResetPayload',
      'headSnoozePayload',
      'clockPayload',
    ];
    expect(encoders.filter((name) => !functions.includes(name))).toEqual([]);
  });
});
