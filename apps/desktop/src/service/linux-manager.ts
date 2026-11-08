import { COMPUTER_UNIT, type DesktopLinger } from '@smarteverything/domain';
import { systemdUnit } from './definitions.js';
import { type ManagerContext, type ManagerState, type ServiceManager } from './manager.js';
import { restoreOriginalUnit, writeManagedUnit, type UnitFiles } from './unit-adoption.js';
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
      current: written === this.definition(),
      active: unit.activeState === 'active',
      detail: systemdDetail(unit),
    };
  }

  async install(): Promise<void> {
    await writeManagedUnit(this.unitFiles(), this.definition());
    await this.systemctl('daemon-reload');
    await this.systemctl('enable', COMPUTER_UNIT);
  }

  async start(): Promise<void> {
    await this.systemctl('start', COMPUTER_UNIT);
  }

  async stop(): Promise<void> {
    await this.systemctl('stop', COMPUTER_UNIT);
  }

  async restart(): Promise<void> {
    await this.systemctl('restart', COMPUTER_UNIT);
  }

  async uninstall(): Promise<void> {
    const { files } = this.context.system;
    if ((await files.read(this.context.locations.unitFile)) !== null) {
      await this.systemctl('disable', '--now', COMPUTER_UNIT);
    }
    await files.remove(this.context.locations.unitFile);
    await this.systemctl('daemon-reload');
  }

  async restoreOriginal(): Promise<boolean> {
    const restored = await restoreOriginalUnit(this.unitFiles());
    if (restored) await this.systemctl('daemon-reload');
    return restored;
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

  private definition(): string {
    return systemdUnit(this.context.launch);
  }

  private unitFiles(): UnitFiles {
    const { locations, system } = this.context;
    return {
      files: system.files,
      unitFile: locations.unitFile,
      dataDirectory: locations.dataDirectory,
    };
  }

  private async systemctl(...args: readonly string[]): Promise<void> {
    await this.context.system.run(SYSTEMCTL, ['--user', ...args]);
  }

  private async show(): Promise<SystemdState> {
    const { stdout } = await this.context.system.run(SYSTEMCTL, [
      '--user',
      'show',
      COMPUTER_UNIT,
      ...SHOWN_PROPERTIES,
    ]);
    return parseSystemdShow(stdout);
  }
}

export function linuxManager(context: ManagerContext): ServiceManager {
  return new LinuxManager(context);
}
