import path from 'node:path';
import {
  COMPUTER_FILES,
  COMPUTER_LAUNCH_AGENT_LABEL,
  COMPUTER_UNIT,
} from '@smarteverything/domain';

const WINDOWS_LAUNCHER_FILE = 'service-launch.js';

export interface ServiceLocations {
  readonly dataDirectory: string;
  readonly unitFile: string;
  readonly launchAgentFile: string;
  readonly windowsLauncherFile: string;
  readonly configFile: string;
  readonly connectionFile: string;
  readonly readyFile: string;
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

export function serviceLocations(input: LocationInput): ServiceLocations {
  const root = path.resolve(input.dataDirectory);
  const at = (name: string): string => path.join(root, name);
  return {
    dataDirectory: root,
    unitFile: path.join(systemdUserDirectory(input), COMPUTER_UNIT),
    launchAgentFile: path.join(
      input.home,
      'Library',
      'LaunchAgents',
      `${COMPUTER_LAUNCH_AGENT_LABEL}.plist`,
    ),
    windowsLauncherFile: at(WINDOWS_LAUNCHER_FILE),
    configFile: at(COMPUTER_FILES.config),
    connectionFile: at(COMPUTER_FILES.nodeWindow),
    readyFile: at(COMPUTER_FILES.ready),
    logFile: at(COMPUTER_FILES.serviceLog),
    outputLogFile: at(COMPUTER_FILES.serviceOutputLog),
    supervisorPidFile: at(COMPUTER_FILES.supervisorPid),
    restartRequestFile: at(COMPUTER_FILES.restartRequest),
    stopRequestFile: at(COMPUTER_FILES.stopRequest),
  };
}
