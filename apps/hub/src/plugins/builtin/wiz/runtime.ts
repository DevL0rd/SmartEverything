import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { CommandRefusedError, type DeviceCommand, type JsonValue } from '@smarteverything/domain';
import type { DeviceDriverContext } from '../../../local/device-driver';
import type { PluginHostContext, PluginStop } from '../contract';
import { WizBulb } from './bulb';
import { WizDiscovery } from './discovery';
import { interfaceFor, wizInterfaces, type WizInterface } from './interfaces';
import { wizExternalId } from './light';
import {
  WIZ_CONFIG,
  WIZ_MAC,
  WIZ_PILOT,
  WIZ_PORTS,
  WIZ_REGISTRATION_MS,
  WIZ_SAVED,
  type WizFrame,
  type WizPilot,
  type WizPorts,
} from './protocol';
import { WizTransport } from './transport';
import { wizTools } from './tools';
import { background, messageOf } from '@smarteverything/logging';

const CONFIG_METHODS = ['getSystemConfig', 'getModelConfig', 'getUserConfig'] as const;
const REGISTRATION_ACK = z.object({ mac: WIZ_MAC, success: z.literal(true) });
const BEAT = z.object({ mac: WIZ_MAC });

export type WizHost = Pick<
  PluginHostContext,
  'signal' | 'log' | 'tools' | 'records' | 'network'
> & {
  readonly devices: Pick<PluginHostContext['devices'], 'register'>;
};

export interface WizOptions {
  readonly ports: WizPorts;
  readonly interfaces: () => readonly WizInterface[];
}

const DEFAULT_OPTIONS: WizOptions = { ports: WIZ_PORTS, interfaces: wizInterfaces };

export class WizRuntime {
  private readonly bulbs = new Map<string, WizBulb>();
  private readonly enrolled = new Map<string, string>();
  private readonly lifetime = new AbortController();
  private readonly phoneMac = randomBytes(6).toString('hex');
  private interfaces: readonly WizInterface[] = [];
  private transport: WizTransport | null = null;
  private discovery: WizDiscovery | null = null;
  private driver: DeviceDriverContext | null = null;
  private renewal: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private stopping: Promise<void> | null = null;

  constructor(
    private readonly ctx: WizHost,
    private readonly options: WizOptions = DEFAULT_OPTIONS,
  ) {}

  async start(): Promise<PluginStop> {
    this.interfaces = this.options.interfaces();
    this.restore();
    this.transport = await WizTransport.open(this.ctx.network, {
      ports: this.options.ports,
      receive: this.receive,
      failure: () => {
        this.ctx.log.warn('wiz.socket_failed', {
          reason: 'A WiZ network socket reported an error.',
        });
      },
    });
    if (this.ctx.signal.aborted) {
      this.transport.close();
      this.transport = null;
      this.stopped = true;
      return () => Promise.resolve();
    }
    this.discovery = new WizDiscovery(this.transport, () => this.interfaces, this.lifetime.signal);
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
    this.discover('Local discovery could not send its scan. Check the network.');
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
    this.interfaces = this.options.interfaces();
    await this.discovery?.scan();
    return this.status();
  }

  private discover(reason: string): void {
    this.rescan().catch(() => {
      this.ctx.log.warn('wiz.discovery_failed', { reason });
    });
  }

