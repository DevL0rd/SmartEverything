import { Message, MessageType, systemBus, type MessageBus } from '@jellybrick/dbus-next';
import type { NativeHubNetworkChange } from '../../../../packages/domain/src/hub-native';
export class HubNetworkChanges {
  #generation = 0;
  #bus: MessageBus | undefined;
  readonly #receive = (message: Message): void => {
    if (
      message.type === MessageType.SIGNAL &&
      message.interface === 'org.freedesktop.DBus.Properties' &&
      message.path.startsWith('/org/freedesktop/NetworkManager')
    )
      this.emit(this.#snapshot('watching', 'Network changed'));
  };
  constructor(readonly emit: (state: NativeHubNetworkChange) => void) {}
  async start(): Promise<NativeHubNetworkChange> {
    this.stop();
    if (process.platform !== 'linux')
      return this.#snapshot('unsupported', 'Native network events require Linux NetworkManager');
    const bus = systemBus();
    this.#bus = bus;
    bus.on('message', this.#receive);
    bus.on('error', () => {
      if (this.#bus === bus)
        this.emit(this.#snapshot('unavailable', 'NetworkManager event channel unavailable'));
    });
    try {
      await this.#call(bus, 'GetNameOwner', 's', ['org.freedesktop.NetworkManager']);
      await this.#call(bus, 'AddMatch', 's', [
        "type='signal',sender='org.freedesktop.NetworkManager',interface='org.freedesktop.DBus.Properties'",
      ]);
      if (this.#bus !== bus) return this.#snapshot('unavailable', 'Network monitoring stopped');
      return this.#snapshot('watching', '');
    } catch (cause) {
      if (this.#bus === bus) this.stop();
      return this.#snapshot(
        'unavailable',
        cause instanceof Error ? cause.message.slice(0, 500) : 'NetworkManager unavailable',
      );
    }
  }
  stop(): void {
    this.#bus?.removeListener('message', this.#receive);
    this.#bus?.disconnect();
    this.#bus = undefined;
  }
  #snapshot(state: NativeHubNetworkChange['state'], detail: string): NativeHubNetworkChange {
    return { generation: ++this.#generation, state, detail };
  }
  async #call(
    bus: MessageBus,
    member: string,
    signature: string,
    body: readonly unknown[],
  ): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        bus.call(
          new Message({
            destination: 'org.freedesktop.DBus',
            path: '/org/freedesktop/DBus',
            interface: 'org.freedesktop.DBus',
            member,
            signature,
            body: [...body],
          }),
        ),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`NetworkManager ${member} timed out`));
          }, 3000);
          timer.unref();
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
