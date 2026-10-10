import { readlink } from 'node:fs/promises';
import path from 'node:path';
import {
  systemdSystemTunnelUnit,
  systemdSystemUnit,
  type ServiceLaunch,
} from '../service/definitions.js';
import { serviceLocations, type ServiceLocations } from '../service/locations.js';
import type { MigrationHost, UnitFiles } from './host.js';
import { launchOfUserUnit, tunnelCommandOf } from './user-unit.js';

const WINDOW_LOCK = 'SingletonLock';
const WINDOW_LOCK_PID = /-(\d+)$/u;

export interface UnitMove {
  readonly name: string;
  readonly files: UnitFiles;
  readonly systemText: string;
  readonly installed: 'absent' | 'identical';
}

export interface MigrationPlan {
  readonly launch: ServiceLaunch;
  readonly locations: ServiceLocations;
  readonly moves: readonly UnitMove[];
}

export class PreflightError extends Error {
  override readonly name = 'PreflightError';
}

async function required(host: MigrationHost, file: string): Promise<string> {
  const text = await host.system.files.read(file);
  if (text === null) {
    throw new PreflightError(`${file} doesn't exist; there is no user service to move.`);
  }
  return text;
}

async function unitMove(
  host: MigrationHost,
  name: string,
  files: UnitFiles,
  systemText: string,
): Promise<UnitMove> {
  const existing = await host.system.files.read(files.system);
  if (existing !== null && existing !== systemText) {
    throw new PreflightError(
      `${files.system} already exists and was not written by SmartEverything; remove it by hand first.`,
    );
  }
  return { name, files, systemText, installed: existing === null ? 'absent' : 'identical' };
}

async function tunnelMove(host: MigrationHost): Promise<UnitMove> {
  const { tunnel } = host.layout;
  const command = tunnelCommandOf(tunnel.user, await required(host, tunnel.user), host.layout.home);
  return unitMove(
    host,
    path.basename(tunnel.system),
    tunnel,
    systemdSystemTunnelUnit(command, host.layout.account),
  );
}

async function windowClosed(host: MigrationHost, dataDirectory: string): Promise<void> {
  const target = await readlink(path.join(dataDirectory, WINDOW_LOCK)).catch((cause: unknown) => {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
      return null;
    }
    throw cause;
  });
  const holder = target === null ? null : WINDOW_LOCK_PID.exec(target)?.[1];
  if (holder !== null && holder !== undefined && host.system.isAlive(Number(holder))) {
    throw new PreflightError(
      `the SmartEverything window is open (process ${holder}); quit it from the tray first.`,
    );
  }
}

export interface PlanOptions {
  readonly tunnel: boolean;
}

export async function preflight(host: MigrationHost, options: PlanOptions): Promise<MigrationPlan> {
  if (host.layout.uid === 0) {
    throw new PreflightError('run this as the computer owner, not as root; it uses sudo itself.');
  }
  const { server } = host.layout;
  const launch = launchOfUserUnit(server.user, await required(host, server.user));
  const locations = serviceLocations({
    home: host.layout.home,
    dataDirectory: launch.dataDirectory,
    xdgConfigHome: undefined,
  });
  await windowClosed(host, launch.dataDirectory);
  await host.elevated(['--version']);
  const moves = [
    await unitMove(
      host,
      path.basename(server.system),
      server,
      systemdSystemUnit(launch, host.layout.account),
    ),
    ...(options.tunnel ? [await tunnelMove(host)] : []),
  ];
  return { launch, locations, moves };
}
