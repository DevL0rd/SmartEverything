import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { CommandRefusedError, type DeviceCommand, type JsonValue } from '@smarteverything/domain';
import type { DeviceDriverContext } from '../../../local/device-driver';
import type { PluginContext, PluginStop } from '../contract';
import { WizBulb } from './bulb';
import { WizDiscovery } from './discovery';
import { interfaceFor, localWizAddress, wizInterfaces, type WizInterface } from './interfaces';
import { wizExternalId } from './light';
import {
  WIZ_CONFIG,
  WIZ_MAC,
  WIZ_PILOT,
  WIZ_REGISTRATION_MS,
  WIZ_SAVED,
  type WizFrame,
  type WizPilot,
} from './protocol';
import { WizTransport } from './transport';
import { wizTools } from './tools';

const MAX_BULBS = 512;
const MAX_ENROLLING = 16;
export class WizRuntime {
  private readonly bulbs = new Map<string, WizBulb>();
  private readonly enrolling = new Set<string>();
  private readonly queued = new Set<string>();
  private readonly initialized = new Set<string>();
  private interfaces: readonly WizInterface[] = [];
  private transport: WizTransport | null = null;
  private discovery: WizDiscovery | null = null;
  private driver: DeviceDriverContext | null = null;
  private renewal: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private stopping: Promise<void> | null = null;
  private readonly refreshing = new Set<string>();
  private readonly refreshQueue = new Set<string>();
  private readonly phoneMac = randomBytes(6).toString('hex');
  constructor(private readonly ctx: PluginContext<Readonly<Record<string, never>>>) {}
  async start(): Promise<PluginStop> {
    this.interfaces = wizInterfaces();
    this.restore();
    this.transport = await WizTransport.open(
      this.ctx.network,
      this.receive,
      () => {
        this.ctx.log.warn('wiz.socket_failed', {
          reason: 'A WiZ network socket reported an error.',
        });
      },
      (address) => localWizAddress(address, this.interfaces),
    );
    if (this.ctx.signal.aborted) {
      this.transport.close();
      this.transport = null;
      this.stopped = true;
      return () => Promise.resolve();
    }
    this.discovery = new WizDiscovery(this.transport, () => this.interfaces);
    const unregister = this.ctx.devices.register({
      id: 'wiz',
      start: (driver) => this.attach(driver),
      execute: (command) => this.execute(command),
    });
    this.ctx.tools.register(
      wizTools(
        () => this.status(),
        () => this.rescan(),
      ),
    );
    this.ctx.signal.addEventListener('abort', this.abort, { once: true });
    this.renewal = setInterval(() => {
      this.renew();
    }, WIZ_REGISTRATION_MS);
    this.renewal.unref();
    void this.rescan().catch(() => {
      this.ctx.log.warn('wiz.discovery_failed', {
        reason:
          'Local discovery could not send its bounded scan. Check the network and WiZ local communication setting.',
      });
    });
    return async () => {
      await this.stop();
      unregister();
    };
  }
  status(): Readonly<Record<string, JsonValue>> {
    return {
      devices: [...this.bulbs.values()].map((bulb) => ({
        externalId: wizExternalId(bulb.current.mac),
        online: bulb.connected,
        model: bulb.current.config.moduleName ?? null,
      })),
      discoveryAvailable: this.interfaces.length > 0,
    };
  }
  async rescan(): Promise<Readonly<Record<string, JsonValue>>> {
    this.interfaces = wizInterfaces();
    await this.discovery?.scan();
    return this.status();
  }
  private restore(): void {
    const records = this.ctx.records('bulbs');
    for (const record of records.list().slice(0, MAX_BULBS)) {
      const saved = WIZ_SAVED.safeParse(record.value);
      if (saved.success) this.bulbs.set(saved.data.mac, new WizBulb(saved.data, records));
      else
        this.ctx.log.warn('wiz.saved_light_invalid', {
          reason: 'A saved WiZ light does not match its record schema.',
        });
    }
  }
  private attach(driver: DeviceDriverContext): Promise<PluginStop> {
    if (this.stopped || driver.signal.aborted) return Promise.resolve(() => Promise.resolve());
    this.driver = driver;
    for (const bulb of this.bulbs.values()) bulb.attach(driver);
    return Promise.resolve(() => {
      for (const bulb of this.bulbs.values()) bulb.detach();
      this.driver = null;
      return Promise.resolve();
    });
  }
  private async execute(command: DeviceCommand): Promise<JsonValue> {
    const bulb = [...this.bulbs.values()].find(
      (entry) => wizExternalId(entry.current.mac) === command.externalId,
    );
    if (bulb === undefined || this.transport === null || this.stopped)
      throw new CommandRefusedError(command.capability, 'this WiZ light is not available');
    return bulb.execute(command, this.transport);
  }
  private readonly receive = (frame: WizFrame, address: string): void => {
    if (this.stopped || frame.error !== undefined) return;
    if (frame.method === 'syncPilot' || frame.method === 'getPilot') {
      const pilot = WIZ_PILOT.safeParse(frame.method === 'syncPilot' ? frame.params : frame.result);
      if (pilot.success) this.observe(address, pilot.data);
      return;
    }
    if (frame.method === 'firstBeat') {
      const parsed = z.object({ mac: WIZ_MAC }).safeParse(frame.params);
      if (parsed.success) this.refresh(address);
      return;
    }
    this.registration(frame, address);
  };
  private registration(frame: WizFrame, address: string): void {
    if (frame.method === 'registration') {
      const parsed = z.object({ mac: WIZ_MAC, success: z.literal(true) }).safeParse(frame.result);
      if (parsed.success) {
        const bulb = this.bulbs.get(parsed.data.mac);
        if (bulb?.current.address === address) bulb.alive();
        else this.refresh(address);
      }
    }
  }
  private observe(address: string, pilot: WizPilot): void {
    let bulb = this.bulbs.get(pilot.mac);
    const fresh = bulb === undefined;
    if (fresh && pilot.state === undefined) return;
    if (bulb === undefined) {
      if (this.bulbs.size >= MAX_BULBS) return;
      bulb = new WizBulb({ mac: pilot.mac, address, pilot, config: {} }, this.ctx.records('bulbs'));
      this.bulbs.set(pilot.mac, bulb);
      if (this.driver !== null) bulb.attach(this.driver);
    }
    const moved = bulb.current.address !== address;
    bulb.observe(address, pilot);
    if (fresh || moved || !this.initialized.has(pilot.mac)) {
      this.initialized.add(pilot.mac);
      this.queue(pilot.mac);
    }
  }
  private queue(mac: string): void {
    this.queued.add(mac);
    this.drain();
  }
  private drain(): void {
    if (this.stopped || this.enrolling.size >= MAX_ENROLLING) return;
    const mac = [...this.queued].find((candidate) => !this.enrolling.has(candidate));
    if (mac === undefined) return;
    this.queued.delete(mac);
    this.enrolling.add(mac);
    void this.enroll(mac)
      .catch(() => {
        if (!this.stopped)
          this.ctx.log.warn('wiz.light_setup_failed', {
            reason: 'A discovered light did not complete its configuration or push registration.',
          });
      })
      .finally(() => {
        this.enrolling.delete(mac);
        this.drain();
      });
    this.drain();
  }
  private async enroll(mac: string): Promise<void> {
    const bulb = this.bulbs.get(mac);
    const transport = this.transport;
    if (bulb === undefined || transport === null || this.stopped) return;
    const address = bulb.current.address;
    await this.register(bulb, true);
    for (const method of ['getSystemConfig', 'getModelConfig', 'getUserConfig']) {
      if (this.inactive() || bulb.current.address !== address) break;
      await this.readConfiguration(bulb, transport, address, method);
    }
  }
  private async readConfiguration(
    bulb: WizBulb,
    transport: WizTransport,
    address: string,
    method: string,
  ): Promise<void> {
    try {
      const frame = await transport.request(address, method, {});
      const config = WIZ_CONFIG.parse(frame.result);
      if (this.inactive() || bulb.current.address !== address) return;
      if (config.mac !== undefined && config.mac !== bulb.current.mac) return;
      bulb.configure(config);
    } catch (cause) {
      if (!this.inactive())
        this.ctx.log.warn('wiz.configuration_unavailable', {
          method,
          reason: cause instanceof Error ? cause.name : 'Unknown configuration error',
        });
    }
  }
  private inactive(): boolean {
    return this.stopped;
  }

