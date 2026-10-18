import { spawn } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import type { Readable } from 'node:stream';
import { Logger } from '@smarteverything/logging';
import { firstInstalled, type AudioTool } from './audio-tool';
import type { ProgramProbe } from './program-probe';

const log = new Logger('hub.node-audio');

const SAMPLE_RATE = 16_000;
const CHUNK_SAMPLES = 1600;
const CHUNK_BYTES = CHUNK_SAMPLES * 2;
const LATENCY_MS = 50;
const STDERR_TAIL = 400;

export interface Recorder extends EventEmitter {
  readonly pid?: number | undefined;
  readonly stdout: Readable;
  readonly stderr: Readable;
  readonly kill: (signal: NodeJS.Signals) => boolean;
}

type SpawnRecorder = (program: string, args: readonly string[]) => Recorder;

export interface MicHandlers {
  readonly pcm: (chunk: Int16Array) => void;
  readonly ended: (reason: string) => void;
}

export type StopMic = () => void;

export const MIC_TOOLS: readonly AudioTool[] = [
  {
    program: 'pw-record',
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
    program: 'parec',
    args: [
      '--raw',
      `--rate=${String(SAMPLE_RATE)}`,
      '--channels=1',
      '--format=s16le',
      `--latency-msec=${String(LATENCY_MS)}`,
    ],
  },
];

export interface MicCaptureOptions {
  readonly probe: ProgramProbe;
  readonly spawnRecorder?: SpawnRecorder;
}

const systemSpawn: SpawnRecorder = (program, args) =>
  spawn(program, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });

class PcmBuffer {
  private fill = new Uint8Array(CHUNK_BYTES);
  private filled = 0;

  push(data: Uint8Array, emit: (chunk: Int16Array) => void): void {
    let offset = 0;
    while (offset < data.length) {
      const take = Math.min(CHUNK_BYTES - this.filled, data.length - offset);
      this.fill.set(data.subarray(offset, offset + take), this.filled);
      this.filled += take;
      offset += take;
      if (this.filled === CHUNK_BYTES) {
        emit(new Int16Array(this.fill.buffer));
        this.fill = new Uint8Array(CHUNK_BYTES);
        this.filled = 0;
      }
    }
  }
}

export class MicCapture {
  constructor(private readonly options: MicCaptureOptions) {}

  async open(handlers: MicHandlers): Promise<StopMic> {
    const tool = await firstInstalled(this.options.probe, MIC_TOOLS, 'Listening to the microphone');
    const child = (this.options.spawnRecorder ?? systemSpawn)(tool.program, tool.args);
    return this.attach(child, tool, handlers);
  }

  private attach(child: Recorder, tool: AudioTool, handlers: MicHandlers): StopMic {
    const buffer = new PcmBuffer();
    let stopped = false;
    let flowing = false;
    let stderr = '';
    child.stdout.on('data', (data: Buffer) => {
      if (!flowing) {
        flowing = true;
        log.info('computer_ear.capture_flowing', { program: tool.program, pid: child.pid });
      }
      if (!stopped) {
        buffer.push(data, handlers.pcm);
      }
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr = (stderr + data.toString('utf8')).slice(-STDERR_TAIL);
    });
    const finish = (reason: string): void => {
      if (!stopped) {
        stopped = true;
        handlers.ended(reason);
      }
    };
    child.once('error', (cause: Error) => {
      finish(`${tool.program} could not start: ${cause.message}`);
    });
    child.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      finish(
        `${tool.program} exited (${String(signal ?? code ?? 'unknown')}) ${stderr.trim()}`.trim(),
      );
    });
    log.info('computer_ear.capture_started', { program: tool.program, pid: child.pid });
    return (): void => {
      stopped = true;
      log.info('computer_ear.capture_stopping', { program: tool.program, pid: child.pid });
      child.kill('SIGTERM');
    };
  }
}
