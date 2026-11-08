import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';

const run = promisify(execFile);
const log = new Logger('tool.drive-mount');

const HERE = import.meta.dirname;
const OUT = join(HERE, 'out');
const GO_FLAGS = '-trimpath -buildvcs=false -mod=readonly -modcacherw';
const LD_FLAGS = '-s -w -buildid=';

export const DRIVE_MOUNT_RESOURCE_DIRECTORY = 'drive-mount';
export const DRIVE_MOUNT_SHIPPED_NAME = 'se-drive-mount';
export const DRIVE_MOUNT_LICENSE_FILE = 'LICENSE.go-fuse.txt';

const PIN = z.object({
  go: z.string().regex(/^\d+\.\d+\.\d+$/),
  fuse: z.object({
    module: z.literal('github.com/hanwen/go-fuse/v2'),
    version: z.string().regex(/^v\d+\.\d+\.\d+$/),
    licence: z.literal('BSD-3-Clause'),
  }),
});

type Pin = z.infer<typeof PIN>;

const HOST = z.record(z.string(), z.string());

const TARGETS = [
  { os: 'linux', arch: 'amd64' },
  { os: 'linux', arch: 'arm64' },
] as const;

type Target = (typeof TARGETS)[number];

const NODE_ARCH: Readonly<Record<string, Target['arch']>> = { x64: 'amd64', arm64: 'arm64' };

interface Binary {
  readonly file: string;
  readonly arch: Target['arch'];
  readonly bytes: number;
  readonly sha256: string;
}

export class DriveMountTargetError extends Error {
  override readonly name = 'DriveMountTargetError';

  constructor(received: string) {
    super(
      `The drive mount helper is built for ${TARGETS.map((target) => `${target.os}-${target.arch}`).join(', ')}; received a package for ${received}`,
    );
  }
}

class ToolchainMismatchError extends Error {
  override readonly name = 'ToolchainMismatchError';

  constructor(expected: string, received: string) {
    super(`The Go toolchain reports "${received}"; pin.json expects ${expected}.`);
  }
}

class ModuleMismatchError extends Error {
  override readonly name = 'ModuleMismatchError';

  constructor(file: string, expected: string) {
    super(`${file} does not hold ${expected}; pin.json expects it.`);
  }
}

class BuildSettingsError extends Error {
  override readonly name = 'BuildSettingsError';

  constructor(file: string, missing: string) {
    super(`${file} was not built with ${missing}.`);
  }
}

export function driveMountBuildName(platform: string, arch: string): string {
  const target = TARGETS.find(
    (candidate) => platform === candidate.os && NODE_ARCH[arch] === candidate.arch,
  );
  if (target === undefined) {
    throw new DriveMountTargetError(`${platform}/${arch}`);
  }
  return `${DRIVE_MOUNT_SHIPPED_NAME}-${target.os}-${target.arch}`;
}

