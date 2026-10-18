import { spawn } from 'node:child_process';
import type { Logger } from '@smarteverything/logging';
import { ffmpegPath } from '../media/ffmpeg-path';
import { OggPacketReader, OggStreamError } from './ogg';

const STDERR_KEPT = 600;

const RUMBLE_CUTOFF_HZ = 120;
const SPEECH_MAX_EXPANSION = 12.5;
const SPEECH_EXPANSION_RAISE = 0.0001;
const SPEECH_LEVELLING = [
  `highpass=f=${String(RUMBLE_CUTOFF_HZ)}`,
  `speechnorm=e=${String(SPEECH_MAX_EXPANSION)}:r=${String(SPEECH_EXPANSION_RAISE)}:l=1`,
].join(',');

export interface CameraMicrophoneOptions {
  readonly rtspPort: number;
  readonly ready: (cameraId: string) => Promise<void>;
  readonly log: Logger;
}

export interface MicrophoneHandlers {
  readonly packet: (packet: Uint8Array) => void;
  readonly ended: (failure: string | null) => void;
}

export interface OpenMicrophone {
  readonly stop: () => void;
}

function argumentsFor(url: string): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-fflags',
    'nobuffer',
    '-flags',
    'low_delay',
    '-rtsp_transport',
    'tcp',
    '-i',
    url,
    '-vn',
    '-af',
    SPEECH_LEVELLING,
    '-ac',
    '1',
    '-ar',
    '48000',
    '-c:a',
    'libopus',
    '-b:a',
    '24k',
    '-application',
    'voip',
    '-frame_duration',
    '20',
    '-page_duration',
    '20000',
    '-flush_packets',
    '1',
    '-f',
    'ogg',
    'pipe:1',
  ];
}

interface Reader {
  readonly subscribers: Set<MicrophoneHandlers>;
  stop: () => void;
}

export class CameraMicrophones {
  private readonly readers = new Map<string, Reader>();

  constructor(private readonly options: CameraMicrophoneOptions) {}

  async open(cameraId: string, handlers: MicrophoneHandlers): Promise<OpenMicrophone> {
    const existing = this.readers.get(cameraId);
    const reader = existing ?? (await this.start(cameraId));
    reader.subscribers.add(handlers);
    return {
      stop: (): void => {
        reader.subscribers.delete(handlers);
        if (reader.subscribers.size === 0) {
          reader.stop();
        }
      },
    };
  }

  private async start(cameraId: string): Promise<Reader> {
    await this.options.ready(cameraId);
    const pending = this.readers.get(cameraId);
    if (pending !== undefined) {
      return pending;
    }
    const reader: Reader = { subscribers: new Set(), stop: () => undefined };
    this.readers.set(cameraId, reader);
    reader.stop = this.launch(cameraId, reader);
    return reader;
  }

  private launch(cameraId: string, reader: Reader): () => void {
    const url = `rtsp://127.0.0.1:${String(this.options.rtspPort)}/${encodeURIComponent(cameraId)}?audio`;
    const child = spawn(ffmpegPath(), argumentsFor(url), { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stopped = false;
    const ogg = new OggPacketReader((packet) => {
      reader.subscribers.forEach((subscriber) => {
        subscriber.packet(packet);
      });
    });
    child.stdout.on('data', (chunk: Buffer) => {
      try {
        ogg.push(chunk);
      } catch (cause) {
        if (!(cause instanceof OggStreamError)) {
          throw cause;
        }
        stderr = cause.message;
        child.kill('SIGTERM');
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-STDERR_KEPT);
    });
    child.once('error', (cause) => {
      stderr = cause.message;
    });
    child.once('close', (code) => {
      this.readers.delete(cameraId);
      const failure = stopped
        ? null
        : `ffmpeg stopped (${String(code)}): ${stderr.trim() || 'no output'}`;
      if (failure !== null) {
        this.options.log.warn('talk.camera_microphone_failed', { cameraId, reason: failure });
      }
      reader.subscribers.forEach((subscriber) => {
        subscriber.ended(failure);
      });
    });
    return (): void => {
      stopped = true;
      this.readers.delete(cameraId);
      child.kill('SIGTERM');
    };
  }
}
