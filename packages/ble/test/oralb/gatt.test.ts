import { describe, expect, it } from 'vitest';
import {
  ORALB_DECODED_KEYS,
  OralbFrameError,
  OralbRefusedError,
  decodeOralbAdvert,
  decodeOralbBattery,
  decodeOralbButton,
  decodeOralbClock,
  decodeOralbDeviceInfo,
  decodeOralbFace,
  decodeOralbHead,
  decodeOralbMac,
  decodeOralbModeId,
  decodeOralbModeSlots,
  decodeOralbPacer,
  decodeOralbPacerConfig,
  decodeOralbPressure,
  decodeOralbRingColour,
  decodeOralbState,
  decodeOralbTimer,
  decodeOralbUser,
  decodeOralbValue,
  gattSector,
  hexToBytes,
  ORALB_COMPANY_ID,
  ORALB_SCAN_MANUFACTURER,
  ORALB_SERVICE,
  oralbFullOf,
  oralbHeadStateName,
  oralbModeName,
  oralbPressureName,
  oralbServiceOf,
  oralbShortOf,
  oralbUuid,
  oralbStateName,
  readSelect,
  requireIoProtocol,
  UnsupportedOralbProtocol,
} from '../../src';
import { capture, gatt } from './fixtures';

const bytes = (hex: string): Uint8Array => hexToBytes(hex);

describe('identity values', () => {
  it('reads the model, protocol and firmware of FF02', () => {
    const fixture = gatt().deviceInfo;
    expect(decodeOralbDeviceInfo(bytes(fixture.hex))).toEqual({
      modelId: fixture.modelId,
      protocol: fixture.protocol,
      firmware: fixture.firmware,
    });
    expect(() => decodeOralbDeviceInfo(bytes('3608'))).toThrow(OralbFrameError);
    expect(() => decodeOralbDeviceInfo(bytes('36085200'))).toThrow(OralbFrameError);
  });

  it('reverses the address of FF01', () => {
    const fixture = gatt().mac;
    expect(decodeOralbMac(bytes(fixture.hex))).toEqual({ mac: fixture.mac });
    expect(() => decodeOralbMac(bytes('be48c22fdb'))).toThrow(OralbFrameError);
    expect(() => decodeOralbMac(bytes('be48c22fdb7800'))).toThrow(OralbFrameError);
  });

  it('reads the user id of FF03', () => {
    expect(decodeOralbUser(bytes('02'))).toEqual({ userId: 2 });
    expect(() => decodeOralbUser(bytes(''))).toThrow(OralbFrameError);
    expect(() => decodeOralbUser(bytes('0200'))).toThrow(OralbFrameError);
  });
});

