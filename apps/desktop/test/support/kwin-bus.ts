import { Message, MessageType } from '@jellybrick/dbus-next';
import type { KwinBus } from '../../src/overlay/kwin-overlay.js';
import { READY_NAME, READY_PATH } from '../../src/overlay/kwin-events.js';

interface Call {
  member: string;
  path: string;
  body: unknown[];
}

export interface BusRig {
  readonly bus: KwinBus;
  readonly calls: Call[];
  readonly names: string[];
  readonly emit: (message: Message) => void;
  readonly state: () => { connected: boolean; disconnected: boolean };
}

export interface BusOptions {
  readonly running: boolean;
  readonly ids: readonly number[];
  readonly announce?: readonly boolean[];
  readonly announceAfterReply?: boolean;
  readonly loaded?: boolean;
}

function replyOf(options: BusOptions, member: string): unknown[] {
  const replies: Record<string, unknown[]> = {
    NameHasOwner: [options.running],
    unloadScript: [true],
    isScriptLoaded: [options.loaded ?? true],
  };
  return replies[member] ?? [];
}

function announceReady(listeners: readonly ((message: Message) => void)[], late: boolean): void {
  const announce = (): void => {
    const message = new Message({
      type: MessageType.METHOD_CALL,
      path: READY_PATH,
      interface: READY_NAME,
      member: 'Ready',
    });
    listeners.forEach((listener) => {
      listener(message);
    });
  };
  if (late) {
    setTimeout(announce, 1);
  } else {
    announce();
  }
}

export function fakeBus(options: BusOptions): BusRig {
  const calls: Call[] = [];
  const names: string[] = [];
  const listeners: ((message: Message) => void)[] = [];
  let connected = false;
  let disconnected = false;
  let loads = 0;
  const bus: KwinBus = {
    name: ':1.5',
    once: (): undefined => undefined,
    on: (_event, listener) => {
      listeners.push(listener);
    },
    requestName: (name) => {
      names.push(name);
      return Promise.resolve(1);
    },
    disconnect: () => {
      disconnected = true;
    },
    call: (message) => {
      connected = true;
      calls.push({ member: message.member, path: message.path, body: message.body });
      if (message.member === 'loadScript') {
        const id = options.ids[Math.min(loads, options.ids.length - 1)] ?? 0;
        loads += 1;
        return Promise.resolve({ body: [id] });
      }
      if (message.member === 'run') {
        if (options.announce?.[loads - 1] ?? true) {
          announceReady(listeners, options.announceAfterReply === true);
        }
        return Promise.resolve({ body: [] });
      }
      return Promise.resolve({ body: replyOf(options, message.member) });
    },
  };
  return {
    bus,
    calls,
    names,
    emit: (message): void => {
      listeners.forEach((listener) => {
        listener(message);
      });
    },
    state: (): { connected: boolean; disconnected: boolean } => ({ connected, disconnected }),
  };
}
