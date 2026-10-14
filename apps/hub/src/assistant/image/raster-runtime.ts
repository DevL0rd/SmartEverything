import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execPath, versions, platform, arch } from 'node:process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ImageOperationError } from './errors';

export const RASTER_WORKER = fileURLToPath(new URL('./raster-worker.mjs', import.meta.url));
const RUNTIME_DESCRIPTOR = z.strictObject({
  platform: z.literal(platform),
  arch: z.literal(arch),
  node: z.literal(platform === 'win32' ? 'node.exe' : 'node'),
  coreDumpDisabled: z.literal(true),
});
function rasterExecutable(): string {
  const directory = join(dirname(RASTER_WORKER), 'raster-runtime');
  const descriptor = join(directory, 'runtime.json');
  if (existsSync(descriptor)) {
    const runtime = RUNTIME_DESCRIPTOR.parse(JSON.parse(readFileSync(descriptor, 'utf8')));
    return join(directory, runtime.node);
  }
  if (platform !== 'linux')
    throw new ImageOperationError(
      'unknown',
      'Install a plain Node raster runtime with core dumps disabled for this platform.',
    );
  if (versions['electron'] === undefined) return execPath;
  return '/usr/bin/node';
}
export function rasterRuntime(): {
  readonly executable: string;
  readonly entry: string;
  readonly execArgv: readonly string[];
} {
  try {
    const executable = rasterExecutable();
    if (!existsSync(executable) || !existsSync(RASTER_WORKER))
      throw new ImageOperationError(
        'unknown',
        'The plain Node raster runtime or worker is missing.',
      );
    if (platform !== 'linux')
      return { executable, entry: RASTER_WORKER, execArgv: ['--max-old-space-size=256'] };
    const limiter = '/usr/bin/prlimit';
    if (!existsSync(limiter))
      throw new ImageOperationError(
        'unknown',
        'The Linux raster process requires /usr/bin/prlimit to disable core dumps.',
      );
    return {
      executable: limiter,
      entry: RASTER_WORKER,
      execArgv: ['--core=0', '--', executable, '--max-old-space-size=256'],
    };
  } catch (cause) {
    if (cause instanceof ImageOperationError) throw cause;
    throw new ImageOperationError(
      'unknown',
      'The packaged raster runtime descriptor is invalid for this platform.',
    );
  }
}
export function rasterRuntimeIssue(): string | null {
  try {
    rasterRuntime();
    return null;
  } catch (cause) {
    return cause instanceof ImageOperationError
      ? cause.detail
      : 'The image raster runtime is unavailable.';
  }
}
