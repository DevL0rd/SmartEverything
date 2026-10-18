import {
  DATA_DIRECTORY_VARIABLE,
  SUPERVISE_ARGUMENT,
} from '@smarteverything/hub/service/configuration';

const SYSTEMD_UNIT = 'smarteverything.service';
const NODE_SYSTEMD_UNIT = 'smarteverything-node.service';
const LAUNCH_AGENT_LABEL = 'app.smarteverything.server';
const NODE_LAUNCH_AGENT_LABEL = 'app.smarteverything.node';
export const WINDOWS_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
export const WINDOWS_RUN_VALUE = 'SmartEverything';
const NODE_WINDOWS_RUN_VALUE = 'SmartEverything Node';
const RUN_AS_NODE_VARIABLE = 'ELECTRON_RUN_AS_NODE';

export interface ServiceNames {
  readonly role: 'hub' | 'node';
  readonly unit: string;
  readonly launchAgentLabel: string;
  readonly runValue: string;
  readonly keepsRunningLoggedOut: boolean;
}

export const HUB_SERVICE_NAMES: ServiceNames = {
  role: 'hub',
  unit: SYSTEMD_UNIT,
  launchAgentLabel: LAUNCH_AGENT_LABEL,
  runValue: WINDOWS_RUN_VALUE,
  keepsRunningLoggedOut: true,
};

export const NODE_SERVICE_NAMES: ServiceNames = {
  role: 'node',
  unit: NODE_SYSTEMD_UNIT,
  launchAgentLabel: NODE_LAUNCH_AGENT_LABEL,
  runValue: NODE_WINDOWS_RUN_VALUE,
  keepsRunningLoggedOut: false,
};

export interface ServiceLaunch {
  readonly executable: string;
  readonly entry: string;
  readonly dataDirectory: string;
  readonly path: string;
  readonly efficiencyCores: string | null;
}

export class ServiceDefinitionError extends Error {
  readonly received: string;

  constructor(subject: string, rule: string, received: string) {
    super(`the service ${subject} must ${rule}; received ${JSON.stringify(received)}`);
    this.name = 'ServiceDefinitionError';
    this.received = received;
  }
}

function singleLine(subject: string, value: string): string {
  if (/[\n\r\0]/u.test(value)) {
    throw new ServiceDefinitionError(subject, 'be a single line without a NUL', value);
  }
  return value;
}

function cpuList(value: string): string {
  if (!/^\d+(-\d+)?(,\d+(-\d+)?)*$/u.test(value)) {
    throw new ServiceDefinitionError('efficiency cores', 'be a CPU list such as 16-31', value);
  }
  return value;
}

function launchValues(launch: ServiceLaunch): ServiceLaunch {
  return {
    executable: singleLine('executable', launch.executable),
    entry: singleLine('entry', launch.entry),
    dataDirectory: singleLine('data directory', launch.dataDirectory),
    path: singleLine('PATH', launch.path),
    efficiencyCores: launch.efficiencyCores === null ? null : cpuList(launch.efficiencyCores),
  };
}

function systemdQuoted(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%')}"`;
}

function systemdPath(value: string): string {
  return value.replaceAll('%', '%%');
}

function systemdExecQuoted(value: string): string {
  return systemdQuoted(value).replaceAll('$', '$$$$');
}

function unitText(description: string, launch: ServiceLaunch): string {
  const values = launchValues(launch);
  return [
    '[Unit]',
    `Description=${description}`,
    '',
    '[Service]',
    'Type=simple',
    `WorkingDirectory=${systemdPath(values.dataDirectory)}`,
    `Environment=${systemdQuoted(`${RUN_AS_NODE_VARIABLE}=1`)}`,
    `Environment=${systemdQuoted(`${DATA_DIRECTORY_VARIABLE}=${values.dataDirectory}`)}`,
    `Environment=${systemdQuoted(`PATH=${values.path}`)}`,
    `ExecStart=${systemdExecQuoted(values.executable)} ${systemdExecQuoted(values.entry)}`,
    'Restart=on-failure',
    'RestartSec=5',
    'TimeoutStopSec=30',
    'UMask=0077',
    'IOSchedulingClass=best-effort',
    'IOSchedulingPriority=7',
    'CPUWeight=1000',
    ...(values.efficiencyCores === null ? [] : [`CPUAffinity=${values.efficiencyCores}`]),
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

export function systemdUnit(launch: ServiceLaunch): string {
  return unitText('SmartEverything server', launch);
}

export function nodeSystemdUnit(launch: ServiceLaunch): string {
  return unitText('SmartEverything computer client', launch);
}

function xmlEscaped(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function plistString(value: string): string {
  return `<string>${xmlEscaped(value)}</string>`;
}

export function serviceUnit(names: ServiceNames, launch: ServiceLaunch): string {
  return names.role === 'node' ? nodeSystemdUnit(launch) : systemdUnit(launch);
}

export function launchAgent(
  launch: ServiceLaunch,
  outputLog: string,
  label: string = LAUNCH_AGENT_LABEL,
): string {
  const values = launchValues(launch);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key>${plistString(label)}`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    `    ${plistString(values.executable)}`,
    `    ${plistString(values.entry)}`,
    '  </array>',
    `  <key>WorkingDirectory</key>${plistString(values.dataDirectory)}`,
    '  <key>EnvironmentVariables</key>',
    '  <dict>',
    `    <key>${RUN_AS_NODE_VARIABLE}</key>${plistString('1')}`,
    `    <key>${DATA_DIRECTORY_VARIABLE}</key>${plistString(values.dataDirectory)}`,
    `    <key>PATH</key>${plistString(values.path)}`,
    '  </dict>',
    '  <key>RunAtLoad</key><true/>',
    '  <key>KeepAlive</key>',
    '  <dict><key>SuccessfulExit</key><false/></dict>',
    '  <key>ThrottleInterval</key><integer>5</integer>',
    '  <key>ExitTimeOut</key><integer>30</integer>',
    '  <key>Umask</key><integer>63</integer>',
    `  <key>StandardOutPath</key>${plistString(singleLine('log', outputLog))}`,
    `  <key>StandardErrorPath</key>${plistString(singleLine('log', outputLog))}`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

function windowsPath(subject: string, value: string): string {
  if (value.includes('"')) {
    throw new ServiceDefinitionError(subject, 'be a Windows path without quotes', value);
  }
  return value;
}

export function windowsLauncher(launch: ServiceLaunch): string {
  const values = launchValues(launch);
  const command = `"${windowsPath('executable', values.executable)}" "${windowsPath('entry', values.entry)}" ${SUPERVISE_ARGUMENT}`;
  return [
    'var shell = new ActiveXObject("WScript.Shell");',
    'var environment = shell.Environment("PROCESS");',
    `environment(${JSON.stringify(RUN_AS_NODE_VARIABLE)}) = "1";`,
    `environment(${JSON.stringify(DATA_DIRECTORY_VARIABLE)}) = ${JSON.stringify(values.dataDirectory)};`,
    `environment("PATH") = ${JSON.stringify(values.path)};`,
    `shell.CurrentDirectory = ${JSON.stringify(values.dataDirectory)};`,
    `shell.Run(${JSON.stringify(command)}, 0, false);`,
    '',
  ].join('\r\n');
}

export function windowsRunCommand(launcherFile: string): string {
  return `wscript.exe //B //Nologo "${windowsPath('launcher', singleLine('launcher', launcherFile))}"`;
}
