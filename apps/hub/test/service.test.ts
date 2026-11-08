import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env, pid } from 'node:process';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readMarker, writeMarker, type HubLayout, type Location } from '../src/data-layout';
import { DataDirectoryLockedError, lockDataDirectory } from '../src/data-lock';
import {
  DATA_DIRECTORY_VARIABLE,
  RESTART_EXIT_CODE,
  SERVICE_READY,
  dataDirectoryFrom,
  readServiceConfig,
  serviceUrl,
} from '../src/service/configuration';
import { runService } from '../src/service/runner';
import { HUB_VERSION } from '../src/version';
import { captureLogs } from './support/logs';
import { fakeGo2rtcServer, freePort, temporaryDirectory } from './support/server';
import { testLayout } from './support/test-layout';

let directory: { path: string; remove: () => Promise<void> };
let layout: HubLayout;
let pointer: Pick<Location, 'rootId' | 'state'>;
let originalTemporary: string | undefined;

beforeAll(async () => {
  await import('../src/start');
}, 120_000);

beforeEach(async () => {
  captureLogs();
  originalTemporary = env['TMPDIR'];
  directory = await temporaryDirectory();
  layout = await testLayout(directory.path);
  const marker = await readMarker(layout);
  pointer = { rootId: marker?.rootId ?? '', state: 'active' };
});

afterEach(async () => {
  captureLogs();
  if (originalTemporary === undefined) delete env['TMPDIR'];
  else env['TMPDIR'] = originalTemporary;
  await directory.remove();
});

