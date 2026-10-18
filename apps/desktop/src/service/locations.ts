import path from 'node:path';
import {
  OWNER_TOKEN_FILE,
  RESTART_REQUEST_FILE,
  SERVICE_CONFIG_FILE,
  SERVICE_LOG_FILE,
  SERVICE_OUTPUT_LOG_FILE,
  SERVICE_READY_FILE,
  STOP_REQUEST_FILE,
  SUPERVISOR_PID_FILE,
} from '@smarteverything/hub/service/configuration';
import { HUB_SERVICE_NAMES, type ServiceNames } from './definitions.js';

const WINDOWS_LAUNCHER_FILE = 'service-launch.js';

export interface ServiceLocations {
  readonly dataDirectory: string;
  readonly unitFile: string;
  readonly launchAgentFile: string;
  readonly windowsLauncherFile: string;
  readonly configFile: string;
  readonly readyFile: string;
  readonly ownerTokenFile: string;
  readonly logFile: string;
  readonly outputLogFile: string;
  readonly supervisorPidFile: string;
  readonly restartRequestFile: string;
  readonly stopRequestFile: string;
}

export interface LocationInput {
  readonly home: string;
  readonly dataDirectory: string;
  readonly xdgConfigHome: string | undefined;
}

function systemdUserDirectory(input: LocationInput): string {
  const configured = input.xdgConfigHome;
  const base =
    configured !== undefined && path.isAbsolute(configured)
      ? configured
      : path.join(input.home, '.config');
  return path.join(base, 'systemd', 'user');
}

export function companionDirectory(dataDirectory: string): string {
  return `${dataDirectory}-node`;
}

export function serviceLocations(
  input: LocationInput,
  names: ServiceNames = HUB_SERVICE_NAMES,
): ServiceLocations {
  const inData = (file: string): string => path.join(input.dataDirectory, file);
  return {
    dataDirectory: input.dataDirectory,
    unitFile: path.join(systemdUserDirectory(input), names.unit),
    launchAgentFile: path.join(
      input.home,
      'Library',
      'LaunchAgents',
      `${names.launchAgentLabel}.plist`,
    ),
    windowsLauncherFile: inData(WINDOWS_LAUNCHER_FILE),
    configFile: inData(SERVICE_CONFIG_FILE),
    readyFile: inData(SERVICE_READY_FILE),
    ownerTokenFile: inData(OWNER_TOKEN_FILE),
    logFile: inData(SERVICE_LOG_FILE),
    outputLogFile: inData(SERVICE_OUTPUT_LOG_FILE),
    supervisorPidFile: inData(SUPERVISOR_PID_FILE),
    restartRequestFile: inData(RESTART_REQUEST_FILE),
    stopRequestFile: inData(STOP_REQUEST_FILE),
  };
}
