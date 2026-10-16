import { jsonEquals, type CapabilityKey, type JsonValue } from '@smarteverything/domain';
import type { DeviceDriverContext } from '../../../local/device-driver';
import { wizDevice, wizExternalId, wizReadings } from './light';
import { WizProtocolError, type WizSaved } from './protocol';

export interface WizSnapshot {
  readonly bulb: WizSaved;
  readonly online: boolean;
  readonly at: string;
}
const MAX_PENDING_SNAPSHOTS = 256;
export class WizPublication {
  private context: DeviceDriverContext | null = null;
  private readonly pending: WizSnapshot[] = [];
  private readonly sent = new Map<CapabilityKey, JsonValue>();
  private described: string | null = null;
  private running: Promise<void> | null = null;
  private revision = 0;
  attach(context: DeviceDriverContext): void {
    this.context = context;
    this.described = null;
    this.sent.clear();
  }
  detach(): void {
    this.context = null;
    this.pending.length = 0;
  }
  update(snapshot: WizSnapshot): void {
    const context = this.context;
    if (context === null) return;
    const last = this.pending.at(-1);
    const same =
      last?.online === snapshot.online &&
      JSON.stringify(last.bulb.pilot) === JSON.stringify(snapshot.bulb.pilot) &&
      JSON.stringify(last.bulb.config) === JSON.stringify(snapshot.bulb.config);
    if (!same) {
      if (snapshot.online && this.pending.length >= MAX_PENDING_SNAPSHOTS) {
        this.failed(
          context,
          snapshot,
          'publish_snapshot',
          new WizProtocolError('publication', 'the pending snapshot queue is full'),
        );
        return;
      }
      this.pending.push(snapshot);
    }
    this.revision += 1;
    this.start();
  }
  async settled(): Promise<void> {
    while (this.running !== null) await this.running;
  }
  private start(): void {
    if (this.running !== null) return;
    const revision = this.revision;
    this.running = this.drain().finally(() => {
      this.running = null;
      if (revision !== this.revision && this.pending.length > 0) this.start();
    });
  }
  private async drain(): Promise<void> {
    const context = this.context;
    if (context === null) return;
    while (this.context === context) {
      const snapshot = this.pending[0];
      if (snapshot === undefined || !(await this.deliver(context, snapshot))) return;
      this.pending.shift();
    }
  }
  private async deliver(context: DeviceDriverContext, snapshot: WizSnapshot): Promise<boolean> {
    if (context.signal.aborted && snapshot.online) return true;
    const device = wizDevice(snapshot.bulb, snapshot.online);
    const signature = JSON.stringify(device);
    if (signature !== this.described) {
      try {
        await context.publishDevices([device]);
        if (this.context !== context) return false;
        this.described = signature;
      } catch (cause) {
        this.failed(context, snapshot, 'publish_inventory', cause);
        return false;
      }
    }
    return this.readings(context, snapshot);
  }
  private readings(context: DeviceDriverContext, snapshot: WizSnapshot): boolean {
    if (!snapshot.online || context.signal.aborted) return true;
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
        return false;
      }
    }
    return true;
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
