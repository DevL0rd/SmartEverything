import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dataLayoutOf } from '../release-hub-files.ts';
import {
  HeadlessPackageError,
  installDataScript,
  installScript,
  nodeProblems,
  packageHeadless,
  unitFile,
  type Verify,
} from '../release-headless.ts';

let scratch = '';

function markerText(rootId: string): string {
  return JSON.stringify({
    version: 1,
    rootId,
    createdAt: new Date().toISOString(),
    state: 'active',
  });
}

function readJson(file: string): Record<string, unknown> {
  return z.record(z.string(), z.unknown()).parse(JSON.parse(readFileSync(file, 'utf8')));
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'release-headless-'));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const ARM64 = 183;
const X64 = 62;
const BUNDLE_VERSION = '3.4.5';

function fakeNode(machine: number, version: readonly [number, number]): string {
  const directory = join(scratch, `node-${String(machine)}-${version.join('.')}`);
  mkdirSync(join(directory, 'bin'), { recursive: true });
  mkdirSync(join(directory, 'include', 'node'), { recursive: true });
  const header = Buffer.alloc(64);
  header.writeUInt32BE(0x7f454c46, 0);
  header[5] = 1;
  header.writeUInt16LE(machine, 18);
  writeFileSync(join(directory, 'bin', 'node'), header);
  writeFileSync(
    join(directory, 'include', 'node', 'node_version.h'),
    `#define NODE_MAJOR_VERSION ${String(version[0])}\n#define NODE_MINOR_VERSION ${String(version[1])}\n`,
  );
  return directory;
}

function fakeService(): string {
  const directory = join(scratch, 'service');
  mkdirSync(directory);
  writeFileSync(join(directory, 'service.mjs'), 'export {};');
  writeFileSync(join(directory, 'version.json'), JSON.stringify({ version: BUNDLE_VERSION }));
  return directory;
}

interface InstallFixture {
  readonly home: string;
  readonly desktop: string;
  readonly installed: string;
  readonly data: string;
  readonly bootstrap: string;
  readonly unit: string;
  readonly install: (
    mode?: 'enable-fails' | 'other-hub' | 'wrong-unit',
    args?: readonly string[],
  ) => ReturnType<typeof spawnSync>;
}

function installFixture(): InstallFixture {
  const home = join(scratch, 'home');
  const bin = join(scratch, 'bin');
  const bundle = join(scratch, 'bundle');
  const desktop = join(home, '.local', 'opt', 'SmartEverything');
  const installed = join(home, '.local', 'opt', 'SmartEverything-Hub');
  const data = join(home, '.config', 'SmartEverything');
  const xdg = join(home, 'settings');
  const bootstrap = join(xdg, 'SmartEverything-Hub');
  const unit = join(xdg, 'systemd', 'user', 'smarteverything.service');
  const service = join(bundle, 'resources', 'service');
  const nodeBin = join(bundle, 'node', 'bin');
  for (const directory of [bin, desktop, data, join(service, 'go2rtc'), nodeBin])
    mkdirSync(directory, { recursive: true });
  writeFileSync(join(service, 'service.mjs'), 'export {};');
  writeFileSync(join(service, 'go2rtc', 'go2rtc'), 'camera engine');
  symlinkSync(process.execPath, join(nodeBin, 'node'));
  writeFileSync(join(bundle, 'install.sh'), installScript());
  writeFileSync(join(bundle, 'install-data.mjs'), installDataScript());
  writeFileSync(join(bundle, 'smarteverything.service'), unitFile());
  writeFileSync(
    join(bin, 'systemctl'),
    `#!/bin/sh
case "$2 $3" in
  'show --property=LoadState')
    if [ "$FIXTURE_MODE" = other-hub ]; then echo loaded; else echo not-found; fi
    exit ;;
  'show --property=FragmentPath')
    if [ "$FIXTURE_MODE" != wrong-unit ]; then echo "$XDG_CONFIG_HOME/systemd/user/smarteverything.service"; fi
    exit ;;
esac
printf '%s\\n' "$*" >>"$HOME/systemctl.log"
if [ "$2" = enable ] && [ "$FIXTURE_MODE" = enable-fails ]; then exit 57; fi
`,
    { mode: 0o755 },
  );
  const install: InstallFixture['install'] = (mode, args = []) =>
    spawnSync('sh', [join(bundle, 'install.sh'), ...args], {
      env: {
        HOME: home,
        PATH: `${bin}:/usr/bin:/bin`,
        XDG_CONFIG_HOME: xdg,
        FIXTURE_MODE: mode ?? '',
      },
    });
  return { home, desktop, installed, data, bootstrap, unit, install };
}

