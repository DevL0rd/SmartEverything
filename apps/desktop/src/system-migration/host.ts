import { userInfo } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { SYSTEMD_TUNNEL_UNIT, SYSTEMD_UNIT, type UnitAccount } from '../service/definitions.js';
import { SYSTEMD_SYSTEM_DIRECTORY, systemdUserDirectory } from '../service/locations.js';
import { PRIVATE_MODE } from '../service/manager.js';
import type { ServiceSystem } from '../service/system.js';

const SYSTEMCTL = 'systemctl';
const SUDO = 'sudo';
const UNIT_MODE = '0644';

export interface UnitFiles {
  readonly user: string;
  readonly system: string;
}

export interface MigrationLayout {
  readonly account: UnitAccount;
  readonly uid: number;
  readonly home: string;
  readonly server: UnitFiles;
  readonly tunnel: UnitFiles;
}

export interface MigrationHost {
  readonly system: ServiceSystem;
  readonly layout: MigrationLayout;
  readonly userctl: (args: readonly string[]) => Promise<string>;
  readonly inspect: (args: readonly string[]) => Promise<string>;
  readonly elevated: (args: readonly string[]) => Promise<string>;
  readonly installUnit: (file: string, text: string, staging: string) => Promise<void>;
  readonly removeUnit: (file: string) => Promise<void>;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly now: () => Date;
}

export interface HostInput {
  readonly system: ServiceSystem;
  readonly root: string;
  readonly xdgConfigHome: string | undefined;
}

function rebased(root: string, file: string): string {
  return path.join(root, file);
}

async function layoutOf(input: HostInput): Promise<MigrationLayout> {
  const account = userInfo();
  const group = (await input.system.run('id', ['-gn'])).stdout.trim();
  const userDirectory = systemdUserDirectory({
    home: account.homedir,
    dataDirectory: account.homedir,
    xdgConfigHome: input.xdgConfigHome,
  });
  const files = (unit: string): UnitFiles => ({
    user: rebased(input.root, path.join(userDirectory, unit)),
    system: rebased(input.root, path.join(SYSTEMD_SYSTEM_DIRECTORY, unit)),
  });
  return {
    account: { user: account.username, group },
    uid: account.uid,
    home: account.homedir,
    server: files(SYSTEMD_UNIT),
    tunnel: files(SYSTEMD_TUNNEL_UNIT),
  };
}

export async function nodeMigrationHost(input: HostInput): Promise<MigrationHost> {
  const { system } = input;
  const run = async (file: string, args: readonly string[]): Promise<string> =>
    (await system.run(file, args)).stdout;
  const elevated = (args: readonly string[]): Promise<string> =>
    run(SUDO, ['-n', SYSTEMCTL, ...args]);
  return {
    system,
    layout: await layoutOf(input),
    userctl: (args) => run(SYSTEMCTL, ['--user', ...args]),
    inspect: (args) => run(SYSTEMCTL, args),
    elevated,
    installUnit: async (file, text, staging): Promise<void> => {
      const staged = path.join(staging, `.${path.basename(file)}.staged`);
      await system.files.write(staged, text, PRIVATE_MODE);
      try {
        await run(SUDO, ['-n', 'install', '-m', UNIT_MODE, staged, file]);
      } finally {
        await system.files.remove(staged);
      }
    },
    removeUnit: async (file): Promise<void> => {
      await run(SUDO, ['-n', 'rm', '-f', file]);
    },
    sleep: (milliseconds) => delay(milliseconds),
    now: () => new Date(),
  };
}
