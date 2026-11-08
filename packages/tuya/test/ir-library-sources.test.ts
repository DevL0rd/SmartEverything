import { describe, expect, it } from 'vitest';
import {
  FlipperProtocolUnsupportedError,
  IrCodeError,
  LIBRARY_ENTRY,
  LibraryPackError,
  buildPack,
  pulsesFromBase64,
  readFlipperFile,
  readPackIndex,
  readPackModel,
  readSmartIrClimate,
  type PackedModel,
  type SmartIrClimate,
} from '../src';
import { SmartIrFileError, withoutTrailingCommas } from '../src/ir-library/smartir';

function broadlink(units: readonly number[]): string {
  const header = [0x26, 0x00, units.length & 0xff, units.length >> 8];
  return Buffer.from([...header, ...units]).toString('base64');
}

const OFF = broadlink([0x17, 0x11, 0x17]);
const COOL_LOW_24 = broadlink([0x20, 0x11, 0x20]);
const COOL_HIGH_24 = broadlink([0x30, 0x11, 0x30]);
const HEAT_LOW = broadlink([0x40, 0x11, 0x40]);
const SWUNG = broadlink([0x50, 0x11, 0x50]);

function ticks(count: number): number {
  return Math.round((count * 8192) / 269);
}

function pulsesAt(
  read: SmartIrClimate,
  mode: string,
  fan: string,
  temperature?: string,
): readonly number[] {
  const command = read.climate.commands[mode]?.[fan];
  const code = typeof command === 'string' ? command : command?.[temperature ?? ''];
  return pulsesFromBase64(code ?? '');
}

function climate(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    manufacturer: 'Acme',
    supportedModels: ['A1', 'A2'],
    supportedController: 'Broadlink',
    commandsEncoding: 'Base64',
    minTemperature: 16,
    maxTemperature: 30,
    precision: 1,
    operationModes: ['cool', 'heat', 'dry'],
    fanModes: ['low', 'high'],
    commands: {
      off: OFF,
      cool: { low: { '24': COOL_LOW_24 }, high: { '24': COOL_HIGH_24 } },
      heat: { low: HEAT_LOW },
    },
    ...overrides,
  });
}

describe('SmartIR trailing commas', () => {
  it('drops a comma before a closing bracket but not inside strings', () => {
    expect(withoutTrailingCommas('{"a": [1, 2,], "b": "x,}",\n}')).toBe(
      '{"a": [1, 2], "b": "x,}"\n}',
    );
    expect(withoutTrailingCommas('{"q": "say \\", ]"}')).toBe('{"q": "say \\", ]"}');
  });
});

describe('reading a SmartIR air conditioner file', () => {
  it('turns every command into a Tuya pulse code and keeps the modes that have commands', () => {
    const read = readSmartIrClimate(climate({}));
    expect(read.brand).toBe('Acme');
    expect(read.models).toStrictEqual(['A1', 'A2']);
    expect(Object.keys(read.climate.commands)).toStrictEqual(['cool', 'heat']);
    expect(pulsesFromBase64(read.climate.off)).toStrictEqual([700, 518, 700]);
    expect(pulsesAt(read, 'cool', 'high', '24')).toStrictEqual([
      ticks(0x30),
      ticks(0x11),
      ticks(0x30),
    ]);
    expect(pulsesAt(read, 'cool', 'low', '24')).toStrictEqual([
      ticks(0x20),
      ticks(0x11),
      ticks(0x20),
    ]);
    expect(pulsesAt(read, 'heat', 'low')).toStrictEqual([ticks(0x40), ticks(0x11), ticks(0x40)]);
    expect(Object.keys(read.climate.commands['heat'] ?? {})).toStrictEqual(['low']);
  });

  it('reads a trailing comma and picks the off swing position when commands are split by swing', () => {
    const text = climate({
      swingModes: ['Top', 'Off'],
      commands: {
        off: OFF,
        cool: { low: { Top: { '24': HEAT_LOW }, Off: { '24': SWUNG } } },
      },
    }).replace(/\}$/, ',}');
    const read = readSmartIrClimate(text);
    expect(pulsesAt(read, 'cool', 'low', '24')).toStrictEqual([
      ticks(0x50),
      ticks(0x11),
      ticks(0x50),
    ]);
  });

  it('leaves out a mode none of whose fan speeds has a command', () => {
    const read = readSmartIrClimate(
      climate({
        operationModes: ['cool', 'heat'],
        commands: { off: OFF, cool: { low: { '24': COOL_LOW_24 } }, heat: { turbo: HEAT_LOW } },
      }),
    );
    expect(Object.keys(read.climate.commands)).toStrictEqual(['cool']);
  });

  it('keeps a mode whose fan speeds carry one code each', () => {
    const read = readSmartIrClimate(
      climate({ operationModes: ['fan_only'], commands: { off: OFF, fan_only: { low: SWUNG } } }),
    );
    expect(pulsesAt(read, 'fan_only', 'low')).toStrictEqual([
      ticks(0x50),
      ticks(0x11),
      ticks(0x50),
    ]);
  });

  it('decodes ESPHome and LOOKin raw commands', () => {
    const esphome = readSmartIrClimate(
      climate({
        supportedController: 'ESPHome',
        commandsEncoding: 'Raw',
        commands: {
          off: '[9000, -4500, 560, -560]',
          cool: { low: { '24': '[9000, -4500, 560, -560]' } },
        },
      }),
    );
    expect(pulsesFromBase64(esphome.climate.off)).toStrictEqual([9000, 4500, 560, 560]);
    const lookin = readSmartIrClimate(
      climate({
        supportedController: 'LOOKin',
        commandsEncoding: 'Raw',
        commands: { off: '9040 -4410 650 -1590', cool: { low: { '24': '9040 -4410 650 -1590' } } },
      }),
    );
    expect(pulsesFromBase64(lookin.climate.off)).toStrictEqual([9040, 4410, 650, 1590]);
  });

  it('refuses a file with no off command, no usable mode or an encoding it cannot read', () => {
    expect(() =>
      readSmartIrClimate(climate({ commands: { cool: { low: { '24': OFF } } } })),
    ).toThrow(SmartIrFileError);
    expect(() => readSmartIrClimate(climate({ operationModes: ['dry'] }))).toThrow(
      /none of its operation modes/,
    );
    expect(() =>
      readSmartIrClimate(climate({ supportedController: 'Xiaomi', commandsEncoding: 'Raw' })),
    ).toThrow(/Xiaomi Raw command encoding has no decoder/);
    expect(() =>
      readSmartIrClimate(climate({ commands: { off: 'AAAA', cool: { low: { '24': OFF } } } })),
    ).toThrow(IrCodeError);
  });
});

