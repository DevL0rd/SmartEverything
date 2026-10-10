import { base64Hex, chunks, lenientHex, type Converter } from './primitives';

interface Alarm {
  readonly code: string;
  readonly scale: number | null;
}

const ALARMS: ReadonlyMap<number, Alarm> = new Map([
  [1, { code: 'overcurrent', scale: 0 }],
  [2, { code: 'three_phase_current_imbalance', scale: 0 }],
  [3, { code: 'ammeter_overvoltage', scale: 0 }],
  [4, { code: 'under_voltage', scale: 0 }],
  [5, { code: 'three_phase_current_loss', scale: null }],
  [6, { code: 'power_failure', scale: null }],
  [7, { code: 'magnetic', scale: null }],
  [8, { code: 'insufficient_balance', scale: 0 }],
  [9, { code: 'arrears', scale: null }],
  [10, { code: 'battery_overvoltage', scale: 2 }],
  [11, { code: 'cover_open', scale: null }],
  [12, { code: 'meter_cover_open', scale: null }],
  [13, { code: 'fault', scale: null }],
]);

function pythonFloatText(value: number): string {
  return Number.isInteger(value) ? `${String(value)}.0` : String(value);
}

type Reader = (start: number, end?: number) => number;

function readerOf(name: string, hex: string): Reader {
  return (start, end) => lenientHex(name, hex.slice(start, end));
}

function hexConverter(name: string, read: (field: Reader, hex: string) => unknown): Converter {
  return (raw) => {
    const hex = base64Hex(name, raw);
    return read(readerOf(name, hex), hex);
  };
}

const alarms = hexConverter('db_v1_alarm', (_field, hex) =>
  JSON.stringify(
    chunks(hex, 8).flatMap((part) => {
      const field = readerOf('db_v1_alarm', part);
      const alarm = ALARMS.get(field(0, 2));
      if (alarm === undefined) {
        return [];
      }
      const doAction = field(2, 4) === 1;
      if (alarm.scale === null) {
        return [{ alarmCode: alarm.code, doAction }];
      }
      const threshold = field(4, 8) / 10 ** alarm.scale;
      return [
        {
          alarmCode: alarm.code,
          doAction,
          threshold: alarm.scale > 0 ? pythonFloatText(threshold) : String(Math.trunc(threshold)),
        },
      ];
    }),
  ),
);

const daily = hexConverter('db_v1_daily', (field) =>
  JSON.stringify({
    startMonth: field(0, 2),
    startDay: field(2, 4),
    endMonth: field(4, 6),
    endDay: field(6, 8),
    electricTotal: field(8, 16) / 100,
  }),
);

const data = hexConverter('db_v1_data', (field) =>
  JSON.stringify({
    power: field(0, 8) / 100,
    year: field(8, 10),
    month: field(10, 12),
    date: field(12, 14),
    hour: field(14, 16),
    minute: field(16, 18),
    second: field(18, 20),
  }),
);

const frozen = hexConverter('db_v1_frozen', (field) =>
  JSON.stringify({ day: field(0, 2), hour: field(2, 4) }),
);

const month = hexConverter('db_v1_month', (field) =>
  JSON.stringify({
    startYear: field(0, 2),
    startMonth: field(2, 4),
    endYear: field(4, 6),
    endMonth: field(6, 8),
    electricTotal: field(8, 16) / 100,
  }),
);

function fullFrame(field: Reader): Record<string, number> {
  return {
    voltage: field(4, 8) / 10,
    electricCurrent: field(8, 14) / 1000,
    power: field(14, 20) / 1000,
    reactivePower: field(20, 26) / 1000,
    apparentPower: field(26, 32) / 1000,
    powerFactor: field(32, 34) / 100,
  };
}

const SIGN_BITS: readonly (readonly [number, string])[] = [
  [0x1, 'electricCurrent'],
  [0x2, 'power'],
  [0x4, 'reactivePower'],
  [0x8, 'powerFactor'],
];

function signedFrame(field: Reader): Record<string, number> {
  const frame = fullFrame(field);
  const sign = field(34, 36);
  for (const [bit, key] of SIGN_BITS) {
    const value = frame[key];
    if ((sign & bit) !== 0 && value !== undefined) {
      frame[key] = -value;
    }
  }
  return frame;
}

const params: Converter = (raw) => {
  const hex = base64Hex('db_v1_params', raw).toLowerCase();
  const field = readerOf('db_v1_params', hex);
  if (hex.length >= 34 && hex.startsWith('010f')) {
    return JSON.stringify(fullFrame(field));
  }
  if (hex.length >= 36 && hex.startsWith('020f')) {
    return JSON.stringify(signedFrame(field));
  }
  return JSON.stringify({
    voltage: field(0, 4) / 10,
    electricCurrent: field(4, 10) / 1000,
    power: field(10, 16) / 1000,
  });
};

const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const IDLE_DAY = '0000000000000000';

const tariff = hexConverter('db_v1_tariff', (_field, hex) => {
  const days = chunks(hex, 12);
  if (days.length !== WEEK.length) {
    return '';
  }
  const periods = days.map((day) =>
    day === IDLE_DAY
      ? []
      : chunks(day, 4).map((period) => {
          const field = readerOf('db_v1_tariff', period);
          return { start_time: String(field(0, 2)), end_time: String(field(2, 4)) };
        }),
  );
  return JSON.stringify(Object.fromEntries(WEEK.map((name, index) => [name, periods[index]])));
});

export const METERING: Readonly<Record<string, Converter>> = {
  db_v1_alarm: alarms,
  db_v1_daily: daily,
  db_v1_data: data,
  db_v1_frozen: frozen,
  db_v1_month: month,
  db_v1_params: params,
  db_v1_tariff: tariff,
};
