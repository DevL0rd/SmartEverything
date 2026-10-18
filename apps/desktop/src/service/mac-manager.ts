import type { DesktopLinger } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { launchAgent } from './definitions.js';
import {
  DEFINITION_MODE,
  LingerUnsupportedError,
  type ManagerContext,
  type ManagerState,
  type ServiceManager,
} from './manager.js';
import { launchdDetail, launchdRunning } from './parse.js';
import { CommandFailedError } from './system.js';

const log = new Logger('desktop.service');
const LAUNCHCTL = 'launchctl';
const NOT_LOADED_EXIT_CODE = 113;

class MacManager implements ServiceManager {
  readonly kind = 'launchd';
  private readonly domain: string;
  private readonly target: string;

  constructor(private readonly context: ManagerContext) {
    this.domain = `gui/${String(context.user.uid)}`;
    this.target = `${this.domain}/${context.names.launchAgentLabel}`;
  }

  async state(): Promise<ManagerState> {
    const written = await this.context.system.files.read(this.plist);
    const loaded = await this.printed();
    return {
      installed: written !== null,
      current: written === this.definition(),
      active: loaded !== null && launchdRunning(loaded),
      detail: loaded === null ? 'launchd has not loaded the agent' : launchdDetail(loaded),
    };
  }

  async install(): Promise<void> {
    log.info('launchd.installing', { target: this.target });
    await this.context.system.files.write(this.plist, this.definition(), DEFINITION_MODE);
  }

  async start(): Promise<void> {
    const loaded = (await this.printed()) !== null;
    log.info('launchd.starting', { loaded });
    if (!loaded) {
      await this.launchctl('bootstrap', this.domain, this.plist);
      return;
    }
    await this.launchctl('kickstart', this.target);
  }

  async stop(): Promise<void> {
    const loaded = (await this.printed()) !== null;
    log.info('launchd.stopping', { loaded });
    if (loaded) {
      await this.launchctl('bootout', this.target);
    }
  }

  async restart(): Promise<void> {
    const loaded = (await this.printed()) !== null;
    log.info('launchd.restarting', { loaded });
    if (!loaded) {
      await this.start();
      return;
    }
    await this.launchctl('kickstart', '-k', this.target);
  }

  async uninstall(): Promise<void> {
    log.info('launchd.uninstalling');
    await this.stop();
    await this.context.system.files.remove(this.plist);
  }

  restoreOriginal(): Promise<boolean> {
    return Promise.resolve(false);
  }

  linger(): Promise<DesktopLinger> {
    return Promise.resolve('unsupported');
  }

  enableLinger(): Promise<void> {
    return Promise.reject(new LingerUnsupportedError(this.kind));
  }

  private get plist(): string {
    return this.context.locations.launchAgentFile;
  }

  private definition(): string {
    return launchAgent(
      this.context.launch,
      this.context.locations.outputLogFile,
      this.context.names.launchAgentLabel,
    );
  }

  private async launchctl(...args: readonly string[]): Promise<void> {
    await this.context.system.run(LAUNCHCTL, args);
  }

  private async printed(): Promise<string | null> {
    try {
      return (await this.context.system.run(LAUNCHCTL, ['print', this.target])).stdout;
    } catch (error: unknown) {
      if (error instanceof CommandFailedError && error.exitCode === NOT_LOADED_EXIT_CODE) {
        return null;
      }
      throw error;
    }
  }
}

export function macManager(context: ManagerContext): ServiceManager {
  return new MacManager(context);
}
