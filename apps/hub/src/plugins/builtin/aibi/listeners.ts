import type { PluginContext } from '../contract';
import type { ActivityLog } from './activity';
import { DnsServer } from './dns';
import type { AibiEnvironment } from './runtime';
import type { RobotState } from './robot-state';
import type { RobotServer } from './server';
import { AIBI_PORTS, type AibiSettings } from './settings';
import { tlsPair } from './tls-cert';
import { background, messageOf } from '@smarteverything/logging';

const REASON_MAX = 400;

function reasonOf(error: unknown): string {
  return messageOf(error).slice(0, REASON_MAX);
}

export interface ListenersOptions {
  readonly ctx: PluginContext<AibiSettings>;
  readonly environment: AibiEnvironment;
  readonly state: RobotState;
  readonly activity: ActivityLog;
  readonly server: RobotServer;
  readonly changed: () => void;
}

export class AibiListeners {
  private dns: DnsServer | null = null;
  private readonly lifetime = new AbortController();
  private addressGeneration = 0;
  private refreshing: Promise<void> = Promise.resolve();
  private unwatch: (() => Promise<void>) | null = null;

  constructor(private readonly options: ListenersOptions) {}

  async up(): Promise<void> {
    const { state, activity, ctx } = this.options;
    state.server = { state: 'starting', reason: null };
    try {
      await this.listen();
    } catch (error) {
      const reason = reasonOf(error);
      state.server = { state: 'failed', reason };
      activity.add('warning', 'AIBI server did not start', reason);
      this.options.changed();
      await this.down();
      throw error;
    }
    if (ctx.settings.dns && !this.lifetime.signal.aborted) {
      await this.watchAddress();
      await this.refreshAddress();
    }
  }

  async down(): Promise<void> {
    this.lifetime.abort();
    this.addressGeneration += 1;
    const stop = this.unwatch;
    this.unwatch = null;
    this.options.server.stop();
    this.stopDns();
    if (stop !== null)
      await stop().catch((cause: unknown): void => {
        this.options.ctx.log.warn('aibi.address_watch_cleanup_failed', { reason: reasonOf(cause) });
      });
    await this.refreshing;
  }

  private async listen(): Promise<void> {
    const { ctx, environment, state, activity, server } = this.options;
    const { settings, files } = ctx;
    state.address = (await environment.address(settings.lan_address)) || null;
    const pair = await tlsPair(files.folder);
    if (pair.created) {
      activity.add('network', 'Created the certificate for api.aibipocket.com');
    }
    await server.start({
      network: ctx.network,
      httpPort: AIBI_PORTS.http,
      httpsPort: AIBI_PORTS.https,
      key: pair.key,
      cert: pair.cert,
      cloud: environment.cloud(settings.dns_upstream),
    });
    state.server = { state: 'running', reason: null };
    activity.add(
      'network',
      `Listening for AIBI on ports ${String(AIBI_PORTS.http)} and ${String(AIBI_PORTS.https)}`,
      `Mode: ${settings.mode}`,
    );
  }

  private async watchAddress(): Promise<void> {
    const watch = this.options.environment.watchAddress;
    if (watch === undefined) return;
    try {
      const stop = await watch(
        (): void => {
          background(this.refreshAddress(), 'address.refresh_failed');
        },
        (cause): void => {
          this.watchFailed(cause);
        },
        this.lifetime.signal,
      );
      if (this.lifetime.signal.aborted) await stop();
      else this.unwatch = stop;
    } catch (cause) {
      this.watchFailed(cause);
    }
  }

  private watchFailed(cause: unknown): void {
    if (this.lifetime.signal.aborted) return;
    this.options.activity.add('warning', 'AIBI address updates unavailable', reasonOf(cause));
  }

  private current(generation: number): boolean {
    return !this.lifetime.signal.aborted && generation === this.addressGeneration;
  }

  private refreshAddress(): Promise<void> {
    const generation = ++this.addressGeneration;
    this.refreshing = this.refreshing.then(() => this.applyAddress(generation));
    return this.refreshing;
  }

  private stopDns(): void {
    this.dns?.stop();
    this.dns = null;
  }

  private async applyAddress(generation: number): Promise<void> {
    if (!this.current(generation)) return;
    try {
      const address =
        (await this.options.environment.address(this.options.ctx.settings.lan_address)) || null;
      if (!this.current(generation)) return;
      if (address === this.options.state.address && this.dns !== null) return;
      this.stopDns();
      this.options.state.address = address;
      await this.startDns(generation);
    } catch (cause) {
      if (!this.current(generation)) return;
      this.stopDns();
      this.options.state.address = null;
      this.options.state.dns = { state: 'failed', reason: reasonOf(cause) };
      this.options.activity.add('warning', 'DNS address unavailable', reasonOf(cause));
    }
    if (this.current(generation)) this.options.changed();
  }

  private async startDns(generation: number): Promise<void> {
    const { ctx, state, activity } = this.options;
    const { address } = state;
    if (address === null) {
      state.dns = { state: 'failed', reason: 'No network address was found for this computer' };
      return;
    }
    const dns = new DnsServer(
      {
        address,
        port: AIBI_PORTS.dns,
        upstream: ctx.settings.dns_upstream,
        network: ctx.network,
      },
      {
        answered: (remote): void => {
          activity.add(
            'network',
            `Pointed ${remote} at this computer`,
            `api.aibipocket.com -> ${address}`,
          );
        },
        warning: (title, detail): void => {
          activity.add('warning', title, detail);
        },
      },
    );
    try {
      this.dns = dns;
      await dns.start();
      if (!this.current(generation)) {
        dns.stop();
        if (this.dns === dns) this.dns = null;
        return;
      }
      state.dns = { state: 'running', reason: null };
    } catch (error) {
      dns.stop();
      if (this.dns === dns) this.dns = null;
      if (!this.current(generation)) return;
      state.dns = { state: 'failed', reason: reasonOf(error) };
      activity.add('warning', 'DNS server did not start', reasonOf(error));
    }
  }
}
