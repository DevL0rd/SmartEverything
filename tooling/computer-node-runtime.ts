import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { computerNodeExecutable } from '../apps/desktop/src/package-layout.ts';

export const COMPUTER_NODE_VERSION = '26.13.0';
const RELEASE = `https://nodejs.org/download/release/v${COMPUTER_NODE_VERSION}`;
const CHECKSUMS = {
  'linux-x64': '5848553868b402d3fabb5b09270649977780a390f832155721025a08b5104455',
  'linux-arm64': '439e9c438acdf6a6ffe47418da709153d66c4bed812e30a473faacb107dd2791',
  'darwin-x64': '525c9b29bb0263d687de60a4cec0e2a6db876a8eb032369e5795eca71e7c358e',
  'darwin-arm64': 'd38bd5e5a2ddce6bbb5ce45e46e208337da4d51fffe611e567fd32073d6439f6',
  'win32-x64': 'dcc60d59a0746999f99064a01c020445d54d84228c691cdbf25b49ac3b59150a',
  'win32-arm64': 'a9427139595156ef484e1fb08957676e09d4232368dd1743a2a9f93f3d241b14',
} as const;

export class ComputerNodeRuntimeError extends Error {
  override readonly name = 'ComputerNodeRuntimeError';
}

interface ComputerNodeTarget {
  readonly name: string;
  readonly archive: string;
  readonly checksum: string;
  readonly executable: string;
}

export function computerNodeTarget(platform: string, arch: string): ComputerNodeTarget {
  const target = `${platform}-${arch}`;
  const checksum = Object.entries(CHECKSUMS).find(([name]) => name === target)?.[1];
  if (checksum === undefined)
    throw new ComputerNodeRuntimeError(`No official Computer Node runtime for ${target}.`);
  const name = `node-v${COMPUTER_NODE_VERSION}-${platform === 'win32' ? 'win' : platform}-${arch}`;
  const archive = `${name}.${platform === 'win32' ? 'zip' : 'tar.gz'}`;
  return { name, archive, checksum, executable: computerNodeExecutable(platform) };
}

export function verifyComputerNodeArchive(file: string, checksum: string): void {
  const found = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (found !== checksum)
    throw new ComputerNodeRuntimeError(`Official Node archive checksum mismatch at ${file}.`);
}

async function downloadArchive(file: string, archive: string, checksum: string): Promise<void> {
  const response = await fetch(`${RELEASE}/${archive}`);
  if (!response.ok)
    throw new ComputerNodeRuntimeError(`Node download returned HTTP ${String(response.status)}.`);
  const staged = `${file}.${randomUUID()}.partial`;
  try {
    await writeFile(staged, Buffer.from(await response.arrayBuffer()));
    verifyComputerNodeArchive(staged, checksum);
    renameSync(staged, file);
  } finally {
    rmSync(staged, { force: true });
  }
}

function unpackNode(file: string, name: string, destination: string, platform: string): void {
  const entries = [`${name}/${platform === 'win32' ? 'node.exe' : 'bin/node'}`, `${name}/LICENSE`];
  const command = platform === 'win32' && process.platform !== 'win32' ? 'unzip' : 'tar';
  const args =
    command === 'unzip'
      ? ['-q', file, ...entries, '-d', destination]
      : ['-xf', file, '-C', destination, ...entries];
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0)
    throw new ComputerNodeRuntimeError(`Unpacking official Node failed: ${result.stderr}`);
}

function verifyNativeNode(executable: string, platform: string, arch: string): void {
  if (platform !== process.platform || arch !== process.arch) return;
  const expression =
    'process.stdout.write(JSON.stringify({ version:process.versions.node, platform:process.platform, arch:process.arch, electron:process.versions.electron ?? null }))';
  const result = spawnSync(executable, ['--eval', expression], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new ComputerNodeRuntimeError(`Packaged Node could not start: ${result.stderr}`);
  z.strictObject({
    version: z.literal(COMPUTER_NODE_VERSION),
    platform: z.literal(platform),
    arch: z.literal(arch),
    electron: z.null(),
  }).parse(JSON.parse(result.stdout));
}

export async function copyComputerNodeRuntime(
  stage: string,
  cache: string,
  platform: string,
  arch: string,
): Promise<void> {
  const target = computerNodeTarget(platform, arch);
  mkdirSync(cache, { recursive: true });
  const archive = join(cache, target.archive);
  if (!existsSync(archive)) await downloadArchive(archive, target.archive, target.checksum);
  verifyComputerNodeArchive(archive, target.checksum);
  const extracted = join(stage, 'node-extract');
  mkdirSync(extracted);
  try {
    unpackNode(archive, target.name, extracted, platform);
    const executable = join(stage, target.executable);
    mkdirSync(dirname(executable), { recursive: true });
    copyFileSync(
      join(extracted, target.name, platform === 'win32' ? 'node.exe' : 'bin/node'),
      executable,
    );
    chmodSync(executable, 0o755);
    copyFileSync(join(extracted, target.name, 'LICENSE'), join(stage, 'node', 'LICENSE'));
    verifyNativeNode(executable, platform, arch);
  } finally {
    rmSync(extracted, { recursive: true, force: true });
  }
}
