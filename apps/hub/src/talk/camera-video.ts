import { spawn } from 'node:child_process';
import type { Logger } from '@smarteverything/logging';
import type { VideoFrame } from '../assistant-voice/video';
import { ffmpegPath } from '../media/ffmpeg-path';
import { messageOf } from '@smarteverything/logging';

const FRAME_WIDTH = 640;
const JPEG_END = Buffer.from([0xff, 0xd9]);

export interface CameraVideoOptions {
  readonly rtspPort: number;
  readonly ready: (cameraId: string) => Promise<void>;
  readonly log: Logger;
}

function argumentsFor(url: string): string[] {
  return [
    ...['-hide_banner', '-loglevel', 'error', '-rtsp_transport', 'tcp', '-i', url, '-an'],
    ...['-vf', `fps=1,scale=${String(FRAME_WIDTH)}:-2`, '-q:v', '6'],
    ...['-c:v', 'mjpeg', '-f', 'image2pipe', 'pipe:1'],
  ];
}

class JpegSplitter {
  private pending = Buffer.alloc(0);

  constructor(private readonly frame: (jpeg: Buffer) => void) {}

  push(chunk: Buffer): void {
    this.pending = Buffer.concat([this.pending, chunk]);
    for (let end = this.pending.indexOf(JPEG_END); end >= 0; end = this.pending.indexOf(JPEG_END)) {
      this.frame(this.pending.subarray(0, end + JPEG_END.length));
      this.pending = this.pending.subarray(end + JPEG_END.length);
    }
  }
}

class Watching {
  private kill: (() => void) | null = null;
  private cancelled = false;

  get active(): boolean {
    return !this.cancelled;
  }

  attach(kill: () => void): void {
    this.kill = kill;
  }

  cancel(): void {
    this.cancelled = true;
    this.kill?.();
  }
}

export class CameraVideo {
  constructor(private readonly options: CameraVideoOptions) {}

  watch(cameraId: string, listener: (frame: VideoFrame) => void): () => void {
    const watching = new Watching();
    this.start(cameraId, listener, watching).catch((cause: unknown) => {
      this.options.log.warn('talk.camera_video_failed', {
        cameraId,
        reason: messageOf(cause),
      });
    });
    return (): void => {
      watching.cancel();
    };
  }

  private async start(
    cameraId: string,
    listener: (frame: VideoFrame) => void,
    watching: Watching,
  ): Promise<void> {
    await this.options.ready(cameraId);
    if (!watching.active) {
      return;
    }
    const url = `rtsp://127.0.0.1:${String(this.options.rtspPort)}/${encodeURIComponent(cameraId)}?video`;
    const child = spawn(ffmpegPath(), argumentsFor(url), { stdio: ['ignore', 'pipe', 'ignore'] });
    const splitter = new JpegSplitter((jpeg) => {
      listener({ data: Buffer.from(jpeg), mimeType: 'image/jpeg' });
    });
    child.stdout.on('data', (chunk: Buffer) => {
      splitter.push(chunk);
    });
    child.once('error', (cause) => {
      this.options.log.warn('talk.camera_video_failed', { cameraId, reason: cause.message });
    });
    watching.attach(() => {
      child.kill('SIGTERM');
    });
    this.options.log.info('talk.camera_video_started', { cameraId });
  }
}
