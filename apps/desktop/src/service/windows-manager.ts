import type { DesktopLinger } from '@smarteverything/domain';
import {
  WINDOWS_RUN_KEY,
  WINDOWS_RUN_VALUE,
  windowsLauncher,
  windowsRunCommand,
} from './definitions.js';
import {
  LingerUnsupportedError,
  PRIVATE_MODE,
  type ManagerContext,
  type ManagerState,
  type ServiceManager,
} from './manager.js';
import { parsePid } from './parse.js';
import { CommandFailedError } from './system.js';

const REG = 'reg';
const WSCRIPT = 'wscript.exe';
const VALUE_MISSING_EXIT_CODE = 1;

export function parseRunValue(output: string): string | null {
  const line = output
    .split(/\r?\n/u)
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.startsWith(`${WINDOWS_RUN_VALUE} `));
  const match = line === undefined ? null : /^\S+\s+REG_SZ\s+(.*)$/u.exec(line);
  return match?.[1] ?? null;
}

class WindowsManager implements ServiceManager {
  readonly kind = 'windows-run';

  constructor(private readonly context: ManagerContext) {}

  async state(): Promise<ManagerState> {
    const { locations, launch, system } = this.context;
    const value = await this.runValue();
    const launcher = await system.files.read(locations.windowsLauncherFile);
    const active = await this.supervisorAlive();
    return {
      installed: value !== null,
      current:
        value === windowsRunCommand(locations.windowsLauncherFile) &&
        launcher === windowsLauncher(launch),
      active,
      detail: active
        ? 'the supervisor started at sign-in is running'
        : 'the supervisor is not running',
    };
  }

  async install(): Promise<void> {
    const { locations, launch, system } = this.context;
    await system.files.write(locations.windowsLauncherFile, windowsLauncher(launch), PRIVATE_MODE);
    await system.run(REG, [
      'add',
      WINDOWS_RUN_KEY,
      '/v',
      WINDOWS_RUN_VALUE,
      '/t',
      'REG_SZ',
      '/d',
      windowsRunCommand(locations.windowsLauncherFile),
      '/f',
    ]);
  }

  async start(): Promise<void> {
    await this.context.system.run(WSCRIPT, [
      '//B',
      '//Nologo',
      this.context.locations.windowsLauncherFile,
    ]);
  }

  async stop(): Promise<void> {
    if (await this.supervisorAlive()) {
      await this.context.system.files.write(
        this.context.locations.stopRequestFile,
        'stop',
        PRIVATE_MODE,
      );
    }
  }

  async restart(): Promise<void> {
    if (await this.supervisorAlive()) {
      await this.context.system.files.write(
        this.context.locations.restartRequestFile,
        'restart',
        PRIVATE_MODE,
      );
      return;
    }
    await this.start();
  }

  async uninstall(): Promise<void> {
    await this.stop();
    if ((await this.runValue()) !== null) {
      await this.context.system.run(REG, [
        'delete',
        WINDOWS_RUN_KEY,
        '/v',
        WINDOWS_RUN_VALUE,
        '/f',
      ]);
    }
    await this.context.system.files.remove(this.context.locations.windowsLauncherFile);
  }

  linger(): Promise<DesktopLinger> {
    return Promise.resolve('unsupported');
  }

  enableLinger(): Promise<void> {
    return Promise.reject(new LingerUnsupportedError(this.kind));
  }

  private async runValue(): Promise<string | null> {
    try {
      const { stdout } = await this.context.system.run(REG, [
        'query',
        WINDOWS_RUN_KEY,
        '/v',
        WINDOWS_RUN_VALUE,
      ]);
      return parseRunValue(stdout);
    } catch (error: unknown) {
      if (error instanceof CommandFailedError && error.exitCode === VALUE_MISSING_EXIT_CODE) {
        return null;
      }
      throw error;
    }
  }

  private async supervisorAlive(): Promise<boolean> {
    const holder = parsePid(
      await this.context.system.files.read(this.context.locations.supervisorPidFile),
    );
    return holder !== null && this.context.system.isAlive(holder);
  }
}

export function windowsManager(context: ManagerContext): ServiceManager {
  return new WindowsManager(context);
}
