import type { PluginContext } from '../contract';
import type { ActivityLog } from './activity';
import { DnsServer } from './dns';
import type { AibiEnvironment } from './runtime';
import type { RobotState } from './robot-state';
import type { RobotServer } from './server';
import type { AibiSettings } from './settings';
import { tlsPair } from './tls-cert';

const REASON_MAX = 400;

function reasonOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, REASON_MAX);
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
      this.down();
      throw error;
    }
    if (ctx.settings.dns) {
      await this.startDns();
    }
  }

  down(): void {
    this.options.server.stop();
    this.dns?.stop();
    this.dns = null;
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
      httpPort: settings.http_port,
      httpsPort: settings.https_port,
      key: pair.key,
      cert: pair.cert,
      cloud: environment.cloud(settings.dns_upstream),
    });
    state.server = { state: 'running', reason: null };
    activity.add(
      'network',
      `Listening for AIBI on ports ${String(settings.http_port)} and ${String(settings.https_port)}`,
      `Mode: ${settings.mode}`,
    );
  }

  private async startDns(): Promise<void> {
    const { ctx, state, activity } = this.options;
    const { address } = state;
    if (address === null) {
      state.dns = { state: 'failed', reason: 'No network address was found for this computer' };
      return;
    }
    const dns = new DnsServer(
      {
        address,
        port: ctx.settings.dns_port,
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
      await dns.start();
      this.dns = dns;
      state.dns = { state: 'running', reason: null };
    } catch (error) {
      dns.stop();
      state.dns = { state: 'failed', reason: reasonOf(error) };
      activity.add('warning', 'DNS server did not start', reasonOf(error));
    }
  }
}
