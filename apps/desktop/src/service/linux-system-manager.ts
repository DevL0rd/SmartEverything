import type { DesktopLinger } from '@smarteverything/domain';
import { SYSTEMD_UNIT } from './definitions.js';
import {
  PRIVATE_MODE,
  type ManagerContext,
  type ManagerState,
  type ServiceManager,
} from './manager.js';
import { parseSystemdShow, systemdDetail } from './parse.js';
import type { RunCommand } from './system.js';

const SYSTEMCTL = 'systemctl';
const SHOWN_PROPERTIES = ['LoadState', 'ActiveState', 'SubState', 'Result'].map(
  (property) => `--property=${property}`,
);

export class SystemServiceManagedError extends Error {
  override readonly name = 'SystemServiceManagedError';

  constructor(unitFile: string, action: string) {
    super(
      `The server runs for the whole computer from ${unitFile}; to ${action} it, use the SmartEverything system tool (system-migration rollback).`,
    );
  }
}

class LinuxSystemManager implements ServiceManager {
  readonly kind = 'systemd';

  constructor(
    private readonly context: ManagerContext,
    private readonly approve: RunCommand,
  ) {}

  async state(): Promise<ManagerState> {
    const written = await this.context.system.files.read(this.context.locations.systemUnitFile);
    const { stdout } = await this.context.system.run(SYSTEMCTL, [
      'show',
      SYSTEMD_UNIT,
      ...SHOWN_PROPERTIES,
    ]);
    const unit = parseSystemdShow(stdout);
    return {
      installed: written !== null,
      current: true,
      active: unit.activeState === 'active',
      detail: systemdDetail(unit),
    };
  }

  install(): Promise<void> {
    return Promise.reject(
      new SystemServiceManagedError(this.context.locations.systemUnitFile, 'reinstall'),
    );
  }

  async start(): Promise<void> {
    await this.approve(SYSTEMCTL, ['start', SYSTEMD_UNIT]);
  }

  async stop(): Promise<void> {
    await this.approve(SYSTEMCTL, ['stop', SYSTEMD_UNIT]);
  }

  async restart(): Promise<void> {
    await this.context.system.files.write(
      this.context.locations.restartRequestFile,
      'restart',
      PRIVATE_MODE,
    );
  }

  uninstall(): Promise<void> {
    return Promise.reject(
      new SystemServiceManagedError(this.context.locations.systemUnitFile, 'uninstall'),
    );
  }

  linger(): Promise<DesktopLinger> {
    return Promise.resolve('before-login');
  }

  enableLinger(): Promise<void> {
    return Promise.resolve();
  }
}

export function linuxSystemManager(context: ManagerContext, approve: RunCommand): ServiceManager {
  return new LinuxSystemManager(context, approve);
}
