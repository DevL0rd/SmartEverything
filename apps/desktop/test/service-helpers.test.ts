import { describe, expect, it } from 'vitest';
import { ServiceConfigFileError, prepareServiceConfig } from '../src/service/config-file.js';
import {
  Go2rtcTargetError,
  go2rtcBuildName,
  go2rtcShippedName,
} from '../src/service/go2rtc-binary.js';
import { liveUrlOf } from '../src/service/live-link.js';
import { serviceLocations } from '../src/service/locations.js';
import { executableCandidates, ffmpegCheck, servicePath } from '../src/service/search-path.js';
import { trayHealthLabel } from '../src/tray-status.js';
import { LOCATIONS } from './support/fake-system.js';

describe('serviceLocations', () => {
  it('keeps the service files in the data directory and the unit in the systemd user directory', () => {
    expect(LOCATIONS).toStrictEqual({
      dataDirectory: '/home/ann/.config/SmartEverything',
      unitFile: '/home/ann/.config/systemd/user/smarteverything.service',
      systemUnitFile: '/etc/systemd/system/smarteverything.service',
      launchAgentFile: '/home/ann/Library/LaunchAgents/app.smarteverything.server.plist',
      windowsLauncherFile: '/home/ann/.config/SmartEverything/service-launch.js',
      configFile: '/home/ann/.config/SmartEverything/service.json',
      readyFile: '/home/ann/.config/SmartEverything/service-ready.json',
      ownerTokenFile: '/home/ann/.config/SmartEverything/owner-token',
      logFile: '/home/ann/.config/SmartEverything/service.log',
      outputLogFile: '/home/ann/.config/SmartEverything/service-output.log',
      supervisorPidFile: '/home/ann/.config/SmartEverything/supervisor.pid',
      restartRequestFile: '/home/ann/.config/SmartEverything/service-restart',
      stopRequestFile: '/home/ann/.config/SmartEverything/service-stop',
    });
    expect(
      serviceLocations({ home: '/home/ann', dataDirectory: '/d', xdgConfigHome: '/xdg' }).unitFile,
    ).toBe('/xdg/systemd/user/smarteverything.service');
    expect(
      serviceLocations({ home: '/home/ann', dataDirectory: '/d', xdgConfigHome: 'relative' })
        .unitFile,
    ).toBe('/home/ann/.config/systemd/user/smarteverything.service');
  });
});

describe('prepareServiceConfig', () => {
  it('writes the go2rtc path and keeps every other setting', () => {
    const first = prepareServiceConfig('/d/service.json', null, '/opt/go2rtc');
    expect(first.changed).toBe(true);
    expect(first.text).toBe('{\n  "go2rtcBinary": "/opt/go2rtc"\n}\n');
    expect(first.config.port).toBe(7880);
    const kept = prepareServiceConfig(
      '/d/service.json',
      JSON.stringify({ port: 9000, logLevel: 'debug', go2rtcBinary: '/old/go2rtc' }),
      '/opt/go2rtc',
    );
    expect(kept.config).toMatchObject({
      port: 9000,
      logLevel: 'debug',
      go2rtcBinary: '/opt/go2rtc',
    });
    expect(prepareServiceConfig('/d/service.json', kept.text, '/opt/go2rtc').changed).toBe(false);
  });

  it('refuses a file that is not a JSON object or that the server would refuse', () => {
    expect(() => prepareServiceConfig('/d/service.json', '{', '/opt/go2rtc')).toThrow(
      ServiceConfigFileError,
    );
    expect(() => prepareServiceConfig('/d/service.json', '[1]', '/opt/go2rtc')).toThrow(
      'the service settings /d/service.json must hold a JSON object; received [1]',
    );
    expect(() =>
      prepareServiceConfig('/d/service.json', JSON.stringify({ port: 0 }), '/opt/go2rtc'),
    ).toThrow(/port/u);
  });
});

describe('servicePath and ffmpeg', () => {
  it('keeps absolute directories once, drops node_modules and adds the usual places', () => {
    expect(
      servicePath('darwin', '/usr/bin:relative:/repo/node_modules/.bin:/usr/bin:/Users/ann/bin'),
    ).toBe('/usr/bin:/Users/ann/bin:/opt/homebrew/bin:/usr/local/bin:/bin');
    expect(servicePath('linux', '')).toBe('/usr/local/bin:/usr/bin:/bin');
    expect(servicePath('win32', 'C:\\Windows;C:\\ffmpeg\\bin;.')).toBe(
      'C:\\Windows;C:\\ffmpeg\\bin',
    );
  });

  it('finds ffmpeg on the path or explains how to install it', () => {
    expect(executableCandidates('ffmpeg', 'win32', 'C:\\a;;C:\\b')).toStrictEqual([
      'C:\\a\\ffmpeg.exe',
      'C:\\b\\ffmpeg.exe',
    ]);
    expect(
      ffmpegCheck('linux', '/usr/local/bin:/usr/bin', (file) => file === '/usr/bin/ffmpeg'),
    ).toStrictEqual({
      found: true,
      path: '/usr/bin/ffmpeg',
      instructions: '',
    });
    const missing = ffmpegCheck('darwin', '/usr/bin', () => false);
    expect(missing.found).toBe(false);
    expect(missing.instructions).toContain('brew install ffmpeg');
    expect(ffmpegCheck('win32', 'C:\\a', () => false).instructions).toContain('winget install');
    expect(ffmpegCheck('linux', '/a', () => false).instructions).toContain('pacman -S ffmpeg');
  });
});

describe('go2rtc binaries', () => {
  it('maps a package target to the pinned build and refuses targets without one', () => {
    expect(go2rtcBuildName('linux', 'x64')).toBe('go2rtc-linux-amd64');
    expect(go2rtcBuildName('darwin', 'arm64')).toBe('go2rtc-darwin-arm64');
    expect(go2rtcBuildName('win32', 'x64')).toBe('go2rtc-windows-amd64.exe');
    expect(() => go2rtcBuildName('win32', 'arm64')).toThrow(Go2rtcTargetError);
    expect(() => go2rtcBuildName('freebsd', 'x64')).toThrow('received a package for freebsd/x64');
    expect(go2rtcShippedName('win32')).toBe('go2rtc.exe');
    expect(go2rtcShippedName('linux')).toBe('go2rtc');
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

describe('liveUrlOf', () => {
  it('opens the live socket on the server origin with the matching scheme', () => {
    expect(liveUrlOf('http://127.0.0.1:7880')).toBe('ws://127.0.0.1:7880/live');
    expect(liveUrlOf('https://home.example.com/base')).toBe('wss://home.example.com/live');
  });
});
