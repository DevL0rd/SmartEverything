import { z } from 'zod';
import type {
  BusCall,
  SessionBus,
  SignalListener,
  SignalRule,
} from '../node/controls/linux/dbus-session';

export const AVAHI_DESTINATION = 'org.freedesktop.Avahi';
export const AVAHI_SERVER = {
  destination: AVAHI_DESTINATION,
  path: '/',
  iface: `${AVAHI_DESTINATION}.Server`,
} as const;
export const AVAHI_PATH_REPLY = z.tuple([z.string().startsWith('/')]);
export type DiscoveryBus = Pick<SessionBus, 'call' | 'watch' | 'onError' | 'close'>;
const CALL_TIMEOUT_MS = 5000;

export class DiscoveryError extends Error {
  override readonly name = 'DiscoveryError';
  constructor(
    readonly operation: string,
    reason: string,
  ) {
    super(`DNS-SD ${operation} failed: ${reason}.`);
  }
}

export class DiscoveryCancelledError extends Error {
  override readonly name = 'DiscoveryCancelledError';
  constructor() {
    super('The DNS-SD generation ended.');
  }
}

interface BoundedOptions<T> {
  readonly signal?: AbortSignal;
  readonly disposeLate?: (result: T) => void;
  readonly abandoned?: () => void;
}

async function bounded<T>(
  operation: string,
  work: Promise<T>,
  options: BoundedOptions<T>,
): Promise<T> {
  const { signal, disposeLate, abandoned } = options;
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = (): void => {
    active = false;
  };
  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = (): void => {
      active = false;
      abandoned?.();
      reject(new DiscoveryCancelledError());
    };
    timer = setTimeout(() => {
      active = false;
      abandoned?.();
      reject(new DiscoveryError(operation, 'timed out'));
    }, CALL_TIMEOUT_MS);
    timer.unref();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted === true) abort();
  });
  try {
    return await Promise.race([
      work.then((result) => {
        if (!active) {
          disposeLate?.(result);
          throw new DiscoveryCancelledError();
        }
        return result;
      }),
      interrupted,
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function avahiCall(
  bus: DiscoveryBus,
  call: BusCall,
  signal?: AbortSignal,
): Promise<readonly unknown[]> {
  if (signal?.aborted === true) return Promise.reject(new DiscoveryCancelledError());
  return bounded(call.member, bus.call(call), signal === undefined ? {} : { signal });
}

export function mayFreeAvahiObject(signal: AbortSignal): boolean {
  return !signal.aborted || signal.reason === 'server';
}

export function avahiFree(
  bus: DiscoveryBus,
  path: string,
  iface: string,
): Promise<readonly unknown[]> {
  return avahiCall(bus, { destination: AVAHI_DESTINATION, path, iface, member: 'Free' });
}

interface ObjectOptions {
  readonly iface: string;
  readonly signal: AbortSignal;
  readonly failed: (cause: unknown) => void;
}

export function avahiObject(
  bus: DiscoveryBus,
  call: BusCall,
  options: ObjectOptions,
): Promise<string> {
  const { iface, signal, failed } = options;
  if (signal.aborted) return Promise.reject(new DiscoveryCancelledError());
  const work = bus.call(call).then((body) => AVAHI_PATH_REPLY.parse(body)[0]);
  const dispose = (path: string): void => {
    if (mayFreeAvahiObject(signal)) avahiFree(bus, path, iface).catch(failed);
  };
  return bounded(call.member, work, { signal, disposeLate: dispose }).then((path) => {
    if (signal.aborted) {
      dispose(path);
      throw new DiscoveryCancelledError();
    }
    return path;
  });
}

export function avahiWatch(
  bus: DiscoveryBus,
  rule: SignalRule,
  listener: SignalListener,
  signal?: AbortSignal,
): Promise<() => void> {
  if (signal?.aborted === true) return Promise.reject(new DiscoveryCancelledError());
  let active = true;
  const work = bus.watch(rule, (body, sender) => {
    if (active && signal?.aborted !== true) listener(body, sender);
  });
  return bounded(`watch ${rule.member}`, work, {
    ...(signal === undefined ? {} : { signal }),
    disposeLate: (stop) => {
      stop();
    },
    abandoned: () => {
      active = false;
    },
  }).then((stop) => {
    if (signal?.aborted === true) {
      active = false;
      stop();
      throw new DiscoveryCancelledError();
    }
    return (): void => {
      active = false;
      stop();
    };
  });
}
