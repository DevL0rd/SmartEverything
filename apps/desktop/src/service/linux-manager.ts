import type { DesktopLinger } from '@smarteverything/domain';
import { SYSTEMD_UNIT, systemdUnit } from './definitions.js';
import {
  DEFINITION_MODE,
  type ManagerContext,
  type ManagerState,
  type ServiceManager,
} from './manager.js';
import { parseLinger, parseSystemdShow, systemdDetail, type SystemdState } from './parse.js';

const SYSTEMCTL = 'systemctl';
const LOGINCTL = 'loginctl';
const SHOWN_PROPERTIES = ['LoadState', 'ActiveState', 'SubState', 'Result'].map(
  (property) => `--property=${property}`,
);

class LinuxManager implements ServiceManager {
  readonly kind = 'systemd';

  constructor(private readonly context: ManagerContext) {}

  async state(): Promise<ManagerState> {
    const written = await this.context.system.files.read(this.context.locations.unitFile);
    const unit = await this.show();
    return {
      installed: written !== null,
      current: written === systemdUnit(this.context.launch),
      active: unit.activeState === 'active',
      detail: systemdDetail(unit),
    };
  }

  async install(): Promise<void> {
    await this.context.system.files.write(
      this.context.locations.unitFile,
      systemdUnit(this.context.launch),
      DEFINITION_MODE,
    );
    await this.systemctl('daemon-reload');
    await this.systemctl('enable', SYSTEMD_UNIT);
  }

  async start(): Promise<void> {
    await this.systemctl('start', SYSTEMD_UNIT);
  }

  async stop(): Promise<void> {
    await this.systemctl('stop', SYSTEMD_UNIT);
  }

  async restart(): Promise<void> {
    await this.systemctl('restart', SYSTEMD_UNIT);
  }

  async uninstall(): Promise<void> {
    const { files } = this.context.system;
    if ((await files.read(this.context.locations.unitFile)) !== null) {
      await this.systemctl('disable', '--now', SYSTEMD_UNIT);
    }
    await files.remove(this.context.locations.unitFile);
    await this.systemctl('daemon-reload');
  }

  async linger(): Promise<DesktopLinger> {
    const { stdout } = await this.context.system.run(LOGINCTL, [
      'show-user',
      this.context.user.name,
      '--property=Linger',
      '--value',
    ]);
    return parseLinger(stdout);
  }

  async enableLinger(): Promise<void> {
    await this.context.system.run(LOGINCTL, ['enable-linger', this.context.user.name]);
  }

  private async systemctl(...args: readonly string[]): Promise<void> {
    await this.context.system.run(SYSTEMCTL, ['--user', ...args]);
  }

  private async show(): Promise<SystemdState> {
    const { stdout } = await this.context.system.run(SYSTEMCTL, [
      '--user',
      'show',
      SYSTEMD_UNIT,
      ...SHOWN_PROPERTIES,
    ]);
    return parseSystemdShow(stdout);
  }
}

export function linuxManager(context: ManagerContext): ServiceManager {
  return new LinuxManager(context);
}
