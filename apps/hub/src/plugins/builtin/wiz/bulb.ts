import type { DeviceCommand, JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import type { DeviceDriverContext } from '../../../local/device-driver';
import type { PluginRecords } from '../contract';
import { jsonOf } from '../json-value';
import { wizCommand } from './light';
import { WizPublication } from './publication';
import { WIZ_OFFLINE_MS, type WizConfig, type WizPilot, type WizSaved } from './protocol';
import type { WizTransport } from './transport';

const PILOT_ACCEPTED = z.object({ success: z.literal(true) });

function observedPilot(previous: WizPilot, incoming: WizPilot): WizPilot {
  const merged = { ...previous, ...incoming };
  if (incoming.temp !== undefined && incoming.temp > 0) {
    const { r: _r, g: _g, b: _b, ...white } = merged;
    return white;
  }
  if (incoming.r !== undefined && incoming.g !== undefined && incoming.b !== undefined) {
    const { temp: _temp, ...colour } = merged;
    return colour;
  }
  return merged;
}

export class WizBulb {
  private readonly publication = new WizPublication();
  private online = false;
  private seen = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private saved: WizSaved,
    private readonly records: PluginRecords,
  ) {}

  get current(): WizSaved {
    return this.saved;
  }

  get connected(): boolean {
    return this.online;
  }

  attach(context: DeviceDriverContext): void {
    this.publication.attach(context);
    this.publish();
  }

  async detach(): Promise<void> {
    this.stop();
    await this.publication.settled();
    this.publication.detach();
  }

  observe(address: string, pilot: WizPilot): void {
    const moved = address !== this.saved.address;
    this.seen = true;
    this.saved = { ...this.saved, address, pilot: observedPilot(this.saved.pilot, pilot) };
    if (moved) this.save();
    this.alive();
  }

  configure(config: WizConfig): void {
    this.saved = { ...this.saved, config: { ...this.saved.config, ...config } };
    this.save();
    this.publish();
  }

  acknowledge(): boolean {
    if (this.seen) this.alive();
    return this.seen;
  }

  save(): void {
    this.records.put(this.saved.mac, jsonOf(this.saved));
  }

  async execute(command: DeviceCommand, transport: WizTransport): Promise<JsonValue> {
    const response = await transport.request(
      this.saved.address,
      'setPilot',
      wizCommand(this.saved, command),
    );
    PILOT_ACCEPTED.parse(response.result);
    await transport.request(this.saved.address, 'getPilot', {});
    return { success: true };
  }

  private alive(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.online = true;
    this.timer = setTimeout(() => {
      this.online = false;
      this.timer = null;
      this.publish();
    }, WIZ_OFFLINE_MS);
    this.timer.unref();
    this.publish();
  }

  private stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (!this.online) return;
    this.online = false;
    this.publish();
  }

  private publish(): void {
    this.publication.update({
      bulb: this.saved,
      online: this.online,
      at: new Date().toISOString(),
    });
  }
}
