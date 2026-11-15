import { APP_PLUGINS } from '../plugins/registry';
import { sameJson } from '../store/same-json';
import { rowsOf, type Device, type StoreState } from '../store/state';

type Streams = StoreState['tables']['plugin_streams'];
type Devices = StoreState['tables']['devices'];
type Automations = StoreState['tables']['automations'];
type Automation = Automations['rows'][number];

const LIVENESS_DETAILS: ReadonlySet<string> = new Set([
  'lastSeenAt',
  'lastSyncAt',
  'lastSeen',
  'uptimeSeconds',
  'pushSince',
]);

const RUN_FIELDS: ReadonlySet<string> = new Set([
  'run_count',
  'last_run_at',
  'last_error',
  'updated_at',
]);

function presence(value: unknown): 'absent' | 'null' | 'set' {
  if (value === undefined) {
    return 'absent';
  }
  return value === null ? 'null' : 'set';
}

function sameDetail(key: string, left: unknown, right: unknown): boolean {
  return LIVENESS_DETAILS.has(key) ? presence(left) === presence(right) : sameJson(left, right);
}

function sameDetails(left: Device['details'], right: Device['details']): boolean {
  if (left === right) {
    return true;
  }
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => sameDetail(key, Reflect.get(left, key), Reflect.get(right, key)));
}

function sameDevice(left: Device, right: Device): boolean {
  if (left === right) {
    return true;
  }
  const keys = Object.keys(left).filter((key) => key !== 'updated_at');
  return (
    keys.length === Object.keys(right).filter((key) => key !== 'updated_at').length &&
    keys.every((key) =>
      key === 'details'
        ? sameDetails(left.details, right.details)
        : Object.hasOwn(right, key) && sameJson(Reflect.get(left, key), Reflect.get(right, key)),
    )
  );
}

function sameRows<T extends object>(
  left: readonly T[],
  right: readonly T[],
  same: (before: T, after: T) => boolean,
): boolean {
  return (
    left.length === right.length &&
    left.every((row, index) => {
      const other = right[index];
      return other !== undefined && same(row, other);
    })
  );
}

export function sameSearchDevices(left: Devices, right: Devices): boolean {
  return left === right || sameRows(rowsOf(left), rowsOf(right), sameDevice);
}

function sameAutomation(left: Automation, right: Automation): boolean {
  if (left === right) {
    return true;
  }
  const keys = Object.keys(left).filter((key) => !RUN_FIELDS.has(key));
  return (
    keys.length === Object.keys(right).filter((key) => !RUN_FIELDS.has(key)).length &&
    keys.every(
      (key) =>
        Object.hasOwn(right, key) && sameJson(Reflect.get(left, key), Reflect.get(right, key)),
    )
  );
}

export function sameSearchAutomations(left: Automations, right: Automations): boolean {
  return left === right || sameRows(rowsOf(left), rowsOf(right), sameAutomation);
}

interface StreamText {
  readonly devices: Devices;
  readonly text: string;
}

const streamTexts = new WeakMap<Streams, StreamText>();

function streamSearchText(devices: Devices, streams: Streams): string {
  const known = streamTexts.get(streams);
  if (known?.devices === devices) {
    return known.text;
  }
  const items = rowsOf(devices)
    .filter((device) => !device.hidden)
    .flatMap((device) =>
      APP_PLUGINS.map((plugin) => plugin.devicePages?.search?.(device, streams) ?? []),
    );
  const text = JSON.stringify(items);
  streamTexts.set(streams, { devices, text });
  return text;
}

export function sameSearchStreams(devices: Devices, left: Streams, right: Streams): boolean {
  return left === right || streamSearchText(devices, left) === streamSearchText(devices, right);
}
