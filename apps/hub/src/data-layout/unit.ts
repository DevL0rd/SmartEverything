import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { atomicWrite, type FileOperations } from './pointer';

export const HUB_UNIT_FILE = 'smarteverything.service';
export const HUB_UNIT_BOOTSTRAP = '%E/SmartEverything-Hub';

export interface HubUnitSpec {
  readonly install: string;
  readonly node: string;
  readonly entry: string;
}

export interface UnitEnvironment {
  readonly XDG_CONFIG_HOME?: string | undefined;
}

export type CommandRunner = (command: string, args: readonly string[]) => Promise<void>;

const run = promisify(execFile);

const SYSTEM_RUNNER: CommandRunner = async (command, args) => {
  await run(command, [...args]);
};

export function hubUnitText(spec: HubUnitSpec): string {
  return `[Unit]
Description=SmartEverything server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${HUB_UNIT_BOOTSTRAP}
Environment="SMARTEVERYTHING_SELF_UPDATE_INSTALL=${spec.install}"
ExecStart="${spec.install}/${spec.node}" "${spec.install}/${spec.entry}"
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0077

[Install]
WantedBy=default.target
`;
}

export function userUnitDirectory(environment: UnitEnvironment): string {
  const xdg = environment.XDG_CONFIG_HOME;
  const config = xdg !== undefined && isAbsolute(xdg) ? xdg : join(homedir(), '.config');
  return join(config, 'systemd', 'user');
}

export async function writeHubUnit(
  directory: string,
  text: string,
  operations?: FileOperations,
): Promise<string> {
  const file = join(directory, HUB_UNIT_FILE);
  await atomicWrite(file, text, operations);
  return file;
}

export async function reloadUserManager(runner: CommandRunner = SYSTEM_RUNNER): Promise<void> {
  await runner('systemctl', ['--user', 'daemon-reload']);
}
