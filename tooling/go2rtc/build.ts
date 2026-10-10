import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { arch, platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { hostEnvironment } from './environment';

const run = promisify(execFile);
const log = new Logger('tool.go2rtc');

const HERE = import.meta.dirname;
const OUT = join(HERE, 'out');
const GO_FLAGS = '-trimpath -buildvcs=false -mod=readonly -modcacherw';
const LD_FLAGS = '-s -w -buildid=';

const PIN = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  source: z.url(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  go: z.string().regex(/^\d+\.\d+\.\d+$/),
  patches: z.array(z.string().min(1)).min(1),
});

type Pin = z.infer<typeof PIN>;

const TARGETS = [
  { os: 'linux', arch: 'amd64' },
  { os: 'linux', arch: 'arm64' },
  { os: 'darwin', arch: 'amd64' },
  { os: 'darwin', arch: 'arm64' },
  { os: 'windows', arch: 'amd64' },
] as const;

type Target = (typeof TARGETS)[number];

interface Binary {
  readonly file: string;
  readonly os: Target['os'];
  readonly arch: Target['arch'];
  readonly bytes: number;
  readonly sha256: string;
}

interface Workspace {
  readonly root: string;
  readonly source: string;
}

class SourceMismatchError extends Error {
  override readonly name = 'SourceMismatchError';

  constructor(url: string, expected: string, received: string) {
    super(`${url} has SHA-256 ${received}; pin.json expects ${expected}. Refusing to build it.`);
  }
}

class DownloadError extends Error {
  override readonly name = 'DownloadError';

  constructor(url: string, status: number) {
    super(`Downloading ${url} failed with HTTP ${String(status)}.`);
  }
}

class ToolchainMismatchError extends Error {
  override readonly name = 'ToolchainMismatchError';

  constructor(expected: string, received: string) {
    super(`The Go toolchain reports "${received}"; pin.json expects ${expected}.`);
  }
}

class BinaryCheckError extends Error {
  override readonly name = 'BinaryCheckError';

  constructor(file: string, expected: string, received: string) {
    super(`${file} -version printed "${received}"; expected it to start with "${expected}".`);
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readPin(): Promise<Pin> {
  const raw: unknown = JSON.parse(await readFile(join(HERE, 'pin.json'), 'utf8'));
  return PIN.parse(raw);
}

function binaryName(target: Target): string {
  const suffix = target.os === 'windows' ? '.exe' : '';
  return `go2rtc-${target.os}-${target.arch}${suffix}`;
}

function goEnvironment(work: string, pin: Pin, target: Target | null): Record<string, string> {
  return {
    ...hostEnvironment(),
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

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new DownloadError(url, response.status);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function unpackSource(pin: Pin, root: string): Promise<string> {
  const archive = await download(pin.source);
  const received = sha256(archive);
  if (received !== pin.sha256) {
    throw new SourceMismatchError(pin.source, pin.sha256, received);
  }
  const tarball = join(root, 'source.tar.gz');
  const source = join(root, 'source');
  await writeFile(tarball, archive);
  await mkdir(source);
  await run('tar', ['-xzf', tarball, '-C', source, '--strip-components=1']);
  log.info('go2rtc.source_verified', { commit: pin.commit, sha256: received });
  return source;
}

async function applyPatches(pin: Pin, source: string): Promise<{ file: string; sha256: string }[]> {
  const applied: { file: string; sha256: string }[] = [];
  for (const file of pin.patches) {
    const path = join(HERE, file);
    await run('patch', ['-p1', '--forward', '--batch', '--input', path], { cwd: source });
    applied.push({ file, sha256: sha256(await readFile(path)) });
    log.info('go2rtc.patch_applied', { file });
  }
  return applied;
}

async function checkToolchain(pin: Pin, work: Workspace): Promise<string> {
  const { stdout } = await run('go', ['version'], {
    cwd: work.source,
    env: goEnvironment(work.root, pin, null),
  });
  const reported = stdout.trim();
  if (!reported.startsWith(`go version go${pin.go} `)) {
    throw new ToolchainMismatchError(`go${pin.go}`, reported);
  }
  return reported;
}

async function build(pin: Pin, work: Workspace, target: Target): Promise<Binary> {
  const file = binaryName(target);
  const output = join(OUT, file);
  await run('go', ['build', `-ldflags=${LD_FLAGS}`, '-o', output, '.'], {
    cwd: work.source,
    env: goEnvironment(work.root, pin, target),
    maxBuffer: 16 * 1024 * 1024,
  });
  const bytes = await readFile(output);
  log.info('go2rtc.built', { file, bytes: bytes.byteLength });
  return { file, os: target.os, arch: target.arch, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function hostTarget(): Target | undefined {
  const os = platform() === 'win32' ? 'windows' : platform();
  const cpu = arch() === 'x64' ? 'amd64' : arch();
  return TARGETS.find((target) => target.os === os && target.arch === cpu);
}

async function checkHostBinary(pin: Pin): Promise<void> {
  const target = hostTarget();
  if (target === undefined) {
    log.warn('go2rtc.host_check_skipped', { platform: platform(), arch: arch() });
    return;
  }
  const file = join(OUT, binaryName(target));
  const { stdout } = await run(file, ['-version']);
  const expected = `go2rtc version ${pin.version}`;
  if (!stdout.startsWith(expected)) {
    throw new BinaryCheckError(file, expected, stdout.trim());
  }
  log.info('go2rtc.host_binary_ran', { version: stdout.trim() });
}

async function writeManifest(
  pin: Pin,
  toolchain: string,
  patches: readonly { file: string; sha256: string }[],
  binaries: readonly Binary[],
): Promise<void> {
  const sums = binaries.map((binary) => `${binary.sha256}  ${binary.file}\n`).join('');
  await writeFile(join(OUT, 'SHA256SUMS'), sums);
  const manifest = {
    go2rtc: pin.version,
    commit: pin.commit,
    source: pin.source,
    sourceSha256: pin.sha256,
    patches,
    toolchain,
    goFlags: GO_FLAGS,
    ldFlags: LD_FLAGS,
    binaries,
  };
  await writeFile(join(OUT, 'build.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await copyFile(join(HERE, 'LICENSE'), join(OUT, 'LICENSE.go2rtc.txt'));
}

async function cleanUp(pin: Pin, root: string): Promise<void> {
  await run('go', ['clean', '-modcache'], {
    env: { ...goEnvironment(root, pin, null), GOTOOLCHAIN: 'local' },
  });
  await rm(root, { recursive: true, force: true });
}

async function main(): Promise<void> {
  const pin = await readPin();
  const root = await mkdtemp(join(tmpdir(), 'go2rtc-build-'));
  try {
    const work = { root, source: await unpackSource(pin, root) };
    const patches = await applyPatches(pin, work.source);
    const toolchain = await checkToolchain(pin, work);
    await rm(OUT, { recursive: true, force: true });
    await mkdir(OUT);
    const binaries: Binary[] = [];
    for (const target of TARGETS) {
      binaries.push(await build(pin, work, target));
    }
    await writeManifest(pin, toolchain, patches, binaries);
    await checkHostBinary(pin);
    log.info('go2rtc.build_finished', { out: OUT, binaries: binaries.length });
  } finally {
    await cleanUp(pin, root);
  }
}

main().catch((cause: unknown) => {
  log.error('go2rtc.build_failed', cause);
  process.exitCode = 1;
});
