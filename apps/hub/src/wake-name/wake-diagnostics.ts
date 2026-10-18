import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import { background } from '@smarteverything/logging';
import type { Clock } from '../clock';
import { watchRequest, type RequestWatch } from '../service/files';
import { wavOf } from '../transcripts/wav';
import type { KeywordSpotter } from './keyword-spotter';

export const CLIP_MS = 10_000;
export const WAKE_CLIP_REQUEST_FILE = 'wake-clip';
export const WAKE_DIAGNOSTICS_DIRECTORY = 'wake-diagnostics';

export type ClipReason = 'near_miss' | 'asked';

export interface WakeDiagnosticsOptions {
  readonly dataDirectory: string;
  readonly spotter: () => KeywordSpotter;
  readonly names: () => readonly string[];
  readonly transcribe: ((pcm16k: Int16Array) => Promise<string | null>) | null;
  readonly clock: Pick<Clock, 'now'>;
  readonly log: Logger;
}

export interface DiagnosedEar {
  readonly fields: Readonly<Record<string, string>>;
  readonly names: () => readonly string[];
  readonly recent: () => Int16Array;
}

function labelOf(fields: Readonly<Record<string, string>>): string {
  return Object.values(fields)
    .join('-')
    .replace(/[^A-Za-z0-9_-]+/g, '_');
}

export class WakeDiagnostics {
  private readonly ears = new Set<DiagnosedEar>();
  private watch: RequestWatch | null = null;
  private stopped = false;

  constructor(private readonly options: WakeDiagnosticsOptions) {}

  attach(ear: DiagnosedEar): () => void {
    this.ears.add(ear);
    return (): void => {
      this.ears.delete(ear);
    };
  }

  missed(ear: DiagnosedEar, extra: Readonly<Record<string, unknown>>): void {
    background(this.keep(ear, 'near_miss', extra), 'wake.diagnostic_failed');
  }

  async start(): Promise<void> {
    this.watch = await watchRequest(this.options.dataDirectory, WAKE_CLIP_REQUEST_FILE, {
      requested: (): void => {
        this.watch?.stop();
        this.ears.forEach((ear) => {
          background(this.keep(ear, 'asked', {}), 'wake.diagnostic_failed');
        });
        if (!this.stopped) {
          background(this.start(), 'wake.diagnostic_watch_failed');
        }
      },
      failed: (cause): void => {
        this.options.log.error('wake.diagnostic_watch_failed', cause);
      },
    });
  }

  stop(): void {
    this.stopped = true;
    this.watch?.stop();
  }

  private async keep(
    ear: DiagnosedEar,
    reason: ClipReason,
    extra: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const pcm = ear.recent();
    const directory = join(this.options.dataDirectory, WAKE_DIAGNOSTICS_DIRECTORY);
    const stamp = this.options.clock.now().toISOString().replace(/[:.]/g, '-');
    const clip = `${stamp}-${labelOf(ear.fields)}-${reason}.wav`;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(directory, clip), wavOf(pcm), { mode: 0o600 });
    const names = [...this.options.names(), ...ear.names()];
    const score = await this.options.spotter().scoreOf(names, pcm);
    const text = this.options.transcribe === null ? null : await this.options.transcribe(pcm);
    this.options.log.info('wake.diagnostic_heard', {
      ...ear.fields,
      ...extra,
      reason,
      clip,
      clipMs: Math.round(pcm.length / 16),
      score,
      text,
    });
  }
}
