import { describe, expect, it } from 'vitest';
import {
  ServiceDefinitionError,
  launchAgent,
  systemdUnit,
  windowsLauncher,
  windowsRunCommand,
} from '../src/service/definitions.js';
import { LAUNCH as FIXTURE_LAUNCH } from './support/fake-system.js';

const LAUNCH = {
  ...FIXTURE_LAUNCH,
  executable: '/opt/SmartEverything/resources/computer/node/bin/node',
  entry: '/opt/SmartEverything/resources/computer/computer.mjs',
};

describe('systemdUnit', () => {
  it('runs the packaged Node binary with the service entry, restarting it on failure', () => {
    expect(systemdUnit(LAUNCH)).toBe(
      [
        '[Unit]',
        'Description=SmartEverything Computer service',
        '',
        '[Service]',
        'Type=simple',
        'WorkingDirectory=/home/ann/.config/SmartEverything',
        'Environment="SMARTEVERYTHING_COMPUTER_DIRECTORY=/home/ann/.config/SmartEverything"',
        'Environment="PATH=/usr/local/bin:/usr/bin"',
        'ExecStart="/opt/SmartEverything/resources/computer/node/bin/node" "/opt/SmartEverything/resources/computer/computer.mjs"',
        'Restart=on-failure',
        'RestartSec=5',
        'TimeoutStopSec=30',
        'KillMode=mixed',
        'UMask=0077',
        'IOSchedulingClass=best-effort',
        'IOSchedulingPriority=7',
        'CPUWeight=1000',
        '',
        '[Install]',
        'WantedBy=default.target',
        '',
      ].join('\n'),
    );
  });

  it('passes the Computer folder only through its own variable, never the Hub one', () => {
    const unit = systemdUnit(LAUNCH);
    expect(unit).toContain('SMARTEVERYTHING_COMPUTER_DIRECTORY=');
    expect(unit).not.toContain('SMARTEVERYTHING_DATA_DIRECTORY');
    expect(unit).not.toContain('ELECTRON_RUN_AS_NODE');
    expect(windowsLauncher(LAUNCH)).not.toContain('ELECTRON_RUN_AS_NODE');
    expect(launchAgent(LAUNCH, '/log')).not.toContain('SMARTEVERYTHING_DATA_DIRECTORY');
    expect(windowsLauncher(LAUNCH)).not.toContain('SMARTEVERYTHING_DATA_DIRECTORY');
  });

  it('pins the service to the efficiency cores of a hybrid CPU', () => {
    const unit = systemdUnit({ ...LAUNCH, efficiencyCores: '16-31' });
    expect(unit).toContain('CPUAffinity=16-31\n');
  });

  it('does not pin on a CPU without efficiency cores', () => {
    const unit = systemdUnit(LAUNCH);
    expect(unit).not.toContain('CPUAffinity');
  });

  it('gives the Computer service a high CPU weight and no nice value so a busy machine cannot starve live audio', () => {
    const unit = systemdUnit({ ...LAUNCH, efficiencyCores: '16-31' });
    expect(unit).not.toContain('Nice=');
    expect(unit).toContain('CPUWeight=1000\n');
    expect(systemdUnit(LAUNCH)).toContain('CPUWeight=1000\n');
  });

  it('refuses a core list that is not a CPU list', () => {
    expect(() => systemdUnit({ ...LAUNCH, efficiencyCores: '16-31\nNice=-5' })).toThrow(
      ServiceDefinitionError,
    );
  });

  it('escapes quotes, backslashes, specifiers and variables', () => {
    const unit = systemdUnit({
      ...LAUNCH,
      executable: '/opt/100% "real"/$HOME\\app',
      dataDirectory: '/data/50%',
    });
    expect(unit).toContain('ExecStart="/opt/100%% \\"real\\"/$$HOME\\\\app"');
    expect(unit).toContain('WorkingDirectory=/data/50%%');
    expect(unit).toContain('Environment="SMARTEVERYTHING_COMPUTER_DIRECTORY=/data/50%%"');
  });

  it('refuses values that would add a line to the unit', () => {
    expect(() => systemdUnit({ ...LAUNCH, path: '/bin\nExecStartPre=/bin/false' })).toThrow(
      ServiceDefinitionError,
    );
    expect(() => systemdUnit({ ...LAUNCH, entry: 'a\0b' })).toThrow(
      'the service entry must be a single line without a NUL; received "a\\u0000b"',
    );
  });
});

