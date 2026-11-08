import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { z } from 'zod';

const RUNTIME_LENGTH = 32;
const MANIFEST = z.object({ devDependencies: z.object({ electron: z.string().min(1) }) });

async function electronVersion(desktopDirectory: string): Promise<string> {
  const manifest = MANIFEST.parse(
    JSON.parse(await readFile(path.join(desktopDirectory, 'package.json'), 'utf8')),
  );
  return manifest.devDependencies.electron;
}

async function bundledPreload(desktopDirectory: string): Promise<Uint8Array> {
  const result = await build({
    entryPoints: [path.join('src', 'preload.ts')],
    absWorkingDir: desktopDirectory,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    external: ['electron'],
    outfile: path.join('dist', 'src', 'preload.cjs'),
    write: false,
    logLevel: 'silent',
  });
  const [output] = result.outputFiles;
  if (output === undefined || result.outputFiles.length !== 1) {
    throw new Error(
      `The preload build must produce exactly one file; received ${String(result.outputFiles.length)}`,
    );
  }
  return output.contents;
}

export async function desktopWebRuntime(desktopDirectory: string): Promise<string> {
  const parts: readonly (readonly [string, Uint8Array | string])[] = [
    ['electron', await electronVersion(desktopDirectory)],
    ['preload', await bundledPreload(desktopDirectory)],
    ['ipc', await readFile(path.join(desktopDirectory, 'src', 'ipc.ts'))],
    ['csp', await readFile(path.join(desktopDirectory, 'src', 'csp.ts'))],
  ];
  const hash = createHash('sha256');
  for (const [name, content] of parts) {
    const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    hash.update(`${name}:${String(bytes.byteLength)}\n`);
    hash.update(bytes);
  }
  return hash.digest('hex').slice(0, RUNTIME_LENGTH);
}