describe('state, mode, timer and face', () => {
  it('reads the state and substate of FF04', () => {
    expect(decodeOralbState(bytes('0300'))).toEqual({ state: 3, substate: 0 });
    expect(decodeOralbState(bytes('0aff'))).toEqual({ state: 10, substate: 255 });
    expect(() => decodeOralbState(bytes('03'))).toThrow(OralbFrameError);
    expect(() => decodeOralbState(bytes('030000'))).toThrow(OralbFrameError);
  });

  it('names every state of the table and nothing else', () => {
    const names = new Map([
      [0, 'unknown'],
      [1, 'initializing'],
      [2, 'idle'],
      [3, 'running'],
      [4, 'charging'],
      [5, 'setup'],
      [6, 'flight_menu'],
      [7, 'charge_forbidden'],
      [8, 'selection_menu'],
      [9, 'session_summary'],
      [10, 'post_brushing_summary'],
      [113, 'final_test'],
      [114, 'pcb_test'],
      [115, 'sleeping'],
      [116, 'transport'],
      [117, 'calibration_test'],
    ]);
    for (const [code, name] of names) {
      expect(oralbStateName(code)).toBe(name);
    }
    expect(oralbStateName(11)).toBeNull();
    expect(oralbStateName(255)).toBeNull();
  });

  it('names the head states and the pressure states', () => {
    expect([0, 1, 2, 254, 255].map(oralbHeadStateName)).toEqual([
      'on',
      'reset',
      'snooze',
      'interval',
      'off',
    ]);
    expect(oralbHeadStateName(3)).toBeNull();
    expect([0, 1, 2].map(oralbPressureName)).toEqual(['low', 'normal', 'high']);
    expect(oralbPressureName(3)).toBeNull();
  });

  it('names the iO modes', () => {
    const names = new Map<number, string>([
      [0, 'daily_clean'],
      [1, 'sensitive'],
      [2, 'gum_care'],
      [3, 'whiten'],
      [4, 'intense'],
      [5, 'super_sensitive'],
      [6, 'tongue_clean'],
      [7, 'off'],
      [8, 'settings'],
      [9, 'off'],
      [11, 'smart_adapt'],
      [12, 'gentle_white'],
    ]);
    for (const [id, name] of names) {
      expect(oralbModeName(id)).toBe(name);
    }
    expect(oralbModeName(10)).toBeNull();
    expect(oralbModeName(13)).toBeNull();
  });

  it('reads the mode of FF07', () => {
    expect(decodeOralbModeId(bytes('04'))).toEqual({ modeId: 4 });
    expect(() => decodeOralbModeId(bytes(''))).toThrow(OralbFrameError);
    expect(() => decodeOralbModeId(bytes('0400'))).toThrow(OralbFrameError);
  });

  it('reads the timer of FF08 as minutes and seconds', () => {
    expect(decodeOralbTimer(bytes('0000'))).toEqual({ timerS: 0 });
    expect(decodeOralbTimer(bytes('0214'))).toEqual({ timerS: 140 });
    expect(() => decodeOralbTimer(bytes('02'))).toThrow(OralbFrameError);
    expect(() => decodeOralbTimer(bytes('021400'))).toThrow(OralbFrameError);
  });

  it('reads the face of FF0A', () => {
    expect(decodeOralbFace(bytes('0b'))).toEqual({ face: 11 });
    expect(() => decodeOralbFace(bytes(''))).toThrow(OralbFrameError);
    expect(() => decodeOralbFace(bytes('0b00'))).toThrow(OralbFrameError);
  });

  it('refuses the protocols before the iO', () => {
    for (const protocol of [0, 1, 5]) {
      expect(() => requireIoProtocol(protocol)).toThrow(UnsupportedOralbProtocol);
    }
    expect(requireIoProtocol(6)).toBe(6);
    expect(requireIoProtocol(9)).toBe(9);
  });
});

describe('the buttons of FF06', () => {
  it('reads the one byte form as none, power or mode', () => {
    expect(decodeOralbButton(bytes('00'))).toEqual({ powerButton: false, modeButton: false });
    expect(decodeOralbButton(bytes('01'))).toEqual({ powerButton: true, modeButton: false });
    expect(decodeOralbButton(bytes('02'))).toEqual({ powerButton: false, modeButton: true });
    expect(decodeOralbButton(bytes('03'))).toEqual({ powerButton: false, modeButton: false });
  });

  it('reads the two byte form as two flags', () => {
    expect(decodeOralbButton(bytes('0100'))).toEqual({ powerButton: true, modeButton: false });
    expect(decodeOralbButton(bytes('0001'))).toEqual({ powerButton: false, modeButton: true });
    expect(decodeOralbButton(bytes('0101'))).toEqual({ powerButton: true, modeButton: true });
    expect(decodeOralbButton(bytes('0000'))).toEqual({ powerButton: false, modeButton: false });
    expect(() => decodeOralbButton(bytes(''))).toThrow(OralbFrameError);
    expect(() => decodeOralbButton(bytes('010101'))).toThrow(OralbFrameError);
  });
});

