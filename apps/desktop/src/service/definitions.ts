import {
  DATA_DIRECTORY_VARIABLE,
  SUPERVISE_ARGUMENT,
} from '@smarteverything/hub/service/configuration';

export const SYSTEMD_UNIT = 'smarteverything.service';
export const SYSTEMD_TUNNEL_UNIT = 'smarteverything-tunnel.service';
export const LAUNCH_AGENT_LABEL = 'app.smarteverything.server';
export const WINDOWS_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
export const WINDOWS_RUN_VALUE = 'SmartEverything';
const RUN_AS_NODE_VARIABLE = 'ELECTRON_RUN_AS_NODE';

export interface ServiceLaunch {
  readonly executable: string;
  readonly entry: string;
  readonly dataDirectory: string;
  readonly path: string;
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

function launchValues(launch: ServiceLaunch): ServiceLaunch {
  return {
    executable: singleLine('executable', launch.executable),
    entry: singleLine('entry', launch.entry),
    dataDirectory: singleLine('data directory', launch.dataDirectory),
    path: singleLine('PATH', launch.path),
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

export interface UnitAccount {
  readonly user: string;
  readonly group: string;
}

function serviceSection(values: ServiceLaunch): readonly string[] {
  return [
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
  ];
}

export function systemdUnit(launch: ServiceLaunch): string {
  return [
    '[Unit]',
    'Description=SmartEverything server',
    '',
    ...serviceSection(launchValues(launch)),
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

function accountName(subject: string, value: string): string {
  if (!/^[a-z_][a-z0-9_-]*\$?$/u.test(value)) {
    throw new ServiceDefinitionError(subject, 'be a plain account name', value);
  }
  return value;
}

export function systemdSystemUnit(launch: ServiceLaunch, account: UnitAccount): string {
  return [
    '[Unit]',
    'Description=SmartEverything server',
    'Wants=network-online.target',
    'After=network-online.target',
    '',
    ...serviceSection(launchValues(launch)),
    `User=${accountName('user', account.user)}`,
    `Group=${accountName('group', account.group)}`,
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join('\n');
}

export function systemdSystemTunnelUnit(execStart: string, account: UnitAccount): string {
  return [
    '[Unit]',
    'Description=Cloudflare Tunnel for SmartEverything',
    'Wants=network-online.target',
    `After=network-online.target ${SYSTEMD_UNIT}`,
    '',
    '[Service]',
    'Type=simple',
    `ExecStart=${singleLine('tunnel command', execStart)}`,
    `User=${accountName('user', account.user)}`,
    `Group=${accountName('group', account.group)}`,
    'Restart=always',
    'RestartSec=5',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join('\n');
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

export function launchAgent(launch: ServiceLaunch, outputLog: string): string {
  const values = launchValues(launch);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key>${plistString(LAUNCH_AGENT_LABEL)}`,
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
