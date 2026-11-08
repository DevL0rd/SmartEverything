import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ASSISTANT_LEVEL_MAX, ASSISTANT_LEVEL_WINDOW_MS } from '@smarteverything/domain';
import { ffmpegPath } from './ffmpeg-path';

const SAMPLE_RATE = 8000;
const BYTES_PER_SAMPLE = 2;
const WINDOW_SAMPLES = (SAMPLE_RATE * ASSISTANT_LEVEL_WINDOW_MS) / 1000;
const FULL_SCALE = 32768;

export class LevelPeaks {
  private readonly levels: number[] = [];
  private carry: Buffer = Buffer.alloc(0);
  private peak = 0;
  private filled = 0;

  push(chunk: Buffer): void {
    const data = this.carry.length === 0 ? chunk : Buffer.concat([this.carry, chunk]);
    const usable = data.length - (data.length % BYTES_PER_SAMPLE);
    for (let offset = 0; offset < usable; offset += BYTES_PER_SAMPLE) {
      this.peak = Math.max(this.peak, Math.abs(data.readInt16LE(offset)));
      this.filled += 1;
      if (this.filled === WINDOW_SAMPLES) this.close();
    }
    this.carry = data.subarray(usable);
  }

  finish(): number[] {
    if (this.filled > 0) this.close();
    return this.levels;
  }

  private close(): void {
    this.levels.push(
      Math.min(ASSISTANT_LEVEL_MAX, Math.round((this.peak / FULL_SCALE) * ASSISTANT_LEVEL_MAX)),
    );
    this.peak = 0;
    this.filled = 0;
  }
}

function decode(source: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const peaks = new LevelPeaks();
    const child = spawn(
      ffmpegPath(),
      [
        '-v',
        'error',
        '-i',
        source,
        '-vn',
        '-ac',
        '1',
        '-ar',
        String(SAMPLE_RATE),
        '-f',
        's16le',
        '-',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const errors: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => {
      peaks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(peaks.finish());
      else
        reject(
          new Error(
            `ffmpeg exited with ${String(code)}: ${Buffer.concat(errors).toString('utf8').trim()}`,
          ),
        );
    });
  });
}

export async function audioLevels(data: Buffer): Promise<number[]> {
  const directory = await mkdtemp(join(tmpdir(), 'smarteverything-levels-'));
  try {
    const source = join(directory, 'source');
    await writeFile(source, data);
    return await decode(source);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