export async function stageDriveMount(
  builds: string,
  stage: string,
  platform: string,
  arch: string,
): Promise<void> {
  const source = join(builds, driveMountBuildName(platform, arch));
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  const binary = join(stage, DRIVE_MOUNT_SHIPPED_NAME);
  await copyFile(source, binary);
  await chmod(binary, 0o755);
  await copyFile(join(builds, DRIVE_MOUNT_LICENSE_FILE), join(stage, DRIVE_MOUNT_LICENSE_FILE));
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readPin(): Promise<Pin> {
  const raw: unknown = JSON.parse(await readFile(join(HERE, 'pin.json'), 'utf8'));
  return PIN.parse(raw);
}

async function checkModule(pin: Pin): Promise<void> {
  const required = `${pin.fuse.module} ${pin.fuse.version}`;
  const goMod = await readFile(join(HERE, 'go.mod'), 'utf8');
  if (!goMod.includes(`go ${pin.go}\n`) || !goMod.includes(required)) {
    throw new ModuleMismatchError('go.mod', `go ${pin.go} and ${required}`);
  }
  const goSum = await readFile(join(HERE, 'go.sum'), 'utf8');
  if (!goSum.includes(`${required} h1:`) || !goSum.includes(`${required}/go.mod h1:`)) {
    throw new ModuleMismatchError('go.sum', `the hashes of ${required}`);
  }
}

function goEnvironment(work: string, pin: Pin, target: Target | null): Record<string, string> {
  return {
    ...HOST.parse(Object.fromEntries(Object.entries(env))),
    GOENV: 'off',
    GOTOOLCHAIN: `go${pin.go}`,
    GOPATH: join(work, 'gopath'),
    GOMODCACHE: join(work, 'gomod'),
    GOCACHE: join(work, 'gocache'),
    GOFLAGS: GO_FLAGS,
    GOPROXY: 'https://proxy.golang.org,direct',
    GOSUMDB: 'sum.golang.org',
    GOPRIVATE: '',
    GONOPROXY: '',
    GONOSUMDB: '',
    GOINSECURE: '',
    GOEXPERIMENT: '',
    CGO_ENABLED: '0',
    GOAMD64: 'v1',
    GOARM64: 'v8.0',
    ...(target === null ? {} : { GOOS: target.os, GOARCH: target.arch }),
  };
}

async function checkToolchain(pin: Pin, work: string): Promise<string> {
  const { stdout } = await run('go', ['version'], {
    cwd: HERE,
    env: goEnvironment(work, pin, null),
  });
  const reported = stdout.trim();
  if (!reported.startsWith(`go version go${pin.go} `)) {
    throw new ToolchainMismatchError(`go${pin.go}`, reported);
  }
  return reported;
}

async function checkBuildSettings(pin: Pin, work: string, file: string): Promise<void> {
  const { stdout } = await run('go', ['version', '-m', file], {
    env: goEnvironment(work, pin, null),
  });
  for (const setting of ['CGO_ENABLED=0', '-trimpath=true']) {
    if (!stdout.includes(setting)) {
      throw new BuildSettingsError(file, setting);
    }
  }
}

async function build(pin: Pin, work: string, target: Target): Promise<Binary> {
  const file = `${DRIVE_MOUNT_SHIPPED_NAME}-${target.os}-${target.arch}`;
  const output = join(OUT, file);
  await run('go', ['build', `-ldflags=${LD_FLAGS}`, '-o', output, '.'], {
    cwd: HERE,
    env: goEnvironment(work, pin, target),
    maxBuffer: 16 * 1024 * 1024,
  });
  await checkBuildSettings(pin, work, output);
  const bytes = await readFile(output);
  log.info('drive_mount.built', { file, bytes: bytes.byteLength });
  return { file, arch: target.arch, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

async function writeManifest(
  pin: Pin,
  toolchain: string,
  binaries: readonly Binary[],
): Promise<void> {
  const sums = binaries.map((binary) => `${binary.sha256}  ${binary.file}\n`).join('');
  await writeFile(join(OUT, 'SHA256SUMS'), sums);
  const manifest = {
    goFuse: pin.fuse.version,
    toolchain,
    goFlags: GO_FLAGS,
    ldFlags: LD_FLAGS,
    binaries,
  };
  await writeFile(join(OUT, 'build.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await copyFile(join(HERE, 'LICENSE'), join(OUT, DRIVE_MOUNT_LICENSE_FILE));
}

export async function inTempRoot<T>(
  work: (root: string) => Promise<T>,
  release: (root: string) => Promise<unknown>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'drive-mount-build-'));
  try {
    return await work(root);
  } finally {
    await release(root).catch((cause: unknown) => {
      log.warn('drive_mount.release_failed', { cause: String(cause) });
    });
    await rm(root, { recursive: true, force: true });
  }
}

function releaseModules(pin: Pin): (root: string) => Promise<unknown> {
  return (root) =>
    run('go', ['clean', '-modcache'], {
      env: { ...goEnvironment(root, pin, null), GOTOOLCHAIN: 'local' },
    });
}

async function buildAll(pin: Pin, root: string): Promise<void> {
  await checkModule(pin);
  const toolchain = await checkToolchain(pin, root);
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT);
  const binaries: Binary[] = [];
  for (const target of TARGETS) {
    binaries.push(await build(pin, root, target));
  }
  await writeManifest(pin, toolchain, binaries);
  log.info('drive_mount.build_finished', { out: OUT, binaries: binaries.length });
}

if (import.meta.main) {
  readPin()
    .then((pin) => inTempRoot((root) => buildAll(pin, root), releaseModules(pin)))
    .catch((cause: unknown) => {
      log.error('drive_mount.build_failed', cause);
      process.exitCode = 1;
    });
}
