import { randomBytes } from 'node:crypto';
import type { WizTransport } from './transport';
import type { WizInterface } from './interfaces';
import { WizProtocolError } from './protocol';

const DISCOVERY_WINDOW_MS = 5000;
const DISCOVERY_RETRY_MS = 1000;
export class WizDiscovery {
  private stopped = false;
  private readonly discoveryMac = randomBytes(6).toString('hex');
  private active: Promise<void> | null = null;
  private finish: (() => void) | null = null;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  constructor(
    private readonly transport: WizTransport,
    private readonly interfaces: () => readonly WizInterface[],
  ) {}
  scan(): Promise<void> {
    if (this.stopped)
      return Promise.reject(new WizProtocolError('discovery', 'the plugin has stopped'));
    this.active ??= this.run().finally(() => {
      this.active = null;
    });
    return this.active;
  }
  stop(): void {
    this.stopped = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.finish?.();
    this.finish = null;
  }
  private async run(): Promise<void> {
    const targets = [
      ...new Map(this.interfaces().map((entry) => [entry.broadcast, entry])).values(),
    ];
    if (targets.length === 0)
      throw new WizProtocolError('discovery', 'this computer has no local IPv4 network');
    await this.broadcast(targets);
    if (this.stopped) return;
    return new Promise((resolve) => {
      this.finish = resolve;
      this.schedule(() => {
        void this.broadcast(targets).catch(() => undefined);
      }, DISCOVERY_RETRY_MS);
      this.schedule(() => {
        this.finish = null;
        resolve();
      }, DISCOVERY_WINDOW_MS);
    });
  }
  private broadcast(targets: readonly WizInterface[]): Promise<void> {
    return Promise.all(
      targets.flatMap((target) => [
        this.transport.send(target.broadcast, 'getPilot', {}),
        this.transport.send(target.broadcast, 'registration', {
          phoneMac: this.discoveryMac,
          phoneIp: target.address,
          register: false,
        }),
      ]),
    ).then(() => undefined);
  }
  private schedule(callback: () => void, milliseconds: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, milliseconds);
    timer.unref();
    this.timers.add(timer);
  }
}
