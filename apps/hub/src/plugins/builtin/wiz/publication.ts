import { jsonEquals, type CapabilityKey, type JsonValue } from '@smarteverything/domain';
import type { DeviceDriverContext } from '../../../local/device-driver';
import { wizDevice, wizExternalId, wizReadings } from './light';
import type { WizSaved } from './protocol';

export interface WizSnapshot {
  readonly bulb: WizSaved;
  readonly online: boolean;
  readonly at: string;
}

export class WizPublication {
  private context: DeviceDriverContext | null = null;
  private latest: WizSnapshot | null = null;
  private running: Promise<void> | null = null;
  private readonly sent = new Map<CapabilityKey, JsonValue>();
  private described: string | null = null;

  attach(context: DeviceDriverContext): void {
    this.context = context;
    this.described = null;
    this.sent.clear();
  }

  detach(): void {
    this.context = null;
    this.latest = null;
  }

  update(snapshot: WizSnapshot): void {
    if (this.context === null) return;
    this.latest = snapshot;
    this.running ??= this.drain();
  }

  async settled(): Promise<void> {
    while (this.running !== null) await this.running;
  }

  private async drain(): Promise<void> {
    try {
      for (let next = this.take(); next !== null; next = this.take()) await this.deliver(next);
    } finally {
      this.running = null;
    }
  }

  private take(): WizSnapshot | null {
    const snapshot = this.latest;
    this.latest = null;
    return snapshot;
  }

  private async deliver(snapshot: WizSnapshot): Promise<void> {
    const context = this.context;
    if (context === null || (context.signal.aborted && snapshot.online)) return;
    const device = wizDevice(snapshot.bulb, snapshot.online);
    const signature = JSON.stringify(device);
    if (signature !== this.described) {
      try {
        await context.publishDevices([device]);
      } catch (cause) {
        this.failed(context, snapshot, 'publish_inventory', cause);
        return;
      }
      if (this.context !== context) return;
      this.described = signature;
    }
    if (snapshot.online) this.publishReadings(context, snapshot);
  }

  private publishReadings(context: DeviceDriverContext, snapshot: WizSnapshot): void {
    for (const [capability, value] of wizReadings(snapshot.bulb)) {
      const previous = this.sent.get(capability);
      if (previous !== undefined && jsonEquals(previous, value)) continue;
      try {
        context.sink.state({
          externalId: wizExternalId(snapshot.bulb.mac),
          capability,
          value,
          observedAt: snapshot.at,
        });
        this.sent.set(capability, value);
      } catch (cause) {
        this.failed(context, snapshot, 'publish_state', cause);
        return;
      }
    }
  }

  private failed(
    context: DeviceDriverContext,
    snapshot: WizSnapshot,
    operation: string,
    cause: unknown,
  ): void {
    context.sink.failure({
      provider: 'local',
      externalId: wizExternalId(snapshot.bulb.mac),
      operation,
      cause,
    });
  }
}
