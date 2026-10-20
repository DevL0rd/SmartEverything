import {
  LOG_REQUESTS,
  TRIGGER_TYPES,
  TYPE_URL_PREFIX,
  concatBytes,
  encodeBytes,
  encodeFixed32,
  encodeFloat,
  encodeMessage,
  encodeString,
  encodeVarint,
  fieldsOf,
  readBytes,
  readFixed32,
  readMessage,
  readVarint,
  requestIdOf,
  requestNameOfFrame,
  type LogRows,
} from '@smarteverything/ble';
import type { BottleDeviceInformation } from '@smarteverything/domain';

export interface CapReminder {
  state: number;
  start: number;
  stop: number;
  interval: number;
  colour: readonly [number, number, number];
}

export interface CapQuiet {
  state: number;
  start: number;
  stop: number;
  snooze: number;
}

interface LogSource<R extends { readonly at: number }> {
  readonly rows: R[];
  readonly encode: (row: R) => Uint8Array;
}

const ANSWER_OK = 1;

const ANSWER_UNSUPPORTED = 2;

const REQUEST_PREFIX = 'Request';

const WRITES: ReadonlySet<string> = new Set([
  'RequestSetCapTimeSettings',
  'RequestSetCapHydroReminderSettings',
  'RequestSetCapDoNotDisturbSettings',
  'RequestSetCapUvActivate',
]);

function floatOf(bits: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, bits, true);
  return view.getFloat32(0, true);
}

function pageOf<R extends { readonly at: number }>(
  source: LogSource<R>,
  from: number,
  limit: number,
): Uint8Array {
  return concatBytes(
    ...source.rows
      .filter((row) => row.at > from)
      .sort((left, right) => left.at - right.at)
      .slice(0, limit)
      .map((row) => encodeMessage(1, source.encode(row))),
  );
}

function adcBytes(row: LogRows['activation_adc']): Uint8Array {
  return concatBytes(
    encodeVarint(1, row.at),
    encodeFloat(2, row.batteryVolt),
    encodeFloat(3, row.batteryOhm),
    encodeFloat(4, row.uvLedVolt),
    encodeFloat(5, row.uvLedMa),
    encodeFloat(6, row.uvLedOhm),
    encodeFloat(7, row.pcbOhm),
  );
}

export class FakeCap {
  uiState = 0;
  powerSaving = 1;
  battery = 61;
  clockMs: number;
  readonly tof: LogSource<LogRows['tof']> = {
    rows: [],
    encode: (row) =>
      concatBytes(
        encodeVarint(1, row.at),
        encodeVarint(
          2,
          TRIGGER_TYPES.findIndex((name) => name === row.trigger),
        ),
        encodeFixed32(3, row.distanceMm),
        encodeFixed32(4, row.kcps),
        encodeFloat(5, row.ledOhm),
      ),
  };
  readonly activation: LogSource<LogRows['activation']> = {
    rows: [],
    encode: (row) =>
      concatBytes(
        encodeVarint(1, row.at),
        encodeVarint(2, ['maintenance', 'normal', 'adventure'].indexOf(row.mode)),
        encodeFixed32(3, row.socPct),
      ),
  };
  readonly faults: LogSource<LogRows['fault']> = {
    rows: [],
    encode: (row) => concatBytes(encodeVarint(1, row.at), encodeVarint(2, 2)),
  };
  readonly states: LogSource<LogRows['state']> = {
    rows: [],
    encode: (row) =>
      concatBytes(
        encodeVarint(1, row.at),
        encodeVarint(2, row.hall ? 1 : 0),
        encodeVarint(3, row.bottle ? 1 : 0),
        encodeFloat(6, row.bottleValue),
      ),
  };
  readonly activationAdc: LogSource<LogRows['activation_adc']> = { rows: [], encode: adcBytes };
  readonly chargingAdc: LogSource<LogRows['charging_adc']> = { rows: [], encode: adcBytes };
  reminder: CapReminder = { state: 0, start: 1, stop: 86_400, interval: 0, colour: [0, 0, 1] };
  quiet: CapQuiet = { state: 0, start: 79_200, stop: 25_200, snooze: 0 };
  accel: readonly [number, number, number] = [0, 0, 1];
  tofState = { distanceMm: 120, kcps: 6000 };
  readonly unsupported = new Set<string>();
  readonly writes: string[] = [];
  readonly uvModes: number[] = [];
  readonly received: string[] = [];
  information: BottleDeviceInformation = {
    manufacturer: 'LARQ',
    model: 'PureVis 2',
    serial: '0123456789ABCDEF',
    firmware: '2.3.1',
    hardware: 'C',
    software: '1.17',
  };

  constructor(startMs: number) {
    this.clockMs = startMs;
  }

  handle(frame: Uint8Array): Uint8Array {
    const name = requestNameOfFrame(frame);
    this.received.push(name);
    const id = requestIdOf(frame);
    if (this.unsupported.has(name)) {
      return concatBytes(encodeFixed32(1, id), encodeVarint(2, ANSWER_UNSUPPORTED));
    }
    const value = readBytes(readMessage(fieldsOf(frame), 2), 2);
    const head = concatBytes(encodeFixed32(1, id), encodeVarint(2, ANSWER_OK));
    if (WRITES.has(name)) {
      this.write(name, value);
      return head;
    }
    const type = `${TYPE_URL_PREFIX}Response${name.slice(REQUEST_PREFIX.length)}`;
    return concatBytes(
      head,
      encodeMessage(3, concatBytes(encodeString(1, type), encodeBytes(2, this.read(name, value)))),
    );
  }