describe('the battery of FF05', () => {
  it.each(gatt().battery)('decodes $name', ({ hex, protocol, expect: expected }) => {
    expect(decodeOralbBattery(bytes(hex), protocol)).toEqual(expected);
  });

  it('reads 5b000000 as 91 percent with no runtime on protocol 6', () => {
    expect(decodeOralbBattery(bytes('5b000000'), 6)).toEqual({
      battery: 91,
      runtimeLeftS: null,
    });
  });

  it('keeps the runtime of a protocol 6 handle when it is not zero', () => {
    expect(decodeOralbBattery(bytes('3b0100'), 6).runtimeLeftS).toBe(1);
    expect(decodeOralbBattery(bytes('3b0001'), 6).runtimeLeftS).toBe(256);
  });

  it('treats a zero runtime as unavailable only on protocol 6', () => {
    expect(decodeOralbBattery(bytes('500000'), 5).runtimeLeftS).toBe(0);
    expect(decodeOralbBattery(bytes('500000'), 7).runtimeLeftS).toBe(0);
    expect(decodeOralbBattery(bytes('500000'), null).runtimeLeftS).toBe(0);
  });

  it('treats ffff as unavailable on every protocol', () => {
    for (const protocol of [6, 8, null]) {
      expect(decodeOralbBattery(bytes('50ffff'), protocol).runtimeLeftS).toBeNull();
    }
    expect(decodeOralbBattery(bytes('50feff'), 8).runtimeLeftS).toBe(65534);
  });

  it('reads the extended fields only when all eight bytes are present', () => {
    expect(decodeOralbBattery(bytes('5f100ea00f7b00'), 8)).toEqual({
      battery: 95,
      runtimeLeftS: 3600,
    });
    expect(decodeOralbBattery(bytes('5f'), 8)).toEqual({ battery: 95 });
    expect(decodeOralbBattery(bytes('5f10'), 8)).toEqual({ battery: 95 });
  });

  it('reads minus one milliamp as unavailable and keeps other negatives', () => {
    expect(decodeOralbBattery(bytes('5f100e000fffff19'), 8).milliamps).toBeNull();
    expect(decodeOralbBattery(bytes('5f100e000ffeff19'), 8).milliamps).toBe(-2);
    expect(decodeOralbBattery(bytes('5f100e000f000019'), 8).milliamps).toBe(0);
  });

  it('reads the temperature as a signed byte', () => {
    expect(decodeOralbBattery(bytes('5f100e000f7b00f6'), 8).temperatureC).toBe(-10);
    expect(decodeOralbBattery(bytes('5f100e000f7b007f'), 8).temperatureC).toBe(127);
  });

  it('ignores bytes beyond the eighth', () => {
    expect(decodeOralbBattery(bytes('5f100ea00f7b0019aabbcc'), 8)).toMatchObject({
      battery: 95,
      temperatureC: 25,
    });
  });

  it('throws on an empty value', () => {
    expect(() => decodeOralbBattery(bytes(''), 8)).toThrow(OralbFrameError);
  });
});

describe('the pacer of FF09', () => {
  it('reads a running quadrant as zero based', () => {
    expect(decodeOralbPacer(bytes('000000'))).toEqual({
      sector: { position: 1, last: false },
      secondsInSector: 0,
      sectorCount: 0,
    });
    expect(decodeOralbPacer(bytes('031e04'))).toEqual({
      sector: { position: 4, last: false },
      secondsInSector: 30,
      sectorCount: 4,
    });
  });

  it('reads f0 as no sector and ff as the last sector', () => {
    expect(gattSector(0xf0)).toEqual({ position: null, last: false });
    expect(gattSector(0xff)).toEqual({ position: null, last: true });
    expect(gattSector(0xef)).toEqual({ position: 240, last: false });
    expect(decodeOralbPacer(bytes('f00000')).sector).toEqual({ position: null, last: false });
  });

  it('throws for the wrong length', () => {
    expect(() => decodeOralbPacer(bytes('0000'))).toThrow(OralbFrameError);
    expect(() => decodeOralbPacer(bytes('00000000'))).toThrow(OralbFrameError);
  });
});

