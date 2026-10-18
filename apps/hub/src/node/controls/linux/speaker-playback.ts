import { spawn } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';
import { Logger } from '@smarteverything/logging';
import { firstInstalled, type AudioTool } from './audio-tool';
import type { ProgramProbe } from './program-probe';

const log = new Logger('hub.node-audio');

const SAMPLE_RATE = 48_000;
const LATENCY_MS = 100;
const STDERR_TAIL = 400;

interface Player extends EventEmitter {
  readonly pid?: number | undefined;
  readonly stdin: Writable;
  readonly stderr: Readable;
}

type SpawnPlayer = (program: string, args: readonly string[]) => Player;

export const SPEAKER_TOOLS: readonly AudioTool[] = [
  {
    program: 'pw-play',
    args: [
      '--raw',
      '--rate',
      String(SAMPLE_RATE),
      '--channels',
      '1',
      '--format',
      's16',
      '--latency',
      `${String(LATENCY_MS)}ms`,
      '-',
    ],
  },
  {
    program: 'paplay',
    args: [
      '--raw',
      `--rate=${String(SAMPLE_RATE)}`,
      '--channels=1',
      '--format=s16le',
      `--latency-msec=${String(LATENCY_MS)}`,
    ],
  },
];

export interface SpeakerStream {
  readonly write: (pcm: Int16Array) => void;
  readonly end: () => void;
}

export interface SpeakerPlaybackOptions {
  readonly probe: ProgramProbe;
  readonly spawnPlayer?: SpawnPlayer;
}

const systemSpawn: SpawnPlayer = (program, args) =>
  spawn(program, [...args], { stdio: ['pipe', 'ignore', 'pipe'] });

export class SpeakerPlayback {
  constructor(private readonly options: SpeakerPlaybackOptions) {}

  async open(): Promise<SpeakerStream> {
    const tool = await firstInstalled(this.options.probe, SPEAKER_TOOLS, 'Speaking aloud');
    const child = (this.options.spawnPlayer ?? systemSpawn)(tool.program, tool.args);
    let stderr = '';
    let ended = false;
    child.stderr.on('data', (data: Buffer) => {
      stderr = (stderr + data.toString('utf8')).slice(-STDERR_TAIL);
    });
    child.stdin.on('error', (cause: Error) => {
      log.warn('computer_ear.speaker_write_failed', {
        program: tool.program,
        reason: cause.message,
      });
    });
    child.once('error', (cause: Error) => {
      ended = true;
      log.error('computer_ear.speaker_failed', cause, { program: tool.program });
    });
    child.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      ended = true;
      log.info('computer_ear.speaker_closed', {
        program: tool.program,
        code,
        signal,
        stderr: stderr.trim(),
      });
    });
    log.info('computer_ear.speaker_opened', { program: tool.program, pid: child.pid });
    return {
      write: (pcm): void => {
        if (!ended) {
          child.stdin.write(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
        }
      },
      end: (): void => {
        child.stdin.end();
      },
    };
  }
}
