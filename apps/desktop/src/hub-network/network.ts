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
  on(event: 'error', listener: () => void): unknown;
  removeListener(event: 'message', listener: (message: Message) => void): unknown;
  call(message: Message): Promise<Message | null>;
  disconnect(): void;
}

function changesRoute(message: Message): boolean {
  if (message.type !== MessageType.SIGNAL || message.path !== MANAGER_PATH) return false;
  if (message.interface === MANAGER) return message.member === 'StateChanged';
  if (message.interface !== PROPERTIES || message.member !== 'PropertiesChanged') return false;
  const body = PROPERTIES_CHANGED.safeParse(message.body);
  return body.success && Object.keys(body.data[1]).some((name) => ROUTE_PROPERTIES.has(name));
}

export class HubNetworkChanges {
  #generation = 0;
  #bus: NetworkBus | undefined;
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
    return this.#bus !== undefined;
  }
  async start(): Promise<NativeHubNetworkChange> {
    if (this.#bus !== undefined) return this.#snapshot('watching', '');
    if (process.platform !== 'linux') {
      log.info('network.unsupported', { platform: process.platform });
      return this.#snapshot('unsupported', 'Native network events require Linux NetworkManager');
    }
    const bus = this.connect();
    this.#bus = bus;
    bus.on('message', this.#receive);
    bus.on('error', () => {
      log.warn('network.bus_error', { current: this.#bus === bus });
      if (this.#bus === bus)
        this.emit(this.#snapshot('unavailable', 'NetworkManager event channel unavailable'));
    });
    try {
      await this.#call(bus, 'GetNameOwner', 's', [MANAGER]);
      for (const rule of MATCH_RULES) await this.#call(bus, 'AddMatch', 's', [rule]);
      log.info('network.watching', { rules: MATCH_RULES.length, stillCurrent: this.#bus === bus });
      return this.#snapshot(
        this.#bus === bus ? 'watching' : 'unavailable',
        this.#bus === bus ? '' : 'Network watching was stopped',
      );
    } catch (cause) {
      log.warn('network.watch_failed', { reason: cause instanceof Error ? cause.name : 'unknown' });
      if (this.#bus === bus) this.stop();
      return this.#snapshot(
        'unavailable',
        cause instanceof Error ? cause.message : 'NetworkManager unavailable',
      );
    }
  }
  stop(): void {
    log.info('network.stopped', { watching: this.#bus !== undefined });
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#bus?.removeListener('message', this.#receive);
    this.#bus?.disconnect();
    this.#bus = undefined;
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