describe('the pressure of FF0B', () => {
  it.each(gatt().pressure)('decodes $hex', ({ hex, expect: expected }) => {
    expect(decodeOralbPressure(bytes(hex))).toEqual(expected);
  });

  it('reads the force as a signed value', () => {
    expect(decodeOralbPressure(bytes('01000030f800000000aa')).forceRaw).toBe(-2000);
    expect(decodeOralbPressure(bytes('0100005715000000 00aa'.replace(' ', ''))).forceRaw).toBe(
      5463,
    );
  });

  it('reads the angle in centidegrees as unsigned', () => {
    expect(decodeOralbPressure(bytes('0100000000f00a0000aa')).angleCentidegrees).toBe(2800);
    expect(decodeOralbPressure(bytes('0100000000ffff0000aa')).angleCentidegrees).toBe(65535);
  });

  it('throws for any other length', () => {
    for (const hex of ['', '0102', '010203040506070809', '0102030405060708090a0b']) {
      expect(() => decodeOralbPressure(bytes(hex))).toThrow(OralbFrameError);
    }
  });
});

describe('the configuration values', () => {
  it('reads the clock of FF22 as seconds', () => {
    expect(decodeOralbClock(bytes('26e4ff31'))).toEqual({ clock: 838853670 });
    expect(decodeOralbClock(bytes('ffffffff'))).toEqual({ clock: 4294967295 });
    expect(() => decodeOralbClock(bytes('26e4ff'))).toThrow(OralbFrameError);
    expect(() => decodeOralbClock(bytes('26e4ff3100'))).toThrow(OralbFrameError);
  });

  it('reads the mode slots of FF25 and treats ff as empty', () => {
    for (const { hex, slots } of gatt().modeSlots) {
      expect(decodeOralbModeSlots(bytes(hex))).toEqual({ modeSlots: slots });
    }
    expect(decodeOralbModeSlots(bytes('00010203ffffffff'))).toEqual({
      modeSlots: [0, 1, 2, 3, null, null, null, null],
    });
    expect(() => decodeOralbModeSlots(bytes('0001'))).toThrow(OralbFrameError);
    expect(() => decodeOralbModeSlots(bytes('000102030405060708'))).toThrow(OralbFrameError);
  });

  it('reads the pacer schedule of FF26', () => {
    for (const { hex, sectors, targetS } of gatt().pacerConfig) {
      expect(decodeOralbPacerConfig(bytes(hex))).toMatchObject({
        pacerSectorCount: sectors,
        pacerTargetS: targetS,
      });
    }
    expect(decodeOralbPacerConfig(bytes('1e1e1e1e00000000')).pacerS).toEqual([
      30, 30, 30, 30, 0, 0, 0, 0,
    ]);
    expect(decodeOralbPacerConfig(bytes('01ff000000000000'))).toMatchObject({
      pacerSectorCount: 1,
      pacerTargetS: 1,
    });
    expect(decodeOralbPacerConfig(bytes('1e1e1e1effffffff'))).toMatchObject({
      pacerS: [30, 30, 30, 30, 255, 255, 255, 255],
      pacerSectorCount: 4,
      pacerTargetS: 120,
    });
    expect(() => decodeOralbPacerConfig(bytes('1e1e1e1e'))).toThrow(OralbFrameError);
    expect(() => decodeOralbPacerConfig(bytes('1e1e1e1e0000000000'))).toThrow(OralbFrameError);
  });

  it('reads the ring drive levels of FF2B', () => {
    expect(decodeOralbRingColour(bytes('44cf6300'))).toEqual({ ringDrive: [0x44, 0xcf, 0x63, 0] });
    expect(decodeOralbRingColour(bytes('01020304'))).toEqual({ ringDrive: [1, 2, 3, 4] });
    expect(() => decodeOralbRingColour(bytes('44cf63'))).toThrow(OralbFrameError);
    expect(() => decodeOralbRingColour(bytes('44cf630000'))).toThrow(OralbFrameError);
  });

  it('reads the brush head remainder of FF2D', () => {
    const fixture = gatt().head;
    expect(decodeOralbHead(bytes(fixture.hex))).toEqual({
      headState: fixture.headState,
      headDaysLeft: fixture.headDaysLeft,
      headSecondsLeft: fixture.headSecondsLeft,
    });
    expect(decodeOralbHead(bytes('ff0100ffff'))).toEqual({
      headState: 255,
      headDaysLeft: 1,
      headSecondsLeft: 65535,
    });
    expect(() => decodeOralbHead(bytes('001e0058'))).toThrow(OralbFrameError);
    expect(() => decodeOralbHead(bytes('001e00580200'))).toThrow(OralbFrameError);
  });
});

