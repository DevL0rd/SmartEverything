import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { AIBI_URL_BASE } from './host-name';
import { GEMINI_RATE, Mp3Stream, silence } from './mp3';

const STREAM_LIFETIME_MS = 120_000;
const LEAD_MS = 1500;
const MARGIN_MS = 250;
const TICK_MS = 100;
const BYTES_PER_MS = 8;
const PAUSE_MS = 250;

const MILLISECONDS = 1000;
const HTTP_OK = 200;

export type SpeechKind = 'tts' | 'poweron';

export function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

type StreamState = 'open' | 'ended' | 'failed';

export class SpeechStream {
  readonly id = `local-${randomUUID()}.mp3`;
  private chunks: Buffer[] = [];
  private readonly encoder = new Mp3Stream();
  private state: StreamState = 'open';
  private samples = 0;
  private filler: NodeJS.Timeout | null = null;

  constructor(readonly kind: SpeechKind = 'tts') {}

  get url(): string {
    return `${AIBI_URL_BASE}/${this.kind}/dl/${this.id}`;
  }

  get open(): boolean {
    return this.state === 'open';
  }

  write(pcm: Int16Array): void {
    if (this.state !== 'open') {
      return;
    }
    this.samples += pcm.length;
    this.push(this.encoder.encode(pcm));
  }

  writeMp3(data: Buffer): void {
    if (this.state === 'open') {
      this.push(data);
    }
  }

  end(): void {
    if (this.state !== 'open') {
      return;
    }
    this.push(this.encoder.finish());
    this.close('ended');
  }

  fail(): void {
    if (this.state === 'open') {
      this.close('failed');
    }
  }

  serve(response: ServerResponse): void {
    response.removeHeader('Transfer-Encoding');
    response.writeHead(HTTP_OK, { 'Content-Type': 'audio/mpeg', Connection: 'close' });
    const started = Date.now();
    let sent = 0;
    const timer = setInterval(() => {
      sent = this.pump(response, started, sent, () => {
        clearInterval(timer);
      });
    }, TICK_MS);
    response.once('close', () => {
      clearInterval(timer);
    });
    if (this.state === 'open' && this.filler === null) {
      this.keepAhead(started);
    }
    sent = this.pump(response, started, sent, () => {
      clearInterval(timer);
    });
  }

  private pump(response: ServerResponse, started: number, sent: number, stop: () => void): number {
    if (response.destroyed || this.state === 'failed') {
      stop();
      response.destroy();
      return sent;
    }
    const audio = Buffer.concat(this.chunks);
    this.chunks = [audio];
    const due = Math.min(audio.length, Math.floor((Date.now() - started + LEAD_MS) * BYTES_PER_MS));
    if (due > sent) {
      response.write(audio.subarray(sent, due));
    }
    const now = Math.max(sent, due);
    if (this.state === 'ended' && now >= audio.length) {
      stop();
      response.end();
    }
    return now;
  }

  private push(data: Buffer): void {
    if (data.length > 0) {
      this.chunks.push(data);
    }
  }

  private close(state: 'ended' | 'failed'): void {
    if (this.filler !== null) {
      clearInterval(this.filler);
      this.filler = null;
    }
    this.state = state;
  }

  private keepAhead(started: number): void {
    const filler = setInterval(() => {
      const wanted = ((Date.now() - started + MARGIN_MS) / MILLISECONDS) * GEMINI_RATE;
      const missing = Math.floor(wanted - this.samples);
      if (missing > 0) {
        this.write(new Int16Array(missing));
      }
    }, TICK_MS);
    filler.unref();
    this.filler = filler;
  }
}

export class Speeches {
  private readonly streams = new Map<string, { stream: SpeechStream; expires: number }>();
  private quiet: Buffer | null = null;

  create(kind: SpeechKind = 'tts'): SpeechStream {
    this.prune();
    const stream = new SpeechStream(kind);
    this.streams.set(stream.id, { stream, expires: Date.now() + STREAM_LIFETIME_MS });
    return stream;
  }

  pause(): SpeechStream {
    this.quiet ??= silence(PAUSE_MS);
    const stream = this.create();
    stream.writeMp3(this.quiet);
    stream.end();
    return stream;
  }

  find(id: string): SpeechStream | null {
    this.prune();
    return this.streams.get(id)?.stream ?? null;
  }

  clear(): void {
    for (const { stream } of this.streams.values()) {
      stream.fail();
    }
    this.streams.clear();
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, entry] of this.streams) {
      if (entry.expires > now || entry.stream.open) {
        continue;
      }
      entry.stream.fail();
      this.streams.delete(id);
    }
  }
}