  private restore(): void {
    const records = this.ctx.records('bulbs');
    for (const record of records.list()) {
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
    return Promise.resolve(async () => {
      this.driver = null;
      await Promise.all([...this.bulbs.values()].map((bulb) => bulb.detach()));
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
    switch (frame.method) {
      case 'syncPilot':
        this.observeFrame(address, frame.params);
        return;
      case 'getPilot':
        this.observeFrame(address, frame.result);
        return;
      case 'firstBeat':
        if (BEAT.safeParse(frame.params).success) this.refresh(address);
        return;
      case 'registration':
        this.acknowledged(address, frame.result);
    }
  };

  private observeFrame(address: string, payload: unknown): void {
    const pilot = WIZ_PILOT.safeParse(payload);
    if (pilot.success) this.observe(address, pilot.data);
  }

  private acknowledged(address: string, payload: unknown): void {
    const ack = REGISTRATION_ACK.safeParse(payload);
    if (!ack.success) return;
    const bulb = this.bulbs.get(ack.data.mac);
    if (bulb?.current.address !== address || !bulb.acknowledge()) this.refresh(address);
  }

  private observe(address: string, pilot: WizPilot): void {
    let bulb = this.bulbs.get(pilot.mac);
    if (bulb === undefined) {
      if (pilot.state === undefined) return;
      bulb = new WizBulb({ mac: pilot.mac, address, pilot, config: {} }, this.ctx.records('bulbs'));
      bulb.save();
      this.bulbs.set(pilot.mac, bulb);
      if (this.driver !== null) bulb.attach(this.driver);
    }
    bulb.observe(address, pilot);
    if (this.enrolled.get(pilot.mac) === address) return;
    this.enrolled.set(pilot.mac, address);
    background(this.enroll(bulb, address), 'runtime.enroll_failed');
  }

  private async enroll(bulb: WizBulb, address: string): Promise<void> {
    try {
      await this.register(bulb, true);
    } catch (cause) {
      this.ctx.log.warn('wiz.registration_failed', {
        reason: cause instanceof Error ? cause.name : 'Unknown registration error',
      });
    }
    for (const method of CONFIG_METHODS) {
      if (this.stopped || bulb.current.address !== address) return;
      await this.readConfiguration(bulb, address, method);
    }
  }

  private async readConfiguration(bulb: WizBulb, address: string, method: string): Promise<void> {
    try {
      const frame = await this.requireTransport().request(address, method, {});
      const config = WIZ_CONFIG.parse(frame.result);
      if (this.stopped || bulb.current.address !== address) return;
      if (config.mac === undefined || config.mac === bulb.current.mac) bulb.configure(config);
    } catch (cause) {
      if (!this.stopped)
        this.ctx.log.warn('wiz.configuration_unavailable', {
          method,
          reason: cause instanceof Error ? cause.name : 'Unknown configuration error',
        });
    }
  }

  private refresh(address: string): void {
    this.requireTransport()
      .request(address, 'getPilot', {})
      .catch(() => {
        if (!this.stopped)
          this.ctx.log.warn('wiz.light_refresh_failed', {
            reason: 'A light announced itself but did not return its state.',
          });
      });
  }

  private async register(bulb: WizBulb, enabled: boolean): Promise<void> {
    const network = interfaceFor(bulb.current.address, this.interfaces);
    if (network === undefined) return;
    await this.requireTransport().send(bulb.current.address, 'registration', {
      phoneIp: network.address,
      phoneMac: this.phoneMac,
      register: enabled,
    });
  }

  private requireTransport(): WizTransport {
    if (this.transport === null) throw new Error('The WiZ plugin has stopped.');
    return this.transport;
  }

  private renew(): void {
    const interfaces = this.options.interfaces();
    if (JSON.stringify(interfaces) !== JSON.stringify(this.interfaces)) {
      this.interfaces = interfaces;
      this.discover('Network-change discovery could not complete.');
    }
    for (const bulb of this.bulbs.values()) {
      this.register(bulb, true).catch(() => {
        this.ctx.log.warn('wiz.registration_failed', {
          reason: 'A light push subscription could not be renewed.',
        });
      });
    }
  }

  private readonly abort = (): void => {
    background(this.stop(), 'runtime.stop_failed');
  };

  private stop(): Promise<void> {
    this.stopping ??= this.release();
    return this.stopping;
  }

  private async release(): Promise<void> {
    this.stopped = true;
    this.lifetime.abort();
    this.ctx.signal.removeEventListener('abort', this.abort);
    if (this.renewal !== null) clearInterval(this.renewal);
    this.renewal = null;
    await Promise.all(
      [...this.bulbs.values()].map((bulb) =>
        this.register(bulb, false).catch((cause: unknown) => {
          this.ctx.log.debug('wiz.unregister_failed', () => ({
            reason: messageOf(cause),
          }));
        }),
      ),
    );
    this.transport?.close();
    this.transport = null;
    await Promise.all([...this.bulbs.values()].map((bulb) => bulb.detach()));
  }
}
