import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { ffmpegPath } from '../../media/ffmpeg-path';
import { progressOf } from '../pipeline/playable';

export class FfmpegFailedError extends Error {
  override readonly name = 'FfmpegFailedError';

  constructor(
    readonly code: number | null,
    readonly stderr: string,
  ) {
    super(`ffmpeg exited with ${String(code)}`);
  }
}

export function runFfmpeg(
  args: readonly string[],
  seconds: number,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), [...args], { signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      errors += chunk;
    });
    createInterface({ input: child.stdout }).on('line', (line) => {
      const fraction = progressOf(line, seconds);
      if (fraction !== undefined) onProgress(fraction);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new FfmpegFailedError(code, errors.trim()));
    });
  });
}
