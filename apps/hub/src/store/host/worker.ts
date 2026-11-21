import { parentPort, workerData } from 'node:worker_threads';
import { Logger, background, shippedRecord } from '@smarteverything/logging';
import { z } from 'zod';
import { hostErrorOf } from './errors';
import { openHostStore, type HostStore } from './host-store';
import {
  HOST_DATA,
  TO_HOST,
  type FromHost,
  type HostEvent,
  type HostTarget,
  type ToHost,
} from './protocol';
import { READ_UNITS, WRITE_UNITS } from './registry';

const port = parentPort;
if (port === null) throw new Error('The store host needs a parent port.');
const data = HOST_DATA.parse(workerData);
const post = (message: FromHost): void => {
  port.postMessage(message);
};

Logger.configure({
  level: data.level,
  context: { platform: 'server', release: data.release },
  sink: (record) => {
    if (record.level !== 'none') post({ type: 'log', record: shippedRecord(record, 'server') });
  },
});

export class StoreHostTargetError extends Error {
  override readonly name = 'StoreHostTargetError';

  constructor(readonly target: string) {
    super(`The store host has no ${target}.`);
  }
}

let clock = new Date(data.now);
const now = (): Date => clock;

const log = new Logger('hub.store-host');
const store = openHostStore({
  path: data.path,
  driveFolders: data.driveFolders,
  readOnly: data.readOnly,
  busyTimeoutMs: data.busyTimeoutMs,
  log,
  now,
});

let events: HostEvent[] = [];
let committed = false;
store.feed.subscribe(({ seq: _seq, ...change }) => {
  events.push({ kind: 'row', change });
});
store.feed.subscribeNotices((notice) => {
  events.push({ kind: 'notice', notice });
});
store.feed.subscribeSpeech((speech) => {
  events.push({ kind: 'speech', speech });
});
store.feed.subscribeAccess(() => {
  events.push({ kind: 'access' });
});
store.feed.subscribeCommitted(() => {
  committed = true;
});

function drained(): { readonly events: HostEvent[]; readonly committed: boolean } {
  const settled = { events, committed };
  events = [];
  committed = false;
  return settled;
}

const ARGUMENTS = z.array(z.unknown());

function member(owner: unknown, name: string): unknown {
  if (typeof owner !== 'object' || owner === null || !(name in owner))
    throw new StoreHostTargetError(name);
  const value: unknown = Reflect.get(owner, name);
  return value;
}

function repositoryCall(path: readonly string[], input: unknown): unknown {
  const [repository = '', ...rest] = path;
  const method = rest.pop();
  if (method === undefined) throw new StoreHostTargetError(path.join('.'));
  const owner = rest.reduce<unknown>(
    (value, name) => member(value, name),
    member(store, repository),
  );
  const fn = member(owner, method);
  if (typeof fn !== 'function') throw new StoreHostTargetError(path.join('.'));
  const value: unknown = Reflect.apply(fn, owner, ARGUMENTS.parse(input));
  return value;
}

function unitCall(host: HostStore, name: string, input: unknown): unknown {
  if (Object.hasOwn(READ_UNITS, name)) {
    const unit = member(READ_UNITS, name);
    return runUnit(unit, host, input, false);
  }
  if (data.readOnly || !Object.hasOwn(WRITE_UNITS, name))
    throw new StoreHostTargetError(`unit ${name}`);
  return runUnit(member(WRITE_UNITS, name), host, input, true);
}

function bare(unit: unknown): boolean {
  return typeof unit === 'object' && unit !== null && 'bare' in unit && unit.bare === true;
}

function runUnit(unit: unknown, host: HostStore, input: unknown, write: boolean): unknown {
  const run = member(unit, 'run');
  if (typeof run !== 'function') throw new StoreHostTargetError('unit runner');
  const call = (): unknown => {
    const value: unknown = Reflect.apply(run, unit, [host, input]);
    return value;
  };
  if (!write || bare(unit)) return call();
  return member(unit, 'durable') === true ? host.durableWrite(call) : host.write(call);
}

function execute(target: HostTarget, input: unknown): unknown {
  return target.kind === 'unit'
    ? unitCall(store, target.name, input)
    : repositoryCall(target.path, input);
}

function answered(id: number, outcome: () => unknown): void {
  let value: unknown;
  let failure: unknown = null;
  try {
    value = outcome();
  } catch (cause) {
    failure = cause;
  }
  const settled = drained();
  if (failure === null) {
    try {
      post({ type: 'reply', id, value, ...settled });
      return;
    } catch (cause) {
      failure = cause;
    }
  }
  post({ type: 'failure', id, error: hostErrorOf(failure), ...settled });
}

async function handle(call: Extract<ToHost, { type: 'call' }>): Promise<void> {
  clock = new Date(call.now);
  let outcome: () => unknown;
  try {
    const value = execute(call.target, call.input);
    outcome = (): unknown => value;
  } catch (cause) {
    outcome = (): never => {
      throw cause;
    };
  }
  await Promise.resolve();
  answered(call.id, outcome);
}

let tail: Promise<void> = Promise.resolve();

port.on('message', (raw: unknown) => {
  const message = TO_HOST.parse(raw);
  if (message.type === 'commit') {
    store.context.foreignCommitted();
    return;
  }
  tail = tail.then(() => handle(message));
  background(tail, 'store.host_call_crashed');
});