describe('the systemd unit', () => {
  it('starts the service bundle with the bundled Node, not with Electron', () => {
    const unit = unitFile();
    expect(unit).toContain(
      'ExecStart="%h/.local/opt/SmartEverything-Hub/node/bin/node" "%h/.local/opt/SmartEverything-Hub/resources/service/service.mjs"',
    );
    expect(unit).toContain('WorkingDirectory=%E/SmartEverything-Hub');
    expect(unit).not.toContain('SMARTEVERYTHING_DATA_DIRECTORY');
    expect(unit).not.toContain('EnvironmentFile');
    expect(unit).not.toContain('RequiresMountsFor');
    expect(unit).not.toContain('ELECTRON_RUN_AS_NODE');
    expect(unit).toContain('Restart=on-failure');
  });

  it('installs and starts only a standalone hub without replacing an existing desktop', () => {
    const { home, desktop, installed, data, bootstrap, unit, install } = installFixture();
    const canary = join(desktop, 'canary');
    writeFileSync(canary, 'desktop');
    const config = join(data, 'system', 'config', 'service.json');
    const pointer = join(bootstrap, 'location.json');
    const marker = join(data, 'layout.json');
    expect(install('enable-fails').status).toBe(57);
    expect([installed, config, unit, pointer, marker].some((file) => existsSync(file))).toBe(false);
    expect(install().status).toBe(0);
    expect(readFileSync(canary, 'utf8')).toBe('desktop');
    expect(readFileSync(unit, 'utf8')).toBe(unitFile());
    expect(readJson(config)).toStrictEqual({
      lan: { host: '0.0.0.0' },
      go2rtcBinary: join(installed, 'resources', 'go2rtc', 'go2rtc'),
    });
    expect(statSync(config).mode & 0o777).toBe(0o600);
    const rootId = readJson(marker).rootId;
    expect(readJson(marker)).toMatchObject({ version: 1, state: 'active' });
    expect(readJson(pointer)).toEqual({
      root: data,
      rootId,
      state: 'active',
    });
    const layout = dataLayoutOf(data);
    expect(layout.system.config.service).toBe(config);
    expect(layout.system.database.file).toBe(join(data, 'system', 'database', 'smarteverything.db'));
    expect(layout.backups.releases).toBe(join(data, 'backups', 'releases'));
    for (const directory of ['system/database', 'system/keys', 'system/run', 'tmp'])
      expect(statSync(join(data, directory)).isDirectory()).toBe(true);
    expect(existsSync(`${unit}.d`)).toBe(false);
    expect(install().status).toBe(1);
    expect(readFileSync(join(home, 'systemctl.log'), 'utf8')).toBe(
      '--user daemon-reload\n--user enable --now smarteverything.service\n--user disable --now smarteverything.service\n--user daemon-reload\n--user daemon-reload\n--user enable --now smarteverything.service\n',
    );
  });

  it('keeps the data in the default folder unless --data names another', () => {
    const { home, data, bootstrap, installed, unit, install } = installFixture();
    expect(install(undefined, ['--data', 'relative/folder']).status).toBe(1);
    expect(install(undefined, ['relative']).status).toBe(1);
    expect(existsSync(join(bootstrap, 'location.json'))).toBe(false);
    const chosen = join(home, 'disks', 'hub-data');
    expect(install(undefined, ['--data', chosen]).status).toBe(0);
    expect(readJson(join(bootstrap, 'location.json')).root).toBe(chosen);
    expect(existsSync(join(chosen, 'layout.json'))).toBe(true);
    expect(existsSync(join(chosen, 'system', 'config', 'service.json'))).toBe(true);
    expect(existsSync(join(data, 'layout.json'))).toBe(false);
    rmSync(installed, { recursive: true, force: true });
    rmSync(unit, { force: true });
    expect(install(undefined, ['--data', join(home, 'other')]).status).toBe(1);
    expect(existsSync(join(home, 'other'))).toBe(false);
  });

  it('refuses another data folder while this computer holds hub data in the default one', () => {
    const { data, bootstrap, install } = installFixture();
    writeFileSync(join(data, 'smarteverything.db'), 'hub data');
    expect(install(undefined, ['--data', join(data, '..', 'elsewhere')]).status).toBe(1);
    expect(existsSync(join(bootstrap, 'location.json'))).toBe(false);
  });

  it('points an existing pre-v1 folder at pending-v1 without creating layout v1', () => {
    const { data, bootstrap, install } = installFixture();
    writeFileSync(join(data, 'smarteverything.db'), 'hub data');
    expect(install().status).toBe(0);
    expect(readFileSync(join(data, 'smarteverything.db'), 'utf8')).toBe('hub data');
    expect(readJson(join(bootstrap, 'location.json'))).toMatchObject({
      root: data,
      state: 'pending-v1',
    });
    expect(existsSync(join(data, 'layout.json'))).toBe(false);
    expect(existsSync(join(data, 'system'))).toBe(false);
    expect(existsSync(join(data, 'service.json'))).toBe(true);
    const layout = dataLayoutOf(data);
    expect(layout.system.config.service).toBe(join(data, 'service.json'));
    expect(layout.system.database.file).toBe(join(data, 'smarteverything.db'));
    expect(layout.backups.releases).toBe(join(data, 'release-backups'));
  });

  it('refuses a folder that carries another rootId marker', () => {
    const { data, bootstrap, install } = installFixture();
    mkdirSync(bootstrap, { recursive: true });
    const same = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    writeFileSync(
      join(bootstrap, 'location.json'),
      JSON.stringify({ root: data, rootId: same, state: 'active' }),
    );
    writeFileSync(join(data, 'layout.json'), markerText(other));
    expect(install().status).toBe(1);
    expect(existsSync(join(data, 'system'))).toBe(false);
  });

  it('adopts the marker of a folder when no pointer exists yet', () => {
    const { data, bootstrap, install } = installFixture();
    const id = '33333333-3333-4333-8333-333333333333';
    writeFileSync(join(data, 'layout.json'), markerText(id));
    expect(install().status).toBe(0);
    expect(readJson(join(bootstrap, 'location.json')).rootId).toBe(id);
  });

  it('refuses to install while SMARTEVERYTHING_HUB_HOME overrides the bootstrap folder', () => {
    const { home, bootstrap, install } = installFixture();
    const bundle = join(scratch, 'bundle');
    const result = spawnSync('sh', [join(bundle, 'install.sh')], {
      env: {
        HOME: home,
        PATH: `${join(scratch, 'bin')}:/usr/bin:/bin`,
        SMARTEVERYTHING_HUB_HOME: '/mnt/config',
      },
    });
    expect(result.status).toBe(1);
    expect(existsSync(join(bootstrap, 'location.json'))).toBe(false);
    expect(install().status).toBe(0);
  });

  it('refuses a hub that systemd has already loaded from outside the install directory', () => {
    const { home, installed, unit, install } = installFixture();
    expect(install('other-hub').status).toBe(1);
    expect([installed, unit, join(home, 'systemctl.log')].some((file) => existsSync(file))).toBe(
      false,
    );
  });

  it('refuses an existing service.json that describes another role and leaves it untouched', () => {
    const { installed, data, unit, install } = installFixture();
    const config = join(data, 'system', 'config', 'service.json');
    mkdirSync(join(data, 'system', 'config'), { recursive: true });
    const saved = JSON.stringify({ role: 'node', go2rtcBinary: '/opt/go2rtc' });
    writeFileSync(config, saved, { mode: 0o600 });
    expect(install().status).toBe(1);
    expect([installed, unit].some((file) => existsSync(file))).toBe(false);
    expect(readFileSync(config, 'utf8')).toBe(saved);
  });

  it('keeps an existing hub config intact if systemd selects a different unit file', () => {
    const { home, installed, data, unit, install } = installFixture();
    const config = join(data, 'system', 'config', 'service.json');
    mkdirSync(join(data, 'system', 'config'), { recursive: true });
    const saved = JSON.stringify({
      role: 'hub',
      port: 7881,
      go2rtcBinary: join(installed, 'resources', 'go2rtc', 'go2rtc'),
    });
    writeFileSync(config, saved, { mode: 0o600 });
    expect(install('wrong-unit').status).toBe(1);
    expect([installed, unit].some((file) => existsSync(file))).toBe(false);
    expect(readFileSync(config, 'utf8')).toBe(saved);
    expect(readFileSync(join(home, 'systemctl.log'), 'utf8')).toBe(
      '--user daemon-reload\n--user daemon-reload\n',
    );
    expect(existsSync(join(data, 'layout.json'))).toBe(false);
    expect(install().status).toBe(0);
    expect(readFileSync(config, 'utf8')).toBe(saved);
  });
});

