import { once } from 'node:events';
import { Message, MessageType, systemBus } from '@jellybrick/dbus-next';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { NativeHubNetworkChange } from '@smarteverything/domain';

const log = new Logger('desktop.hub-network');

const MANAGER = 'org.freedesktop.NetworkManager';
const MANAGER_PATH = '/org/freedesktop/NetworkManager';
const PROPERTIES = 'org.freedesktop.DBus.Properties';
const ROUTE_PROPERTIES: ReadonlySet<string> = new Set(['PrimaryConnection', 'Connectivity']);
const COALESCE_MS = 500;
const MATCH_RULES: readonly string[] = [
  `type='signal',sender='${MANAGER}',path='${MANAGER_PATH}',interface='${MANAGER}',member='StateChanged'`,
  `type='signal',sender='${MANAGER}',path='${MANAGER_PATH}',interface='${PROPERTIES}',member='PropertiesChanged',arg0='${MANAGER}'`,
];
const PROPERTIES_CHANGED = z.tuple([
  z.literal(MANAGER),
  z.record(z.string(), z.unknown()),
  z.array(z.string()),
]);

export interface NetworkBus {
  on(event: 'message', listener: (message: Message) => void): unknown;
  on(event: 'error', listener: (cause: unknown) => void): unknown;
  removeListener(event: 'message', listener: (message: Message) => void): unknown;
  call(message: Message): Promise<Message | null>;
  disconnect(): void;
}

interface NetworkSubscription {
  readonly bus: NetworkBus;
  readonly abort: AbortController;
  readonly ready: Promise<NativeHubNetworkChange>;
}

function changesRoute(message: Message): boolean {
  if (message.type !== MessageType.SIGNAL || message.path !== MANAGER_PATH) return false;
  if (message.interface === MANAGER) return message.member === 'StateChanged';
  if (message.interface !== PROPERTIES || message.member !== 'PropertiesChanged') return false;
  const body = PROPERTIES_CHANGED.safeParse(message.body);
  return body.success && Object.keys(body.data[1]).some((name) => ROUTE_PROPERTIES.has(name));
}

function failureDetail(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'NetworkManager unavailable';
}

export class HubNetworkChanges {
  #generation = 0;
  #subscription: NetworkSubscription | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  readonly #receive = (message: Message): void => {
    if (!changesRoute(message) || this.#timer !== undefined) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      log.debug('network.changed', { generation: this.#generation + 1 });
      this.emit(this.#snapshot('watching', 'Network changed'));
    }, COALESCE_MS);
    this.#timer.unref();
  };
  constructor(
    readonly emit: (state: NativeHubNetworkChange) => void,
    readonly connect: () => NetworkBus = systemBus,
  ) {}
  get watching(): boolean {
    return this.#subscription !== undefined;
  }
  async start(): Promise<NativeHubNetworkChange> {
    if (this.#subscription !== undefined) return this.#subscription.ready;
    if (process.platform !== 'linux') {
      log.info('network.unsupported', { platform: process.platform });
      return this.#snapshot('unsupported', 'Native network events require Linux NetworkManager');
    }
    let bus: NetworkBus;
    try {
      bus = this.connect();
    } catch (cause) {
      return this.#watchFailed(cause);
    }
    const abort = new AbortController();
    const ready = Promise.resolve().then(() => this.#watch(bus, abort.signal));
    this.#subscription = { bus, abort, ready };
    bus.on('message', this.#receive);
    bus.on('error', (cause) => {
      if (this.#subscription?.bus !== bus) return;
      log.warn('network.bus_error', { reason: cause instanceof Error ? cause.name : 'unknown' });
      const detail = 'NetworkManager event channel unavailable';
      this.#disconnect(new Error(detail));
      this.emit(this.#snapshot('unavailable', detail));
    });
    return ready;
  }
  async #watch(bus: NetworkBus, signal: AbortSignal): Promise<NativeHubNetworkChange> {
    if (signal.aborted) return this.#snapshot('unavailable', failureDetail(signal.reason));
    const stopped = once(signal, 'abort').then(() => {
      signal.throwIfAborted();
    });
    try {
      await Promise.race([this.#subscribe(bus, signal), stopped]);
      signal.throwIfAborted();
      log.info('network.watching', { rules: MATCH_RULES.length });
      return this.#snapshot('watching', '');
    } catch (cause) {
      if (this.#subscription?.bus === bus) {
        this.stop();
        return this.#watchFailed(cause);
      }
      return this.#snapshot('unavailable', failureDetail(cause));
    }
  }
  async #subscribe(bus: NetworkBus, signal: AbortSignal): Promise<void> {
    await this.#call(bus, 'GetNameOwner', 's', [MANAGER]);
    for (const rule of MATCH_RULES) {
      signal.throwIfAborted();
      await this.#call(bus, 'AddMatch', 's', [rule]);
    }
  }
  #watchFailed(cause: unknown): NativeHubNetworkChange {
    log.warn('network.watch_failed', { reason: cause instanceof Error ? cause.name : 'unknown' });
    return this.#snapshot('unavailable', failureDetail(cause));
  }
  stop(): void {
    log.info('network.stopped', { watching: this.watching });
    this.#disconnect(new Error('Network watching was stopped'));
  }
  #disconnect(reason: Error): void {
    const subscription = this.#subscription;
    this.#subscription = undefined;
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (subscription === undefined) return;
    subscription.abort.abort(reason);
    subscription.bus.removeListener('message', this.#receive);
    subscription.bus.disconnect();
  }
  #snapshot(state: NativeHubNetworkChange['state'], detail: string): NativeHubNetworkChange {
    return { generation: ++this.#generation, state, detail };
  }
  async #call(
    bus: NetworkBus,
    member: string,
    signature: string,
    body: readonly unknown[],
  ): Promise<void> {
    await bus.call(
      new Message({
        destination: 'org.freedesktop.DBus',
        path: '/org/freedesktop/DBus',
        interface: 'org.freedesktop.DBus',
        member,
        signature,
        body: [...body],
      }),
    );
  }
}