  private refresh(address: string): void {
    if (
      this.transport === null ||
      this.stopped ||
      this.refreshing.has(address) ||
      this.refreshQueue.size >= MAX_BULBS
    )
      return;
    this.refreshQueue.add(address);
    this.drainRefresh();
  }
  private drainRefresh(): void {
    const transport = this.transport;
    if (transport === null || this.stopped) return;
    while (this.refreshing.size < MAX_ENROLLING) {
      const address = this.refreshQueue.values().next().value;
      if (address === undefined) return;
      this.refreshQueue.delete(address);
      this.refreshing.add(address);
      void transport
        .request(address, 'getPilot', {})
        .catch(() => {
          if (!this.stopped)
            this.ctx.log.warn('wiz.light_refresh_failed', {
              reason: 'A light announced itself but did not return its state.',
            });
        })
        .finally(() => {
          this.refreshing.delete(address);
          this.drainRefresh();
        });
    }
  }
  private register(bulb: WizBulb, enabled: boolean): Promise<void> {
    const network = interfaceFor(bulb.current.address, this.interfaces);
    if (network === undefined || this.transport === null) return Promise.resolve();
    return this.transport.send(bulb.current.address, 'registration', {
      phoneIp: network.address,
      phoneMac: this.phoneMac,
      register: enabled,
    });
  }
  private renew(): void {
    if (this.stopped) return;
    const interfaces = wizInterfaces();
    if (JSON.stringify(interfaces) !== JSON.stringify(this.interfaces)) {
      this.interfaces = interfaces;
      void this.rescan().catch(() => {
        this.ctx.log.warn('wiz.discovery_failed', {
          reason: 'Network-change discovery could not complete.',
        });
      });
    }
    for (const bulb of this.bulbs.values()) {
      void this.register(bulb, true).catch(() => {
        if (!this.stopped)
          this.ctx.log.warn('wiz.registration_failed', {
            reason: 'A light push subscription could not be renewed.',
          });
      });
    }
  }
  private readonly abort = (): void => {
    void this.stop();
  };
  private stop(): Promise<void> {
    this.stopping ??= this.release();
    return this.stopping;
  }
  private async release(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.ctx.signal.removeEventListener('abort', this.abort);
    if (this.renewal !== null) clearInterval(this.renewal);
    this.renewal = null;
    this.discovery?.stop();
    this.queued.clear();
    this.refreshQueue.clear();
    await Promise.all(
      [...this.bulbs.values()].map((bulb) => this.register(bulb, false).catch(() => undefined)),
    );
    this.transport?.close();
    this.transport = null;
    for (const bulb of this.bulbs.values()) bulb.stop();
    await Promise.all([...this.bulbs.values()].map((bulb) => bulb.settled()));
  }
}