  private write(name: string, value: Uint8Array): void {
    const settings = readMessage(fieldsOf(value), 1);
    if (name === 'RequestSetCapTimeSettings') {
      this.clockMs = readVarint(settings, 1);
    } else if (name === 'RequestSetCapHydroReminderSettings') {
      this.writes.push('reminder');
      const colour = readMessage(settings, 5);
      this.reminder = {
        state: readVarint(settings, 1),
        start: readFixed32(settings, 2),
        stop: readFixed32(settings, 3),
        interval: readFixed32(settings, 4),
        colour: [
          floatOf(readFixed32(colour, 1)),
          floatOf(readFixed32(colour, 2)),
          floatOf(readFixed32(colour, 3)),
        ],
      };
    } else if (name === 'RequestSetCapDoNotDisturbSettings') {
      this.writes.push('quiet');
      this.quiet = {
        state: readVarint(settings, 1),
        start: readFixed32(settings, 2),
        stop: readFixed32(settings, 3),
        snooze: readFixed32(settings, 4),
      };
    } else {
      this.writes.push('uv');
      this.uvModes.push(readVarint(fieldsOf(value), 1));
    }
  }

  private read(name: string, value: Uint8Array): Uint8Array {
    const nested = (...parts: Uint8Array[]): Uint8Array => encodeMessage(1, concatBytes(...parts));
    switch (name) {
      case 'RequestGetCapUiState':
        return concatBytes(encodeVarint(1, this.uiState), encodeVarint(2, this.powerSaving));
      case 'RequestGetCapTimeSettings':
        return nested(encodeVarint(1, this.clockMs));
      case 'RequestGetCapTofState':
        return nested(
          encodeFixed32(1, this.tofState.distanceMm),
          encodeFixed32(2, this.tofState.kcps),
        );
      case 'RequestGetCapAccelerometerState':
        return nested(
          encodeFloat(1, this.accel[0]),
          encodeFloat(2, this.accel[1]),
          encodeFloat(3, this.accel[2]),
        );
      case 'RequestGetCapHydroReminderSettings':
        return this.reminderBody();
      case 'RequestGetCapDoNotDisturbSettings':
        return nested(
          encodeVarint(1, this.quiet.state),
          encodeFixed32(2, this.quiet.start),
          encodeFixed32(3, this.quiet.stop),
          encodeFixed32(4, this.quiet.snooze),
        );
      default:
        return this.more(name, value);
    }
  }

  private reminderBody(): Uint8Array {
    const { state, start, stop, interval, colour } = this.reminder;
    return encodeMessage(
      1,
      concatBytes(
        encodeVarint(1, state),
        encodeFixed32(2, start),
        encodeFixed32(3, stop),
        encodeFixed32(4, interval),
        encodeMessage(
          5,
          concatBytes(
            encodeFloat(1, colour[0]),
            encodeFloat(2, colour[1]),
            encodeFloat(3, colour[2]),
            encodeFloat(4, 1),
          ),
        ),
      ),
    );
  }

  private more(name: string, value: Uint8Array): Uint8Array {
    const nested = (...parts: Uint8Array[]): Uint8Array => encodeMessage(1, concatBytes(...parts));
    switch (name) {
      case 'RequestGetCapLowBatterySettings':
        return nested(encodeFixed32(1, 20), encodeFixed32(2, 5));
      case 'RequestGetCapTofSettings':
        return nested(
          encodeVarint(1, 2),
          encodeVarint(2, 1),
          encodeFixed32(3, 300),
          encodeFixed32(4, 5),
          encodeFixed32(5, 1000),
          encodeFixed32(6, 10),
        );
      case 'RequestGetCapUvConfig':
        return nested(
          encodeMessage(1, concatBytes(encodeVarint(1, 10), encodeVarint(2, 100))),
          encodeMessage(2, concatBytes(encodeVarint(1, 60), encodeVarint(2, 120))),
          encodeMessage(3, concatBytes(encodeVarint(1, 180), encodeVarint(2, 150))),
        );
      case 'RequestGetCapStateThresholdSettings':
        return nested(encodeFixed32(1, 11), encodeFixed32(2, 12), encodeFixed32(3, 13));
      case 'RequestGetCapAdcProtectionSettings':
        return nested(
          encodeMessage(1, encodeFloat(1, 1000)),
          encodeMessage(2, encodeFloat(1, 2000)),
        );
      case 'RequestGetCapCalibrationSettings':
        return nested(encodeFixed32(1, 120));
      default:
        return this.logs(name, value);
    }
  }

  private logs(name: string, value: Uint8Array): Uint8Array {
    const query = readMessage(fieldsOf(value), 1);
    const from = readVarint(query, 1);
    const limit = readFixed32(query, 2);
    switch (name) {
      case LOG_REQUESTS.tof:
        return pageOf(this.tof, from, limit);
      case LOG_REQUESTS.activation:
        return pageOf(this.activation, from, limit);
      case LOG_REQUESTS.fault:
        return pageOf(this.faults, from, limit);
      case LOG_REQUESTS.state:
        return pageOf(this.states, from, limit);
      case LOG_REQUESTS.activation_adc:
        return pageOf(this.activationAdc, from, limit);
      case LOG_REQUESTS.charging_adc:
        return pageOf(this.chargingAdc, from, limit);
      default:
        return new Uint8Array(0);
    }
  }
}
