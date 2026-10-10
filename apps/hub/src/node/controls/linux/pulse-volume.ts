import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import type { RunProgram } from '../../run-program';

const RESTART_MS = 5000;
const SINK = '@DEFAULT_SINK@';
const PERCENT = /(\d+)%/;
const RELEVANT = /on (sink|server) /;

export interface VolumeReading {
  readonly volume: number;
  readonly muted: boolean;
}

export interface PulseVolumeOptions {
  readonly run: RunProgram;
  readonly changed: (reading: VolumeReading) => void;
  readonly failed: (cause: unknown) => void;
}

export function parseVolume(volume: string, mute: string): VolumeReading {
  const percent = PERCENT.exec(volume)?.[1];
  if (percent === undefined) {
    throw new Error(`pactl reported no volume: ${volume.trim()}`);
  }
  return { volume: Number(percent), muted: /Mute:\s*yes/.test(mute) };
}

export class PulseVolume {
  private child: ChildProcessByStdio<null, Readable, null> | null = null;
  private reading = false;
  private again = false;
  private restart: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(private readonly options: PulseVolumeOptions) {}

  start(): void {
    this.stopped = false;
    const child = spawn('pactl', ['subscribe'], { stdio: ['ignore', 'pipe', 'ignore'] });
    this.child = child;
    createInterface({ input: child.stdout }).on('line', (line) => {
      if (RELEVANT.test(line)) {
        this.read();
      }
    });
    child.once('error', this.options.failed);
    child.once('exit', () => {
      this.child = null;
      if (!this.stopped) {
        this.restart = setTimeout(() => {
          this.start();
        }, RESTART_MS);
      }
    });
    this.read();
  }

  stop(): void {
    this.stopped = true;
    if (this.restart !== null) {
      clearTimeout(this.restart);
      this.restart = null;
    }
    this.child?.kill();
    this.child = null;
  }

  async setVolume(level: number): Promise<void> {
    await this.options.run('pactl', ['set-sink-volume', SINK, `${String(Math.round(level))}%`]);
  }

  async setMuted(muted: boolean): Promise<void> {
    await this.options.run('pactl', ['set-sink-mute', SINK, muted ? '1' : '0']);
  }

  private read(): void {
    if (this.reading) {
      this.again = true;
      return;
    }
    this.reading = true;
    Promise.all([
      this.options.run('pactl', ['get-sink-volume', SINK]),
      this.options.run('pactl', ['get-sink-mute', SINK]),
    ])
      .then(([volume, mute]) => {
        this.options.changed(parseVolume(volume, mute));
      }, this.options.failed)
      .finally(() => {
        this.reading = false;
        if (this.again) {
          this.again = false;
          this.read();
        }
      });
  }
}