describe('the Node runtime', () => {
  it('accepts a Node of the right machine and a new enough version', () => {
    expect(nodeProblems(fakeNode(ARM64, [26, 0]), 'linux-arm64')).toEqual([]);
    expect(nodeProblems(fakeNode(X64, [26, 13]), 'linux-x64')).toEqual([]);
  });

  it('refuses a Node built for the other processor', () => {
    expect(nodeProblems(fakeNode(X64, [26, 0]), 'linux-arm64')).toEqual([
      expect.stringContaining('ELF machine 62, not linux-arm64'),
    ]);
  });

  it('refuses a Node older than the hub needs and a folder that has no Node', () => {
    expect(nodeProblems(fakeNode(ARM64, [24, 22]), 'linux-arm64')).toEqual([
      expect.stringContaining('older than the 26'),
    ]);
    expect(nodeProblems(join(scratch, 'nothing'), 'linux-arm64')).toEqual([
      expect.stringContaining('is missing'),
    ]);
  });
});

describe('packaging the headless hub', () => {
  it('names the installer after the service version and preserves the bundle layout', () => {
    const checked: string[] = [];
    const verify: Verify = (directory, target, options) => {
      checked.push(`${directory} ${target} ${String(options.binaries)}`);
    };
    const service = fakeService();
    const out = join(scratch, 'out');
    const directory = packageHeadless(
      { target: 'linux-arm64', service, node: fakeNode(ARM64, [26, 0]), out },
      verify,
    );
    expect(directory).toBe(join(out, `smarteverything-hub-${BUNDLE_VERSION}-linux-arm64`));
    expect(readFileSync(join(directory, 'resources', 'service', 'service.mjs'), 'utf8')).toBe(
      'export {};',
    );
    expect(readFileSync(join(directory, 'resources', 'service', 'version.json'), 'utf8')).toBe(
      JSON.stringify({ version: BUNDLE_VERSION }),
    );
    expect(statSync(join(directory, 'node', 'bin', 'node')).isFile()).toBe(true);
    expect(readFileSync(join(directory, 'smarteverything.service'), 'utf8')).toBe(unitFile());
    expect(readFileSync(join(directory, 'install-data.mjs'), 'utf8')).toBe(installDataScript());
    expect(statSync(join(directory, 'install.sh')).mode & 0o111).not.toBe(0);
    expect(checked).toEqual([`${service} linux-arm64 true`]);
  });

  it('rejects a service payload that also contains the desktop app or computer worker', () => {
    const service = fakeService();
    const out = join(scratch, 'out');
    const node = fakeNode(ARM64, [26, 0]);
    for (const file of ['app.asar', 'ear-process.mjs']) {
      writeFileSync(join(service, file), 'not a hub file');
      expect(() =>
        packageHeadless({ target: 'linux-arm64', service, node, out }, () => undefined),
      ).toThrow(file);
      expect(existsSync(out)).toBe(false);
      rmSync(join(service, file));
    }
  });

  it('copies nothing when the service version is invalid', () => {
    const out = join(scratch, 'out');
    const service = fakeService();
    const node = fakeNode(ARM64, [26, 0]);
    writeFileSync(join(service, 'version.json'), '{"version":"not a release number"}');
    expect(() =>
      packageHeadless({ target: 'linux-arm64', service, node, out }, () => undefined),
    ).toThrow();
    expect(existsSync(out)).toBe(false);
  });

  it('copies nothing when the Node does not fit the target', () => {
    const out = join(scratch, 'out');
    expect(() =>
      packageHeadless(
        {
          target: 'linux-arm64',
          service: fakeService(),
          node: fakeNode(X64, [26, 0]),
          out,
        },
        () => undefined,
      ),
    ).toThrow(HeadlessPackageError);
    expect(() => statSync(out)).toThrow();
  });

  it('copies nothing when the service bundle does not fit the target', () => {
    const out = join(scratch, 'out');
    const refuse: Verify = () => {
      throw new Error('bundle holds x64 addons');
    };
    expect(() =>
      packageHeadless(
        {
          target: 'linux-arm64',
          service: fakeService(),
          node: fakeNode(ARM64, [26, 0]),
          out,
        },
        refuse,
      ),
    ).toThrow('bundle holds x64 addons');
    expect(() => statSync(out)).toThrow();
  });
});
