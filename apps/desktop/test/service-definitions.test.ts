import { describe, expect, it } from 'vitest';
import {
  ServiceDefinitionError,
  launchAgent,
  systemdUnit,
  windowsLauncher,
  windowsRunCommand,
} from '../src/service/definitions.js';
import { LAUNCH } from './support/fake-system.js';

describe('systemdUnit', () => {
  it('runs the app binary as Node with the service entry, restarting it on failure', () => {
    expect(systemdUnit(LAUNCH)).toBe(
      [
        '[Unit]',
        'Description=SmartEverything server',
        '',
        '[Service]',
        'Type=simple',
        'WorkingDirectory=/home/ann/.config/SmartEverything',
        'Environment="ELECTRON_RUN_AS_NODE=1"',
        'Environment="SMARTEVERYTHING_DATA_DIRECTORY=/home/ann/.config/SmartEverything"',
        'Environment="PATH=/usr/local/bin:/usr/bin"',
        'ExecStart="/opt/SmartEverything/smarteverything" "/opt/SmartEverything/resources/service/service.mjs"',
        'Restart=on-failure',
        'RestartSec=5',
        'TimeoutStopSec=30',
        'UMask=0077',
        '',
        '[Install]',
        'WantedBy=default.target',
        '',
      ].join('\n'),
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
    expect(unit).toContain('Environment="SMARTEVERYTHING_DATA_DIRECTORY=/data/50%%"');
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
    expect(plist).toContain('<key>Label</key><string>app.smarteverything.server</string>');
    expect(plist).toContain(
      '    <string>/opt/SmartEverything/smarteverything</string>\n    <string>/opt/SmartEverything/resources/service/service.mjs</string>',
    );
    expect(plist).toContain('<key>ELECTRON_RUN_AS_NODE</key><string>1</string>');
    expect(plist).toContain(
      '<key>SMARTEVERYTHING_DATA_DIRECTORY</key><string>/Users/ann/Library/Application Support/SmartEverything</string>',
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
    executable: 'C:\\Users\\Ann\\AppData\\Local\\smarteverything\\app-1.0.0\\smarteverything.exe',
    entry:
      'C:\\Users\\Ann\\AppData\\Local\\smarteverything\\app-1.0.0\\resources\\service\\service.mjs',
    dataDirectory: 'C:\\Users\\Ann\\AppData\\Roaming\\SmartEverything',
    path: 'C:\\Windows\\system32;C:\\ffmpeg\\bin',
  };

  it('starts the supervisor hidden as Node with the data directory and PATH', () => {
    expect(windowsLauncher(windows).split('\r\n')).toStrictEqual([
      'var shell = new ActiveXObject("WScript.Shell");',
      'var environment = shell.Environment("PROCESS");',
      'environment("ELECTRON_RUN_AS_NODE") = "1";',
      'environment("SMARTEVERYTHING_DATA_DIRECTORY") = "C:\\\\Users\\\\Ann\\\\AppData\\\\Roaming\\\\SmartEverything";',
      'environment("PATH") = "C:\\\\Windows\\\\system32;C:\\\\ffmpeg\\\\bin";',
      'shell.CurrentDirectory = "C:\\\\Users\\\\Ann\\\\AppData\\\\Roaming\\\\SmartEverything";',
      'shell.Run("\\"C:\\\\Users\\\\Ann\\\\AppData\\\\Local\\\\smarteverything\\\\app-1.0.0\\\\smarteverything.exe\\" \\"C:\\\\Users\\\\Ann\\\\AppData\\\\Local\\\\smarteverything\\\\app-1.0.0\\\\resources\\\\service\\\\service.mjs\\" --supervise", 0, false);',
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
