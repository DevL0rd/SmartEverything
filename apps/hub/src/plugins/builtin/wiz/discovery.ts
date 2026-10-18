import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { WizInterface } from './interfaces';
import { WizProtocolError } from './protocol';
import type { WizTransport } from './transport';

const DISCOVERY_WINDOW_MS = 5000;
const DISCOVERY_RETRY_MS = 1000;

export class WizDiscovery {
  private active: Promise<void> | null = null;
  private readonly discoveryMac = randomBytes(6).toString('hex');

  constructor(
    private readonly transport: WizTransport,
    private readonly interfaces: () => readonly WizInterface[],
    private readonly signal: AbortSignal,
  ) {}

  scan(): Promise<void> {
    this.active ??= this.run().finally(() => {
      this.active = null;
    });
    return this.active;
  }

  private async run(): Promise<void> {
    const targets = [
      ...new Map(this.interfaces().map((entry) => [entry.broadcast, entry])).values(),
    ];
    if (targets.length === 0)
      throw new WizProtocolError('discovery', 'this computer has no local IPv4 network');
    try {
      await this.broadcast(targets);
      await this.pause(DISCOVERY_RETRY_MS);
      await this.broadcast(targets);
      await this.pause(DISCOVERY_WINDOW_MS - DISCOVERY_RETRY_MS);
    } catch (cause) {
      if (!this.signal.aborted) throw cause;
    }
  }

  private pause(milliseconds: number): Promise<void> {
    return sleep(milliseconds, undefined, { signal: this.signal, ref: false });
  }

  private async broadcast(targets: readonly WizInterface[]): Promise<void> {
    await Promise.all(
      targets.flatMap((target) => [
        this.transport.send(target.broadcast, 'getPilot', {}),
        this.transport.send(target.broadcast, 'registration', {
          phoneMac: this.discoveryMac,
          phoneIp: target.address,
          register: false,
        }),
      ]),
    );
  }
}