async function writeConfig(extra: Readonly<Record<string, unknown>> = {}): Promise<void> {
  await writeFile(
    layout.system.config.service,
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
      layout,
      pointer,
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
    await expect(readServiceConfig(layout.system.config.service)).rejects.toThrow(
      /service\.json is unusable: ENOENT/,
    );
    await writeFile(layout.system.config.service, '{');
    await expect(readServiceConfig(layout.system.config.service)).rejects.toThrow(/it is not JSON/);
    await writeFile(
      layout.system.config.service,
      JSON.stringify({ go2rtcBinary: 'go2rtc', extra: 1 }),
    );
    await expect(readServiceConfig(layout.system.config.service)).rejects.toThrow(
      /service\.json is unusable: go2rtcBinary: must be an absolute path; value: Unrecognized key/,
    );
    await writeFile(layout.system.config.service, JSON.stringify({ go2rtcBinary: '/opt/go2rtc' }));
    expect(await readServiceConfig(layout.system.config.service)).toStrictEqual({
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

  it('refuses a role key and any computer field in the hub configuration', async () => {
    await writeFile(
      layout.system.config.service,
      JSON.stringify({ role: 'hub', go2rtcBinary: '/opt/go2rtc' }),
    );
    await expect(readServiceConfig(layout.system.config.service)).rejects.toThrow(
      /Unrecognized key/,
    );
    await writeFile(
      layout.system.config.service,
      JSON.stringify({ go2rtcBinary: '/opt/go2rtc', wakeDiagnostics: true }),
    );
    await expect(readServiceConfig(layout.system.config.service)).rejects.toThrow(
      /Unrecognized key/,
    );
  });
});

describe('runService', () => {
  it('writes its pid and log, and restarts when the restart request file appears', async () => {
    await writeConfig();
    const running = host();
    const service = await runService(running.value);
    expect((await readFile(layout.system.run.pid, 'utf8')).trim()).toBe(String(pid));
    expect((await fetch(`${service.server.url}/status`)).status).toBe(200);
    const ready = SERVICE_READY.parse(JSON.parse(await readFile(layout.system.run.ready, 'utf8')));
    expect(ready).toStrictEqual({ pid, url: service.server.url, version: HUB_VERSION });
    expect(serviceUrl(await readServiceConfig(layout.system.config.service))).toBe(
      service.server.url,
    );
    await writeFile(layout.system.run.restartRequest, 'now');
    expect(await running.exits).toBe(RESTART_EXIT_CODE);
    expect(await exists(layout.system.run.pid)).toBe(false);
    expect(await exists(layout.system.run.restartRequest)).toBe(false);
    expect(await exists(layout.lock)).toBe(false);
    expect(await exists(layout.system.run.ready)).toBe(false);
    const log = await readFile(layout.system.logs.service, 'utf8');
    expect(log).toContain('"event":"service.started"');
    expect(log).toContain('"event":"service.restart_requested"');
  });

  it('stops cleanly with exit code 0 on SIGTERM', async () => {
    await writeConfig({ logLevel: 'warn' });
    const running = host();
    await runService(running.value);
    running.signals.get('SIGTERM')?.();
    expect(await running.exits).toBe(0);
    expect(await readFile(layout.system.logs.service, 'utf8')).not.toContain('service.started');
  });

  it('migrates a hub configuration that still has a role once and logs it', async () => {
    await writeConfig({ role: 'hub' });
    const running = host();
    await runService(running.value);
    running.signals.get('SIGTERM')?.();
    expect(await running.exits).toBe(0);
    expect(JSON.parse(await readFile(layout.system.config.service, 'utf8'))).not.toHaveProperty(
      'role',
    );
    expect(await readFile(layout.system.logs.service, 'utf8')).toContain(
      '"event":"hub.config_migrated"',
    );
  });

  it('refuses a valid computer service configuration before taking the data directory', async () => {
    await writeFile(
      layout.system.config.service,
      JSON.stringify({
        role: 'node',
        node: {
          hub_url: 'http://127.0.0.1:7880',
          node_token: `sen_${'a'.repeat(43)}`,
          device_id: crypto.randomUUID(),
        },
      }),
    );
    await expect(runService(host().value)).rejects.toThrow(/service configuration/);
    expect(await exists(layout.system.run.pid)).toBe(false);
    expect(await exists(layout.lock)).toBe(false);
  });

  it('fails visibly and leaves no pid file when the server cannot start', async () => {
    await writeConfig({ go2rtcBinary: join(directory.path, 'missing-go2rtc') });
    await expect(runService(host().value)).rejects.toThrow(/ENOENT/);
    expect(await exists(layout.system.run.pid)).toBe(false);
    expect(await readFile(layout.system.logs.service, 'utf8')).toContain(
      '"event":"service.start_failed"',
    );
  });
});

describe('runService data folder checks', () => {
  async function untouched(): Promise<void> {
    expect(await exists(layout.system.run.pid)).toBe(false);
    expect(await exists(layout.system.logs.service)).toBe(false);
    expect(env['TMPDIR']).toBe(originalTemporary);
  }

  it('refuses to start when the marker is missing', async () => {
    await writeConfig();
    await rm(layout.marker);
    await expect(runService(host().value)).rejects.toThrow(
      `the data folder at ${layout.root} is missing or is a different disk (not mounted?)`,
    );
    await untouched();
  });

  it('refuses to start when the marker belongs to a different folder', async () => {
    await writeConfig();
    pointer = { rootId: crypto.randomUUID(), state: 'active' };
    await expect(runService(host().value)).rejects.toThrow(/different disk/);
    await untouched();
  });

  it('refuses to start when the marker says the folder was moved', async () => {
    await writeConfig();
    await writeMarker(layout, {
      version: 1,
      rootId: pointer.rootId,
      createdAt: new Date().toISOString(),
      state: 'moved',
      movedTo: '/mnt/nas/SmartEverything',
    });
    await expect(runService(host().value)).rejects.toThrow(/moved to \/mnt\/nas\/SmartEverything/);
    await untouched();
  });

  it('skips the marker check and logs the pending migration for a pending-v1 pointer', async () => {
    await writeConfig();
    await rm(layout.marker);
    pointer = { rootId: crypto.randomUUID(), state: 'pending-v1' };
    const running = host();
    await runService(running.value);
    running.signals.get('SIGTERM')?.();
    expect(await running.exits).toBe(0);
    expect(await readFile(layout.system.logs.service, 'utf8')).toContain(
      '"event":"service.layout_migration_pending"',
    );
  });

  it('points TMPDIR at the cleared data folder tmp before the first child process starts', async () => {
    const seen = join(directory.path, 'seen-tmpdir');
    const wrapper = join(directory.path, 'go2rtc-wrapper');
    const real = await fakeGo2rtcServer(directory.path);
    await writeFile(wrapper, `#!/bin/sh\nprintf '%s' "$TMPDIR" > '${seen}'\nexec '${real}' "$@"\n`);
    await chmod(wrapper, 0o700);
    await mkdir(layout.tmp, { recursive: true });
    await writeFile(join(layout.tmp, 'stale'), 'left over');
    await writeConfig({ go2rtcBinary: wrapper });
    const running = host();
    await runService(running.value);
    expect(env['TMPDIR']).toBe(layout.tmp);
    expect(await readFile(seen, 'utf8')).toBe(layout.tmp);
    expect(await exists(join(layout.tmp, 'stale'))).toBe(false);
    running.signals.get('SIGTERM')?.();
    expect(await running.exits).toBe(0);
  });
});

describe('lockDataDirectory', () => {
  it('replaces a lock left by a process that is gone and refuses one held by a live process', async () => {
    await writeFile(layout.lock, '999999999');
    const lock = await lockDataDirectory(layout);
    expect(await readFile(layout.lock, 'utf8')).toBe(String(pid));
    await expect(lockDataDirectory(layout)).rejects.toThrow(DataDirectoryLockedError);
    await lock.release();
    await writeFile(layout.lock, '1');
    await expect(lockDataDirectory(layout)).rejects.toThrow(
      `Another SmartEverything server (process 1) is already using ${directory.path}; stop it before starting another.`,
    );
  });
});
