import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { env } from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { extractFile, uncache } from '@electron/asar';
import {
  MACHINE_UPDATE_ARTIFACT,
  MACHINE_UPDATE_MANIFEST,
  MACHINE_UPDATE_MANIFEST_FILE,
  MACHINE_UPDATE_NOTICE_FILE,
  MACHINE_UPDATE_VERSION,
  RELEASE_NOTES,
  type MachineUpdateArtifact,
  type MachineUpdateManifest,
} from '@smarteverything/domain';
import { z } from 'zod';

import { desktopPackageResources } from '../apps/desktop/src/package-layout.ts';
import { DESKTOP_VARIANTS } from '../apps/desktop/src/variant.ts';
import { applyBuildHost } from './build-host.ts';
import { dataRootOf } from './data-root.ts';
import { localHub, type LocalHubLayout } from './local-hub.ts';
import { dataLayoutOf } from './release-hub-files.ts';
import {
  publishUploaded,
  rollbackRelease,
  uploadArtifact,
  withdrawRelease,
  type PublisherTarget,
} from './machine-update-client.ts';

const SERVICE_RESOURCE = /(?:^|[/\\])resources[/\\](?:go2rtc|service)(?:[/\\]|$)/iu;
const ASAR_RESOURCE = 'app.asar';
const DESKTOP_PACKAGE_MANIFEST = z.object({ version: MACHINE_UPDATE_VERSION });

export interface ReleaseFile {
  readonly platform: string;
  readonly arch: string;
  readonly kind: string;
  readonly path: string;
}

export class ReleaseFileArgumentError extends Error {
  override readonly name = 'ReleaseFileArgumentError';

  constructor(received: string) {
    super(
      `--file must read platform:arch:kind=path, such as linux:x64:zip=out/app.zip; received ${received}`,
    );
  }
}

class ReleaseArgumentsError extends Error {
  override readonly name = 'ReleaseArgumentsError';

  constructor() {
    super(
      'Provide either --rollback, --withdraw, or --version, --notes and at least one --file. Add --data <hub data folder> when no data folder pointer exists. Use --notes=<text> if the notes start with a dash.',
    );
  }
}

class CombinedInstallerError extends Error {
  override readonly name = 'CombinedInstallerError';

  constructor(file: string, entry: string) {
    super(`Desktop installer ${file} contains the hub resource ${entry}.`);
  }
}

class DesktopPackageIncompleteError extends Error {
  override readonly name = 'DesktopPackageIncompleteError';

  constructor(file: string, entry: string, cause?: unknown) {
    super(`Desktop installer ${file} is missing ${entry}.`, { cause });
  }
}

class DesktopPackageVersionError extends Error {
  override readonly name = 'DesktopPackageVersionError';

  constructor(file: string, expected: string, received: string) {
    super(`Desktop installer ${file} embeds version ${received}; expected ${expected}.`);
  }
}

export function releaseFileOf(argument: string): ReleaseFile {
  const match = /^([^:=]+):([^:=]+):([^:=]+)=(.+)$/u.exec(argument);
  const [, platform, arch, kind, path] = match ?? [];
  if (platform === undefined || arch === undefined || kind === undefined || path === undefined) {
    throw new ReleaseFileArgumentError(argument);
  }
  return { platform, arch, kind, path };
}

interface ArchiveLayout {
  readonly root: string | null;
  readonly executable: string;
  readonly resources: string;
}

function archiveLayout(file: ReleaseFile): ArchiveLayout {
  const { productName, executableName } = DESKTOP_VARIANTS.release;
  if (file.platform === 'linux') {
    const root = `${productName}-linux-${file.arch}`;
    return { root, executable: `${root}/${executableName}`, resources: `${root}/resources` };
  }
  if (file.platform === 'darwin') {
    const root = `${productName}.app`;
    return {
      root,
      executable: `${root}/Contents/MacOS/${executableName}`,
      resources: `${root}/Contents/Resources`,
    };
  }
  if (file.platform === 'win32') {
    return {
      root: null,
      executable: `lib/net45/${executableName}.exe`,
      resources: 'lib/net45/resources',
    };
  }
  throw new ReleaseFileArgumentError(`unsupported archive platform ${file.platform}`);
}

function validEntry(entry: string, root: string | null): boolean {
  const parts = entry.replace(/\/$/u, '').split('/');
  if (entry.includes('\\') || parts.some((part) => part === '' || part === '.' || part === '..')) {
    return false;
  }
  return root === null || (entry !== root && (parts[0] === root || parts[0] === '__MACOSX'));
}

function exitCode(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once('close', resolve);
    child.once('error', reject);
  });
}

async function archiveContents(
  input: Readable,
  root: string | null,
  caseInsensitive: boolean,
): Promise<{
  readonly files: ReadonlySet<string>;
  readonly forbidden: string | undefined;
  readonly invalid: string | undefined;
}> {
  const paths = new Set<string>();
  const files = new Set<string>();
  let forbidden: string | undefined;
  let invalid: string | undefined;
  const lines = createInterface({ input });
  for await (const entry of lines) {
    if (forbidden === undefined && SERVICE_RESOURCE.test(entry)) forbidden = entry;
    const name = entry.replace(/\/$/u, '');
    const path = caseInsensitive ? name.toLowerCase() : name;
    if (invalid === undefined && (!validEntry(entry, root) || paths.has(path))) invalid = entry;
    paths.add(path);
    if (!entry.endsWith('/')) files.add(entry);
  }
  return { files, forbidden, invalid };
}