const FLIPPER = `Filetype: IR signals file
Version: 1
#
# Living room TV
#
name: POWER
type: parsed
protocol: NECext
address: 04 00 00 00
command: 08 00 00 00
#
name: Mute
type: raw
frequency: 38000
duty_cycle: 0.330000
data: 9000 4500 560 560 560
#
name: Menu
type: parsed
protocol: Kaseikyo
address: 01 02 03 00
command: 04 00 00 00
#
name: Odd
type: parsed
protocol: NEC
address: FF FF 00 00
command: 01 00 00 00
`;

describe('reading a Flipper file', () => {
  it('reads parsed and raw signals and reports the ones it cannot encode', () => {
    const file = readFlipperFile(FLIPPER);
    expect(file.signals.map((signal) => signal.name)).toStrictEqual(['POWER', 'Mute']);
    expect(pulsesFromBase64(file.signals[1]?.code ?? '')).toStrictEqual([
      9000, 4500, 560, 560, 560,
    ]);
    expect(file.skipped).toHaveLength(2);
    expect(file.skipped[0]).toBeInstanceOf(FlipperProtocolUnsupportedError);
    expect(file.skipped[1]).toBeInstanceOf(IrCodeError);
  });

  it('reads the multi byte address little-endian', () => {
    const file = readFlipperFile(
      'name: A\ntype: parsed\nprotocol: NECext\naddress: 02 01 00 00\ncommand: 04 03 00 00\n',
    );
    const expected = readFlipperFile(
      'name: B\ntype: parsed\nprotocol: NECext\naddress: 02 01 00 00\ncommand: 04 03 00 00\n',
    );
    expect(file.signals[0]?.code).toBe(expected.signals[0]?.code);
    expect(pulsesFromBase64(file.signals[0]?.code ?? '').slice(0, 2)).toStrictEqual([9000, 4500]);
  });

  it('skips a signal whose fields are not a raw or parsed signal', () => {
    const file = readFlipperFile('name: A\ntype: parsed\nprotocol: NEC\n');
    expect(file.signals).toStrictEqual([]);
    expect(file.skipped).toHaveLength(1);
  });
});

describe('the library pack', () => {
  const entry: PackedModel['entry'] = {
    id: 'flipper:TVs/Acme/Set',
    source: 'flipper-irdb',
    kind: 'keys',
    category: 'TV',
    brand: 'Acme',
    models: ['Set'],
  };
  const keys = { kind: 'keys', keys: { Power: 'AAA=' } } as const;
  const sources = [{ source: 'flipper-irdb', licence: 'CC0-1.0', commit: 'abc' }] as const;

  it('stores each model in its own compressed slice that the index points at', () => {
    const pack = buildPack(sources, [
      { entry, model: keys },
      {
        entry: { ...entry, id: 'flipper:TVs/Acme/Two' },
        model: { kind: 'keys', keys: { Mute: 'AAA=' } },
      },
    ]);
    const index = readPackIndex(pack.index);
    expect(index.sources).toStrictEqual(sources);
    const [first, second] = index.entries.map((one) => LIBRARY_ENTRY.parse(one));
    expect(first?.offset).toBe(0);
    expect(second?.offset).toBe(first?.length);
    const slice = (one: typeof first): Buffer =>
      pack.models.subarray(one?.offset ?? 0, (one?.offset ?? 0) + (one?.length ?? 0));
    expect(first && readPackModel(first, slice(first))).toStrictEqual(keys);
    expect(second && readPackModel(second, slice(second))).toStrictEqual({
      kind: 'keys',
      keys: { Mute: 'AAA=' },
    });
  });

  it('refuses a slice of the wrong length and a model that does not fit its schema', () => {
    const pack = buildPack(sources, [{ entry, model: keys }]);
    const [placed] = readPackIndex(pack.index).entries;
    expect(() => readPackModel(LIBRARY_ENTRY.parse(placed), pack.models.subarray(1))).toThrow(
      LibraryPackError,
    );
    expect(() =>
      buildPack(sources, [{ entry, model: { kind: 'keys', keys: { Power: '' } } }]),
    ).toThrow();
  });
});