describe('the dispatcher', () => {
  it('names every characteristic it decodes', () => {
    expect([...ORALB_DECODED_KEYS].sort()).toEqual([
      'ff01',
      'ff02',
      'ff03',
      'ff04',
      'ff05',
      'ff06',
      'ff07',
      'ff08',
      'ff09',
      'ff0a',
      'ff0b',
      'ff22',
      'ff25',
      'ff26',
      'ff29',
      'ff2b',
      'ff2d',
    ]);
  });

  it('decodes by short key in either case and by full uuid', () => {
    const expected = { battery: 91, runtimeLeftS: null };
    expect(decodeOralbValue('ff05', bytes('5b000000'), 6)).toEqual(expected);
    expect(decodeOralbValue('FF05', bytes('5b000000'), 6)).toEqual(expected);
    expect(decodeOralbValue('a0f0ff05-5047-4d53-8208-4f72616c2d42', bytes('5b000000'), 6)).toEqual(
      expected,
    );
  });

  it('passes the protocol to the battery decoder', () => {
    expect(decodeOralbValue('ff05', bytes('000000'), 8)).toEqual({
      battery: 0,
      runtimeLeftS: 0,
    });
    expect(decodeOralbValue('ff05', bytes('000000'), null)).toEqual({
      battery: 0,
      runtimeLeftS: 0,
    });
  });

  it('returns null for characteristics it does not decode', () => {
    for (const key of ['ff0c', 'ff0d', 'ff0e', 'ff21', 'ff81', 'ff2c', '2a19']) {
      expect(decodeOralbValue(key, bytes('0102'), 8)).toBeNull();
    }
  });

  it('throws the named error from the decoder it picked', () => {
    expect(() => decodeOralbValue('ff04', bytes('03'), 8)).toThrow(OralbFrameError);
  });

  it('decodes the retained session through the record decoder', () => {
    const delta = decodeOralbValue('ff29', bytes('26e4ff3161017800800064000a001321280201045e'), 8);
    expect(delta?.record).toMatchObject({ kind: 'session', sessionId: 353 });
  });

  it('refuses the retained session when the protocol is not known', () => {
    expect(() =>
      decodeOralbValue('ff29', bytes('26e4ff3161017800800064000a001321280201045e'), null),
    ).toThrow(UnsupportedOralbProtocol);
  });
});