async function archiveApp(file: ReleaseFile): Promise<string> {
  const layout = archiveLayout(file);
  const archive = spawn('unzip', ['-Z1', file.path], { stdio: ['ignore', 'pipe', 'ignore'] });
  const [code, { files, forbidden, invalid }] = await Promise.all([
    exitCode(archive),
    archiveContents(archive.stdout, layout.root, file.platform !== 'linux'),
  ]);
  if (code !== 0) throw new DesktopPackageIncompleteError(file.path, 'a readable ZIP inventory');
  if (forbidden !== undefined) throw new CombinedInstallerError(file.path, forbidden);
  if (invalid !== undefined) {
    throw new DesktopPackageIncompleteError(file.path, `a canonical layout at ${invalid}`);
  }
  const required = [
    layout.executable,
    ...desktopPackageResources(file.platform).map((resource) => `${layout.resources}/${resource}`),
  ];
  for (const entry of required) {
    if (!files.has(entry)) throw new DesktopPackageIncompleteError(file.path, entry);
  }
  const test = spawn('unzip', ['-tqq', file.path], { stdio: 'ignore' });
  if ((await exitCode(test)) !== 0) {
    throw new DesktopPackageIncompleteError(file.path, 'valid ZIP member checksums');
  }
  return `${layout.resources}/${ASAR_RESOURCE}`;
}

async function extractApplication(archive: string, entry: string, target: string): Promise<void> {
  const literal = entry.replaceAll('[', '[[]').replaceAll('*', '[*]').replaceAll('?', '[?]');
  const unpack = spawn('unzip', ['-p', archive, literal], { stdio: ['ignore', 'pipe', 'ignore'] });
  const [code] = await Promise.all([
    exitCode(unpack),
    pipeline(unpack.stdout, createWriteStream(target)),
  ]);
  if (code !== 0) throw new DesktopPackageIncompleteError(archive, 'a readable resources/app.asar');
}

async function packagedVersion(archive: string, entry: string): Promise<string> {
  const scratch = await mkdtemp(join(tmpdir(), 'desktop-package-version-'));
  const asar = join(scratch, ASAR_RESOURCE);
  try {
    await extractApplication(archive, entry, asar);
    const manifest: unknown = JSON.parse(extractFile(asar, 'package.json', false).toString('utf8'));
    return DESKTOP_PACKAGE_MANIFEST.parse(manifest).version;
  } catch (cause: unknown) {
    throw new DesktopPackageIncompleteError(
      archive,
      'a valid packaged package.json version',
      cause,
    );
  } finally {
    uncache(asar);
    await rm(scratch, { recursive: true, force: true });
  }
}

async function artifactOf(file: ReleaseFile, version: string): Promise<MachineUpdateArtifact> {
  if (file.kind === 'zip' || file.kind === 'nupkg') {
    const embedded = await packagedVersion(file.path, await archiveApp(file));
    if (embedded !== version) throw new DesktopPackageVersionError(file.path, version, embedded);
  }
  const hash = createHash('sha256');
  await pipeline(createReadStream(file.path), hash);
  return MACHINE_UPDATE_ARTIFACT.parse({
    platform: file.platform,
    arch: file.arch,
    kind: file.kind,
    file: basename(file.path),
    sha256: hash.digest('hex'),
    size: (await stat(file.path)).size,
  });
}

export async function publishMachineUpdate(
  target: PublisherTarget,
  version: string,
  files: readonly ReleaseFile[],
  metadata: { readonly notes: string; readonly runtimeVersion?: string | undefined },
): Promise<MachineUpdateManifest> {
  MACHINE_UPDATE_VERSION.parse(version);
  const notes = RELEASE_NOTES.parse(metadata.notes);
  const prepared: { readonly artifact: MachineUpdateArtifact; readonly path: string }[] = [];
  for (const file of files) {
    const name = basename(file.path);
    if (name === MACHINE_UPDATE_MANIFEST_FILE || name === MACHINE_UPDATE_NOTICE_FILE) {
      throw new ReleaseFileArgumentError(`the reserved artifact name ${name}`);
    }
    prepared.push({ artifact: await artifactOf(file, version), path: file.path });
  }
  const manifest = MACHINE_UPDATE_MANIFEST.parse({
    version,
    artifacts: prepared.map(({ artifact }) => artifact),
    notes,
  });
  for (const { artifact, path } of prepared) await uploadArtifact(target, artifact, path);
  return publishUploaded(target, manifest, metadata.runtimeVersion);
}

export async function publishLocalDesktop(
  layout: LocalHubLayout,
  version: string,
  files: readonly ReleaseFile[],
  metadata: { readonly notes: string; readonly runtimeVersion?: string | undefined },
): Promise<MachineUpdateManifest> {
  return publishMachineUpdate(await localHub(layout), version, files, metadata);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      data: { type: 'string' },
      version: { type: 'string' },
      file: { type: 'string', multiple: true },
      notes: { type: 'string' },
      'web-runtime': { type: 'string' },
      rollback: { type: 'boolean' },
      withdraw: { type: 'boolean' },
    },
  });
  const layout = dataLayoutOf(await dataRootOf(values.data, env));
  applyBuildHost(layout, join(import.meta.dirname, '..'));
  if (values.withdraw === true) {
    await withdrawRelease(await localHub(layout));
    return;
  }
  if (values.rollback === true) {
    report(await rollbackRelease(await localHub(layout)));
    return;
  }
  if (values.version === undefined || values.file === undefined || values.notes === undefined) {
    throw new ReleaseArgumentsError();
  }
  report(
    await publishLocalDesktop(layout, values.version, values.file.map(releaseFileOf), {
      notes: values.notes,
      runtimeVersion: values['web-runtime'],
    }),
  );
}

function report(manifest: MachineUpdateManifest): void {
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
