import { describe, expect, it } from 'vitest';
import { ServiceConfigFileError, parseComputerConfig } from '../src/service/config-file.js';
import { serviceLocations } from '../src/service/locations.js';
import { servicePath } from '../src/service/search-path.js';
import { trayHealthLabel } from '../src/tray-status.js';
import { LOCATIONS } from './support/fake-system.js';

describe('serviceLocations', () => {
  it('keeps the service files in the data directory and the unit in the systemd user directory', () => {
    expect(LOCATIONS).toStrictEqual({
      dataDirectory: '/home/ann/.config/SmartEverything',
      unitFile: '/home/ann/.config/systemd/user/smarteverything-node.service',
      launchAgentFile: '/home/ann/Library/LaunchAgents/app.smarteverything.node.plist',
      windowsLauncherFile: '/home/ann/.config/SmartEverything/service-launch.js',
      configFile: '/home/ann/.config/SmartEverything/service.json',
      readyFile: '/home/ann/.config/SmartEverything/service-ready.json',
      connectionFile: '/home/ann/.config/SmartEverything/node-window.json',
      logFile: '/home/ann/.config/SmartEverything/service.log',
      outputLogFile: '/home/ann/.config/SmartEverything/service-output.log',
      supervisorPidFile: '/home/ann/.config/SmartEverything/supervisor.pid',
      restartRequestFile: '/home/ann/.config/SmartEverything/service-restart',
      stopRequestFile: '/home/ann/.config/SmartEverything/service-stop',
    });
    expect(
      serviceLocations({ home: '/home/ann', dataDirectory: '/d', xdgConfigHome: '/xdg' }).unitFile,
    ).toBe('/xdg/systemd/user/smarteverything-node.service');
    expect(
      serviceLocations({ home: '/home/ann', dataDirectory: '/d', xdgConfigHome: 'relative' })
        .unitFile,
    ).toBe('/home/ann/.config/systemd/user/smarteverything-node.service');
  });
});

describe('parseComputerConfig', () => {
  it('leaves an unpaired computer without service configuration', () => {
    expect(parseComputerConfig('/d/service.json', null)).toBeNull();
  });

  it('rejects invalid JSON and any configuration that still carries a role', () => {
    expect(() => parseComputerConfig('/d/service.json', '{')).toThrow(ServiceConfigFileError);
    expect(() => parseComputerConfig('/d/service.json', '[1]')).toThrow(
      'the service settings /d/service.json must hold a JSON object; received [1]',
    );
    expect(() => parseComputerConfig('/d/service.json', '{"role":"hub"}')).toThrow(/role/u);
    expect(() =>
      parseComputerConfig(
        '/d/service.json',
        JSON.stringify({
          role: 'node',
          node: {
            hub_url: 'https://hub.example:7880',
            node_token: `sen_${'b'.repeat(43)}`,
            device_id: '5b2f6c0e-4a4e-4c1a-9a4e-3d1f0e9b7a11',
          },
        }),
      ),
    ).toThrow(/role/u);
  });
});

describe('servicePath', () => {
  it('keeps absolute directories once, drops node_modules and adds the usual places', () => {
    expect(
      servicePath('darwin', '/usr/bin:relative:/repo/node_modules/.bin:/usr/bin:/Users/ann/bin'),
    ).toBe('/usr/bin:/Users/ann/bin:/opt/homebrew/bin:/usr/local/bin:/bin');
    expect(servicePath('linux', '')).toBe('/usr/local/bin:/usr/bin:/bin');
    expect(servicePath('win32', 'C:\\Windows;C:\\Tools\\bin;.')).toBe('C:\\Windows;C:\\Tools\\bin');
  });
});

describe('trayHealthLabel', () => {
  it('names the health and the address while running', () => {
    expect(trayHealthLabel(null)).toBe('Server status unknown');
    const status = {
      manager: 'systemd',
      health: 'running',
      installed: true,
      active: true,
      url: 'http://127.0.0.1:7880',
      dataDirectory: '/d',
      detail: '',
      linger: 'disabled',
    } as const;
    expect(trayHealthLabel(status)).toBe('Server running at http://127.0.0.1:7880');
    expect(trayHealthLabel({ ...status, health: 'failed', url: null })).toBe('Server failed');
  });
});
