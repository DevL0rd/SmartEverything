import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pid } from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DataDirectoryLockedError, LOCK_FILE } from '../src/data-lock';
import { lockDataDirectory } from '../src/data-lock';
import {
  DATA_DIRECTORY_VARIABLE,
  RESTART_EXIT_CODE,
  RESTART_REQUEST_FILE,
  SERVICE_CONFIG_FILE,
  SERVICE_LOG_FILE,
  SERVICE_PID_FILE,
  SERVICE_READY,
  SERVICE_READY_FILE,
  dataDirectoryFrom,
  readServiceConfig,
  serviceUrl,
} from '../src/service/configuration';
import { RoleUnavailableError, runService } from '../src/service/runner';
import { captureLogs } from './support/logs';
import { fakeGo2rtcServer, freePort, temporaryDirectory } from './support/server';

let directory: { path: string; remove: () => Promise<void> };

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
});

afterEach(async () => {
  captureLogs();
  await directory.remove();
});

async function writeConfig(extra: Readonly<Record<string, unknown>> = {}): Promise<void> {
  await writeFile(
    join(directory.path, SERVICE_CONFIG_FILE),
    JSON.stringify({
      port: await freePort(),
      host: '127.0.0.1',
      go2rtcBinary: await fakeGo2rtcServer(directory.path),
      go2rtcApiPort: await freePort(),
      ...extra,
    }),
  );
}

interface Host {
  readonly exits: Promise<number>;
  readonly signals: Map<string, () => void>;
}

function host(): Host & { readonly value: Parameters<typeof runService>[0] } {
  const signals = new Map<string, () => void>();
  let exited: (code: number) => void = () => undefined;
  const exits = new Promise<number>((resolve) => {
    exited = resolve;
  });
  return {
    exits,
    signals,
    value: {
      dataDirectory: directory.path,
      exit: (code): void => {
        exited(code);
      },
      onSignal: (signal, handler): void => {
        signals.set(signal, handler);
      },
    },
  };
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

describe('service configuration', () => {
  it('reads the data directory from the environment and refuses a relative one', () => {
    expect(
      dataDirectoryFrom({ [DATA_DIRECTORY_VARIABLE]: '/home/me/.config/SmartEverything' }),
    ).toBe('/home/me/.config/SmartEverything');
    expect(() => dataDirectoryFrom({ [DATA_DIRECTORY_VARIABLE]: 'relative' })).toThrow(
      'The service configuration in the environment is unusable: SMARTEVERYTHING_DATA_DIRECTORY: must be an absolute path.',
    );
  });

  it('fills defaults and refuses a missing, malformed or invalid file', async () => {
    await expect(readServiceConfig(directory.path)).rejects.toThrow(
      /service\.json is unusable: ENOENT/,
    );
    await writeFile(join(directory.path, SERVICE_CONFIG_FILE), '{');
    await expect(readServiceConfig(directory.path)).rejects.toThrow(/it is not JSON/);
    await writeFile(
      join(directory.path, SERVICE_CONFIG_FILE),
      JSON.stringify({ go2rtcBinary: 'go2rtc', extra: 1 }),
    );
    await expect(readServiceConfig(directory.path)).rejects.toThrow(
      /go2rtcBinary: must be an absolute path/,
    );
    await writeFile(
      join(directory.path, SERVICE_CONFIG_FILE),
      JSON.stringify({ go2rtcBinary: '/opt/go2rtc' }),
    );
    expect(await readServiceConfig(directory.path)).toStrictEqual({
      role: 'hub',
      port: 7880,
      host: '0.0.0.0',
      go2rtcBinary: '/opt/go2rtc',
      go2rtcApiPort: 1984,
      webrtcPort: 8555,
      logLevel: 'info',
    });
    expect(serviceUrl({ host: '0.0.0.0', port: 7880 })).toBe('http://127.0.0.1:7880');
    expect(serviceUrl({ host: '::', port: 7880 })).toBe('http://127.0.0.1:7880');
    expect(serviceUrl({ host: '192.168.1.5', port: 81 })).toBe('http://192.168.1.5:81');
  });
});

describe('runService', () => {
  it('writes its pid and log, and restarts when the restart request file appears', async () => {
    await writeConfig();
    const running = host();
    const service = await runService(running.value);
    expect((await readFile(join(directory.path, SERVICE_PID_FILE), 'utf8')).trim()).toBe(
      String(pid),
    );
    expect((await fetch(`${service.server.url}/status`)).status).toBe(200);
    const ready = SERVICE_READY.parse(
      JSON.parse(await readFile(join(directory.path, SERVICE_READY_FILE), 'utf8')),
    );
    expect(ready).toStrictEqual({ pid, url: service.server.url, version: '0.0.0' });
    expect(serviceUrl(await readServiceConfig(directory.path))).toBe(service.server.url);
    await writeFile(join(directory.path, RESTART_REQUEST_FILE), 'now');
    expect(await running.exits).toBe(RESTART_EXIT_CODE);
    expect(await exists(join(directory.path, SERVICE_PID_FILE))).toBe(false);
    expect(await exists(join(directory.path, RESTART_REQUEST_FILE))).toBe(false);
    expect(await exists(join(directory.path, LOCK_FILE))).toBe(false);
    expect(await exists(join(directory.path, SERVICE_READY_FILE))).toBe(false);
    const log = await readFile(join(directory.path, SERVICE_LOG_FILE), 'utf8');
    expect(log).toContain('"event":"service.started"');
    expect(log).toContain('"event":"service.restart_requested"');
  });

  it('stops cleanly with exit code 0 on SIGTERM', async () => {
    await writeConfig({ logLevel: 'warn' });
    const running = host();
    await runService(running.value);
    running.signals.get('SIGTERM')?.();
    expect(await running.exits).toBe(0);
    expect(await readFile(join(directory.path, SERVICE_LOG_FILE), 'utf8')).not.toContain(
      'service.started',
    );
  });

  it('refuses a role this version cannot run, before taking the data directory', async () => {
    await writeConfig({ role: 'node' });
    await expect(runService(host().value)).rejects.toThrow(RoleUnavailableError);
    expect(await exists(join(directory.path, SERVICE_PID_FILE))).toBe(false);
    expect(await exists(join(directory.path, LOCK_FILE))).toBe(false);
  });

  it('fails visibly and leaves no pid file when the server cannot start', async () => {
    await writeConfig({ go2rtcBinary: join(directory.path, 'missing-go2rtc') });
    await expect(runService(host().value)).rejects.toThrow(/ENOENT/);
    expect(await exists(join(directory.path, SERVICE_PID_FILE))).toBe(false);
    expect(await readFile(join(directory.path, SERVICE_LOG_FILE), 'utf8')).toContain(
      '"event":"service.start_failed"',
    );
  });
});

describe('lockDataDirectory', () => {
  it('replaces a lock left by a process that is gone and refuses one held by a live process', async () => {
    await writeFile(join(directory.path, LOCK_FILE), '999999999');
    const lock = await lockDataDirectory(directory.path);
    expect(await readFile(join(directory.path, LOCK_FILE), 'utf8')).toBe(String(pid));
    await expect(lockDataDirectory(directory.path)).rejects.toThrow(DataDirectoryLockedError);
    await lock.release();
    await writeFile(join(directory.path, LOCK_FILE), '1');
    await expect(lockDataDirectory(directory.path)).rejects.toThrow(
      `Another SmartEverything server (process 1) is already using ${directory.path}; stop it before starting another.`,
    );
  });
});
