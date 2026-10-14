import { z } from 'zod';
import {
  AVAHI_SERVER as SERVER,
  DiscoveryError,
  avahiCall,
  avahiFree,
  avahiObject,
  avahiWatch,
  mayFreeAvahiObject,
  type DiscoveryBus,
} from './avahi-bus';

const HOST_REPLY = z.tuple([z.string().min(1)]);
const RECORD_INTERFACE = 'org.freedesktop.Avahi.RecordBrowser';
const INTERNET_CLASS = 1;
const ADDRESS_RECORDS = [1, 28] as const;
const RECORD_SIGNAL = z.tuple([
  z.int(),
  z.int(),
  z.string(),
  z.int(),
  z.int(),
  z.union([z.instanceof(Uint8Array), z.array(z.int().min(0).max(255))]),
  z.int(),
]);
const FAILURE_SIGNAL = z.tuple([z.string()]);
export type NetworkCleanup = (releaseRemote?: boolean) => Promise<void>;
interface NetworkOptions {
  readonly bus: DiscoveryBus;
  readonly changed: () => void;
  readonly failed: (cause: unknown) => void;
  readonly signal: AbortSignal;
}

class AvahiNetworkWatch {
  private readonly browsers: string[] = [];
  private readonly watchers: (() => void)[] = [];
  private active = true;
  private readonly detach = (): void => {
    this.active = false;
    for (const stop of this.watchers.splice(0)) stop();
  };
  constructor(private readonly options: NetworkOptions) {}

  async start(): Promise<NetworkCleanup> {
    const { bus, signal, failed } = this.options;
    signal.addEventListener('abort', this.detach, { once: true });
    try {
      const [host] = HOST_REPLY.parse(
        await avahiCall(bus, { ...SERVER, member: 'GetHostNameFqdn' }, signal),
      );
      for (const type of ADDRESS_RECORDS) {
        const path = await avahiObject(
          bus,
          {
            ...SERVER,
            member: 'RecordBrowserNew',
            signature: 'iisqqu',
            body: [-1, -1, host, INTERNET_CLASS, type, 0],
          },
          { iface: RECORD_INTERFACE, signal, failed },
        );
        this.browsers.push(path);
        await this.followBrowser(path, host);
      }
      return (releaseRemote = true) => this.stop(releaseRemote);
    } catch (cause) {
      await this.stop(mayFreeAvahiObject(signal)).catch(failed);
      throw cause;
    }
  }

  private async stop(releaseRemote: boolean): Promise<void> {
    this.detach();
    this.options.signal.removeEventListener('abort', this.detach);
    const paths = this.browsers.splice(0);
    if (releaseRemote)
      await Promise.all(paths.map((path) => avahiFree(this.options.bus, path, RECORD_INTERFACE)));
  }

  private async followBrowser(path: string, host: string): Promise<void> {
    const { bus, signal, failed } = this.options;
    for (const member of ['ItemNew', 'ItemRemove']) {
      this.watchers.push(
        await avahiWatch(
          bus,
          { path, iface: RECORD_INTERFACE, member },
          (body) => {
            if (!this.active) return;
            const parsed = RECORD_SIGNAL.safeParse(body);
            if (!parsed.success) {
              failed(parsed.error);
              return;
            }
            if (parsed.data[2] === host) this.options.changed();
          },
          signal,
        ),
      );
    }
    this.watchers.push(
      await avahiWatch(
        bus,
        { path, iface: RECORD_INTERFACE, member: 'Failure' },
        (body) => {
          if (!this.active) return;
          const parsed = FAILURE_SIGNAL.safeParse(body);
          failed(
            parsed.success ? new DiscoveryError('network watch', parsed.data[0]) : parsed.error,
          );
        },
        signal,
      ),
    );
  }
}

export function watchAvahiNetwork(
  bus: DiscoveryBus,
  changed: () => void,
  failed: (cause: unknown) => void,
  signal: AbortSignal = new AbortController().signal,
): Promise<NetworkCleanup> {
  return new AvahiNetworkWatch({ bus, changed, failed, signal }).start();
}
