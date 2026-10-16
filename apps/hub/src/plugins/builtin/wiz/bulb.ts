import type { DeviceCommand, JsonValue } from '@smarteverything/domain';
import { JSON_VALUE } from '@smarteverything/domain';
import type { DeviceDriverContext } from '../../../local/device-driver';
import type { PluginRecords } from '../contract';
import { wizCommand } from './light';
import { WizPublication } from './publication';
import { WIZ_OFFLINE_MS, type WizConfig, type WizPilot, type WizSaved } from './protocol';
import type { WizTransport } from './transport';
import { z } from 'zod';

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
  private saved: WizSaved;
  private readonly publication = new WizPublication();
  private online = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    saved: WizSaved,
    private readonly records: PluginRecords,
  ) {
    this.saved = saved;
  }
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
  settled(): Promise<void> {
    return this.publication.settled();
  }
  detach(): void {
    this.stop();
    this.publication.detach();
  }
  observe(address: string, pilot: WizPilot): void {
    this.saved = { ...this.saved, address, pilot: observedPilot(this.saved.pilot, pilot) };
    this.alive();
    this.persist();
  }
  configure(config: WizConfig): void {
    this.saved = { ...this.saved, config: { ...this.saved.config, ...config } };
    this.persist();
  }
  alive(): void {
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
  stop(): void {
    if (!this.online && this.timer === null) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.online = false;
    this.publish();
  }
  async execute(command: DeviceCommand, transport: WizTransport): Promise<JsonValue> {
    const params = wizCommand(this.saved, command);
    const response = await transport.request(this.saved.address, 'setPilot', params);
    z.object({ success: z.literal(true) }).parse(response.result);
    await transport.request(this.saved.address, 'getPilot', {});
    return { success: true };
  }
  private persist(): void {
    this.records.put(this.saved.mac, JSON_VALUE.parse(JSON.parse(JSON.stringify(this.saved))));
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