describe('launchAgent', () => {
  it('keeps the agent alive, starts it at load and logs into the data directory', () => {
    const plist = launchAgent(
      { ...LAUNCH, dataDirectory: '/Users/ann/Library/Application Support/SmartEverything' },
      '/Users/ann/Library/Application Support/SmartEverything/service-output.log',
    );
    expect(plist).toContain('<key>Label</key><string>app.smarteverything.node</string>');
    expect(plist).toContain(
      '    <string>/opt/SmartEverything/resources/computer/node/bin/node</string>\n    <string>/opt/SmartEverything/resources/computer/computer.mjs</string>',
    );
    expect(plist).not.toContain('ELECTRON_RUN_AS_NODE');
    expect(plist).toContain(
      '<key>SMARTEVERYTHING_COMPUTER_DIRECTORY</key><string>/Users/ann/Library/Application Support/SmartEverything</string>',
    );
    expect(plist).toContain('<key>RunAtLoad</key><true/>');
    expect(plist).toContain('<dict><key>SuccessfulExit</key><false/></dict>');
    expect(plist).toContain(
      '<key>StandardErrorPath</key><string>/Users/ann/Library/Application Support/SmartEverything/service-output.log</string>',
    );
  });

  it('escapes XML in every value', () => {
    expect(launchAgent({ ...LAUNCH, path: `/a&b<c>"d'` }, '/log')).toContain(
      '<key>PATH</key><string>/a&amp;b&lt;c&gt;&quot;d&apos;</string>',
    );
    expect(() => launchAgent(LAUNCH, '/log\n')).toThrow(ServiceDefinitionError);
  });
});

describe('windowsLauncher', () => {
  const windows = {
    executable:
      'C:\\Users\\Ann\\AppData\\Local\\smarteverything\\app-1.0.0\\resources\\computer\\node\\node.exe',
    entry:
      'C:\\Users\\Ann\\AppData\\Local\\smarteverything\\app-1.0.0\\resources\\computer\\computer.mjs',
    dataDirectory: 'C:\\Users\\Ann\\AppData\\Roaming\\SmartEverything',
    path: 'C:\\Windows\\system32;C:\\Tools\\bin',
    efficiencyCores: null,
  };

  it('starts the supervisor hidden as Node with the data directory and PATH', () => {
    expect(windowsLauncher(windows).split('\r\n')).toStrictEqual([
      'var shell = new ActiveXObject("WScript.Shell");',
      'var environment = shell.Environment("PROCESS");',
      'environment("SMARTEVERYTHING_COMPUTER_DIRECTORY") = "C:\\\\Users\\\\Ann\\\\AppData\\\\Roaming\\\\SmartEverything";',
      'environment("PATH") = "C:\\\\Windows\\\\system32;C:\\\\Tools\\\\bin";',
      'shell.CurrentDirectory = "C:\\\\Users\\\\Ann\\\\AppData\\\\Roaming\\\\SmartEverything";',
      'shell.Run("\\"C:\\\\Users\\\\Ann\\\\AppData\\\\Local\\\\smarteverything\\\\app-1.0.0\\\\resources\\\\computer\\\\node\\\\node.exe\\" \\"C:\\\\Users\\\\Ann\\\\AppData\\\\Local\\\\smarteverything\\\\app-1.0.0\\\\resources\\\\computer\\\\computer.mjs\\" --supervise", 0, false);',
      '',
    ]);
  });

  it('refuses paths with quotes and runs the launcher through wscript', () => {
    expect(() => windowsLauncher({ ...windows, executable: 'C:\\a"b.exe' })).toThrow(
      'the service executable must be a Windows path without quotes; received "C:\\\\a\\"b.exe"',
    );
    expect(windowsRunCommand('C:\\Data\\service-launch.js')).toBe(
      'wscript.exe //B //Nologo "C:\\Data\\service-launch.js"',
    );
  });
});
