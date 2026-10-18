import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HeadlessPackageError,
  installScript,
  nodeProblems,
  packageHeadless,
  unitFile,
  type Verify,
} from '../release-headless.ts';

let scratch = '';

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'release-headless-'));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const ARM64 = 183;
const X64 = 62;

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
  return directory;
}

describe('the systemd unit', () => {
  it('starts the service bundle with the bundled Node, not with Electron', () => {
    const unit = unitFile();
    expect(unit).toContain(
      'ExecStart="%h/.local/opt/SmartEverything/node/bin/node" "%h/.local/opt/SmartEverything/resources/service/service.mjs"',
    );
    expect(unit).toContain(
      'Environment="SMARTEVERYTHING_DATA_DIRECTORY=%h/.config/SmartEverything"',
    );
    expect(unit).not.toContain('ELECTRON_RUN_AS_NODE');
    expect(unit).toContain('Restart=on-failure');
  });

  it('installs into the layout the hub release script already uses', () => {
    const script = installScript();
    expect(script).toContain('resources/service');
    expect(script).toContain('systemctl --user enable --now smarteverything.service');
    expect(script).toContain('loginctl enable-linger');
  });
});

describe('the Node runtime', () => {
  it('accepts a Node of the right machine and a new enough version', () => {
    expect(nodeProblems(fakeNode(ARM64, [24, 2]), 'linux-arm64')).toEqual([]);
    expect(nodeProblems(fakeNode(X64, [26, 0]), 'linux-x64')).toEqual([]);
  });

  it('refuses a Node built for the other processor', () => {
    expect(nodeProblems(fakeNode(X64, [24, 2]), 'linux-arm64')).toEqual([
      expect.stringContaining('ELF machine 62, not linux-arm64'),
    ]);
  });

  it('refuses a Node older than the hub needs and a folder that has no Node', () => {
    expect(nodeProblems(fakeNode(ARM64, [24, 1]), 'linux-arm64')).toEqual([
      expect.stringContaining('older than the 24.2'),
    ]);
    expect(nodeProblems(join(scratch, 'nothing'), 'linux-arm64')).toEqual([
      expect.stringContaining('is missing'),
    ]);
  });
});

describe('packaging the headless hub', () => {
  it('lays out the service, the runtime, the unit and an executable installer', () => {
    const checked: string[] = [];
    const verify: Verify = (directory, target, options) => {
      checked.push(`${directory} ${target} ${String(options.binaries)}`);
    };
    const service = fakeService();
    const out = join(scratch, 'out');
    const directory = packageHeadless(
      { target: 'linux-arm64', service, node: fakeNode(ARM64, [24, 2]), version: '0.1.0', out },
      verify,
    );
    expect(directory).toBe(join(out, 'smarteverything-hub-0.1.0-linux-arm64'));
    expect(readFileSync(join(directory, 'resources', 'service', 'service.mjs'), 'utf8')).toBe(
      'export {};',
    );
    expect(statSync(join(directory, 'node', 'bin', 'node')).isFile()).toBe(true);
    expect(readFileSync(join(directory, 'smarteverything.service'), 'utf8')).toBe(unitFile());
    expect(statSync(join(directory, 'install.sh')).mode & 0o111).not.toBe(0);
    expect(checked).toEqual([`${service} linux-arm64 true`]);
  });

  it('copies nothing when the Node does not fit the target', () => {
    const out = join(scratch, 'out');
    expect(() =>
      packageHeadless(
        {
          target: 'linux-arm64',
          service: fakeService(),
          node: fakeNode(X64, [24, 2]),
          version: '0.1.0',
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
          node: fakeNode(ARM64, [24, 2]),
          version: '0.1.0',
          out,
        },
        refuse,
      ),
    ).toThrow('bundle holds x64 addons');
    expect(() => statSync(out)).toThrow();
  });
});