describe('the S4 capture of a 51 second session', () => {
  const log = capture();

  it('decodes every one of the 172 notifications', () => {
    expect(log.notifications).toHaveLength(172);
    for (const { characteristic, hex } of log.notifications) {
      expect(decodeOralbValue(characteristic, bytes(hex), 8)).not.toBeNull();
    }
  });

  it('ticks the timer once a second from the start of the session', () => {
    const timers = log.notifications
      .filter(({ characteristic }) => characteristic === 'ff08')
      .map(({ hex }) => decodeOralbTimer(bytes(hex)).timerS ?? -1);
    expect(timers).toHaveLength(167);
    expect(Math.max(...timers)).toBe(167);
  });

  it('runs from the running state to the post brushing summary', () => {
    const states = log.notifications
      .filter(({ characteristic }) => characteristic === 'ff04')
      .map(({ hex }) => decodeOralbState(bytes(hex)).state);
    expect(states).toEqual([3, 10]);
  });

  it('reads the initial values the same way as the research', () => {
    expect(decodeOralbDeviceInfo(bytes(log.initial.ff02))).toEqual({
      modelId: 0x36,
      protocol: 8,
      firmware: 0x52,
    });
    expect(decodeOralbModeSlots(bytes(log.initial.ff25)).modeSlots).toEqual([
      11, 0, 1, 3, 2, 4, 6, 7,
    ]);
    expect(decodeOralbPacerConfig(bytes(log.initial.ff26))).toMatchObject({
      pacerSectorCount: 0,
      pacerTargetS: 0,
    });
    expect(decodeOralbPacer(bytes(log.initial.ff09)).sector).toEqual({
      position: 1,
      last: false,
    });
  });

  it('shows no sector while the pacer is off', () => {
    const sectors = log.notifications.filter(({ characteristic }) => characteristic === 'ff09');
    expect(sectors).toHaveLength(1);
    expect(decodeOralbPacer(bytes(sectors[0]?.hex ?? '')).sector).toEqual({
      position: null,
      last: false,
    });
  });
});

describe('the identifiers', () => {
  it('expands a short key on the Oral-B base', () => {
    expect(oralbUuid('ff05')).toBe('a0f0ff05-5047-4d53-8208-4f72616c2d42');
    expect(oralbUuid('FF05')).toBe('a0f0ff05-5047-4d53-8208-4f72616c2d42');
    expect(oralbFullOf('FF2D')).toBe('a0f0ff2d-5047-4d53-8208-4f72616c2d42');
    expect(oralbFullOf('2a19')).toBe('2a19');
    expect(oralbFullOf('ff123')).toBe('ff123');
  });

  it('shortens a full uuid of the base and leaves any other alone', () => {
    expect(oralbShortOf('A0F0FF05-5047-4D53-8208-4F72616C2D42')).toBe('ff05');
    expect(oralbShortOf('a0f0ff05-5047-4d53-8208-4f72616c2d43')).toBe(
      'a0f0ff05-5047-4d53-8208-4f72616c2d43',
    );
    expect(oralbShortOf('b0f0ff05-5047-4d53-8208-4f72616c2d42')).toBe(
      'b0f0ff05-5047-4d53-8208-4f72616c2d42',
    );
    expect(oralbShortOf('a0f0ff055-5047-4d53-8208-4f72616c2d42')).toBe(
      'a0f0ff055-5047-4d53-8208-4f72616c2d42',
    );
    expect(oralbShortOf('ff05')).toBe('ff05');
    expect(oralbShortOf('FF05')).toBe('ff05');
  });

  it('names the three services', () => {
    expect(ORALB_SERVICE).toEqual({
      brush: 'a0f0ff00-5047-4d53-8208-4f72616c2d42',
      config: 'a0f0ff20-5047-4d53-8208-4f72616c2d42',
      firmware: 'a0f0ff80-5047-4d53-8208-4f72616c2d42',
    });
  });

  it('finds the service of a characteristic by its key', () => {
    expect(oralbServiceOf('ff05')).toBe(ORALB_SERVICE.brush);
    expect(oralbServiceOf('FF0B')).toBe(ORALB_SERVICE.brush);
    expect(oralbServiceOf('ff22')).toBe(ORALB_SERVICE.config);
    expect(oralbServiceOf('ff2d')).toBe(ORALB_SERVICE.config);
    expect(oralbServiceOf('ff81')).toBe(ORALB_SERVICE.firmware);
    expect(oralbServiceOf('ff15')).toBeNull();
    expect(oralbServiceOf('ff95')).toBeNull();
    expect(oralbServiceOf('fe05')).toBeNull();
    expect(oralbServiceOf('2a19')).toBeNull();
    expect(oralbServiceOf('ff005')).toBeNull();
  });

  it('scans for the Oral-B company id', () => {
    expect(ORALB_COMPANY_ID).toBe(220);
    expect(ORALB_SCAN_MANUFACTURER).toEqual({ companyId: 220 });
  });
});

