import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  MACHINE_UPDATE_FOLDER,
  MACHINE_UPDATE_MANIFEST,
  MACHINE_UPDATE_MANIFEST_FILE,
  type MachineUpdateArtifact,
  type MachineUpdateManifest,
} from '@smarteverything/domain';

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

export function releaseFileOf(argument: string): ReleaseFile {
  const match = /^([^:=]+):([^:=]+):([^:=]+)=(.+)$/u.exec(argument);
  const [, platform, arch, kind, path] = match ?? [];
  if (platform === undefined || arch === undefined || kind === undefined || path === undefined) {
    throw new ReleaseFileArgumentError(argument);
  }
  return { platform, arch, kind, path };
}

async function artifactOf(file: ReleaseFile): Promise<unknown> {
  const bytes = await readFile(file.path);
  return {
    platform: file.platform,
    arch: file.arch,
    kind: file.kind,
    file: basename(file.path),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
  } satisfies Record<keyof MachineUpdateArtifact, unknown>;
}

export async function publishMachineUpdate(
  dataDirectory: string,
  version: string,
  files: readonly ReleaseFile[],
): Promise<MachineUpdateManifest> {
  const manifest = MACHINE_UPDATE_MANIFEST.parse({
    version,
    artifacts: await Promise.all(files.map(artifactOf)),
  });
  const folder = join(dataDirectory, MACHINE_UPDATE_FOLDER);
  const next = `${folder}.next`;
  const previous = `${folder}.previous`;
  await rm(next, { recursive: true, force: true });
  await mkdir(next, { recursive: true });
  await Promise.all(files.map((file) => cp(file.path, join(next, basename(file.path)))));
  await writeFile(
    join(next, MACHINE_UPDATE_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await rm(previous, { recursive: true, force: true });
  await rename(folder, previous).catch((cause: unknown) => {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
    throw cause;
  });
  await rename(next, folder);
  return manifest;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      data: { type: 'string' },
      version: { type: 'string' },
      file: { type: 'string', multiple: true },
    },
  });
  if (values.data === undefined || values.version === undefined || values.file === undefined) {
    throw new ReleaseFileArgumentError('--data, --version and at least one --file');
  }
  const manifest = await publishMachineUpdate(
    values.data,
    values.version,
    values.file.map(releaseFileOf),
  );
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