describe('the named errors', () => {
  const wrong = 'ab'.repeat(13);
  const received = `13 bytes ${wrong}`;

  const cases: readonly (readonly [string, string, string, number | null])[] = [
    ['ff01', 'FF01', '6 bytes', 8],
    ['ff02', 'FF02', '3 bytes', 8],
    ['ff03', 'FF03', '1 bytes', 8],
    ['ff04', 'FF04', '2 bytes', 8],
    ['ff06', 'FF06', '1 or 2 bytes', 8],
    ['ff07', 'FF07', '1 bytes', 8],
    ['ff08', 'FF08', '2 bytes', 8],
    ['ff09', 'FF09', '3 bytes', 8],
    ['ff0a', 'FF0A', '1 bytes', 8],
    ['ff0b', 'FF0B', '1 or 10 bytes', 8],
    ['ff22', 'FF22', '4 bytes', 8],
    ['ff25', 'FF25', '8 bytes', 8],
    ['ff26', 'FF26', '8 bytes', 8],
    ['ff2b', 'FF2B', '4 bytes', 8],
    ['ff2d', 'FF2D', '5 bytes', 8],
    ['ff29', 'FF29', 'at least 21 bytes', 8],
  ];

  it.each(cases)('says what %s needs and what it got', (key, name, expected, protocol) => {
    const attempt = (): unknown =>
      decodeOralbValue(key, key === 'ff29' ? bytes('abab') : bytes(wrong), protocol);
    expect(attempt).toThrow(
      expect.objectContaining({
        name: 'OralbFrameError',
        characteristic: name,
        expected,
        received: key === 'ff29' ? '2 bytes abab' : received,
      }),
    );
  });

  it('describes an empty battery and a short header', () => {
    expect(() => decodeOralbValue('ff05', bytes(''), 8)).toThrow(
      expect.objectContaining({
        characteristic: 'FF05',
        expected: 'at least 1 bytes',
        received: '0 bytes ',
      }),
    );
    expect(() => decodeOralbValue('ff29', bytes('abab'), 6)).toThrow(
      expect.objectContaining({ characteristic: 'FF29', expected: 'at least 8 bytes' }),
    );
  });

  it('builds a readable message', () => {
    expect(() => decodeOralbValue('ff04', bytes('03'), 8)).toThrow(
      'Oral-B frame on FF04 is unreadable: expected 2 bytes, received 1 bytes 03.',
    );
  });

  it('names the advert and the protocol gate', () => {
    expect(() => decodeOralbAdvert(bytes('0608'))).toThrow(
      expect.objectContaining({
        name: 'OralbFrameError',
        characteristic: 'advert',
        expected: 'at least 11 bytes',
        received: '2 bytes 0608',
      }),
    );
    expect(() => requireIoProtocol(3)).toThrow(
      expect.objectContaining({ name: 'UnsupportedOralbProtocol', protocol: 3 }),
    );
    expect(() => requireIoProtocol(3)).toThrow(
      'Oral-B protocol 3 is not an iO protocol and is not supported.',
    );
  });

  it('names the refusal of an encoder', () => {
    expect(() => readSelect(30)).toThrow(expect.objectContaining({ name: 'OralbRefusedError' }));
    expect(new OralbRefusedError('x').message).toBe('x');
  });
});
