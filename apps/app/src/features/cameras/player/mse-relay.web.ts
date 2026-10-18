import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { PeerError, type MediaLink, type PeerState } from './peer-types';

const MSE_CODECS: readonly string[] = [
  'avc1.640029',
  'avc1.64002A',
  'avc1.640033',
  'hvc1.1.6.L153.B0',
  'mp4a.40.2',
  'mp4a.40.5',
  'flac',
  'opus',
];

const KEPT_SECONDS = 15;

const log = new Logger('app.camera-relay');

const SUMMARY_MS = 5000;

export function relaySupported(): boolean {
  return typeof MediaSource !== 'undefined';
}

function playableCodecs(): string {
  return MSE_CODECS.filter((codec) =>
    MediaSource.isTypeSupported(`video/mp4; codecs="${codec}"`),
  ).join();
}

const RELAY_MESSAGE = z.object({ type: z.string(), value: z.string() });

function parsedJson(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
    // eslint-disable-next-line local/no-swallowed-errors -- text that is not JSON is the typed null result
  } catch {
    return null;
  }
}

function trimmed(buffer: SourceBuffer): void {
  const kept = buffer.buffered;
  if (kept.length === 0) {
    return;
  }
  const end = kept.end(kept.length - 1) - KEPT_SECONDS;
  if (end > kept.start(0)) {
    buffer.remove(kept.start(0), end);
  }
}

class SegmentQueue {
  private readonly waiting: ArrayBuffer[] = [];

  constructor(private readonly buffer: SourceBuffer) {
    buffer.addEventListener('updateend', () => {
      this.next();
    });
  }

  push(segment: ArrayBuffer): void {
    this.waiting.push(segment);
    this.next();
  }

  private next(): void {
    if (this.buffer.updating) {
      return;
    }
    const segment = this.waiting.shift();
    if (segment === undefined) {
      trimmed(this.buffer);
      return;
    }
    this.buffer.appendBuffer(segment);
  }
}

interface RelayParts {
  readonly source: MediaSource;
  readonly report: (state: PeerState) => void;
}

class RelayTally {
  readonly openedAt = Date.now();
  segments = 0;
  private bytes = 0;
  private summaryAt = this.openedAt;

  elapsed(): number {
    return Date.now() - this.openedAt;
  }

  segment(size: number): void {
    this.segments += 1;
    this.bytes += size;
    if (this.segments === 1) {
      log.info('relay.first_segment', { elapsedMs: this.elapsed(), bytes: size });
    }
    const now = Date.now();
    if (now - this.summaryAt >= SUMMARY_MS) {
      log.debug('relay.segments_received', {
        segments: this.segments,
        bytes: this.bytes,
        windowMs: now - this.summaryAt,
      });
      this.bytes = 0;
      this.summaryAt = now;
    }
  }
}

function failureOf(error: unknown): { readonly error: string; readonly detail: string | null } {
  return error instanceof Error
    ? { error: error.name, detail: error.message }
    : { error: typeof error, detail: null };
}

function messageListener(
  socket: WebSocket,
  parts: RelayParts,
  tally: RelayTally,
): (event: MessageEvent<unknown>) => void {
  let queue: SegmentQueue | null = null;
  const fail = (): void => {
    parts.report('failed');
    socket.close();
  };
  const addBuffer = (type: string): void => {
    try {
      queue = new SegmentQueue(parts.source.addSourceBuffer(type));
      log.debug('relay.buffer_added', () => ({ elapsedMs: tally.elapsed() }));
    } catch (error) {
      log.warn('relay.buffer_failed', failureOf(error));
      fail();
    }
  };
  return (event) => {
    if (event.data instanceof ArrayBuffer) {
      try {
        queue?.push(event.data);
        tally.segment(event.data.byteLength);
        parts.report('connected');
      } catch (error) {
        log.warn('relay.segment_failed', failureOf(error));
        fail();
      }
      return;
    }
    const message = RELAY_MESSAGE.safeParse(
      typeof event.data === 'string' ? parsedJson(event.data) : null,
    );
    if (message.success && message.data.type === 'mse') {
      addBuffer(message.data.value);
    } else {
      log.warn('relay.message_unexpected', {
        parsed: message.success,
        type: message.success ? message.data.type : null,
      });
      parts.report('failed');
    }
  };
}

function openRelaySocket(url: string, parts: RelayParts): WebSocket {
  const socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  const tally = new RelayTally();
  socket.addEventListener('open', () => {
    const codecs = playableCodecs();
    log.info('relay.socket_opened', { elapsedMs: tally.elapsed(), codecLength: codecs.length });
    socket.send(JSON.stringify({ type: 'mse', value: codecs }));
  });
  socket.addEventListener('message', messageListener(socket, parts, tally));
  socket.addEventListener('error', () => {
    log.warn('relay.socket_errored', { elapsedMs: tally.elapsed(), ready: socket.readyState });
    parts.report('failed');
  });
  socket.addEventListener('close', (event) => {
    log.info('relay.socket_closed', {
      elapsedMs: tally.elapsed(),
      code: event.code,
      clean: event.wasClean,
      segments: tally.segments,
    });
    parts.report('failed');
  });
  return socket;
}

export function createRelayLink(url: string): MediaLink {
  const source = new MediaSource();
  const listeners: ((state: PeerState) => void)[] = [];
  let socket: WebSocket | null = null;
  let closed = false;
  const report = (state: PeerState): void => {
    for (const listener of listeners) {
      listener(state);
    }
  };
  source.addEventListener(
    'sourceopen',
    () => {
      log.debug('relay.source_opened', { closed });
      if (!closed) {
        socket = openRelaySocket(url, { source, report });
      }
    },
    { once: true },
  );
  return {
    onMedia: (listener): void => {
      listener({ id: url, source });
    },
    onState: (listener): void => {
      listeners.push(listener);
    },
    onVideoFlow: (listener): void => {
      listeners.push((state) => {
        if (state === 'connected') {
          listener(true);
        }
      });
    },
    setListening: (): void => undefined,
    setTalking: (): Promise<void> =>
      Promise.reject(new PeerError('starting talk', 'the relayed stream carries no microphone')),
    stats: (): Promise<unknown> => Promise.resolve(null),
    close: (): void => {
      log.debug('relay.link_closed', { hadSocket: socket !== null });
      closed = true;
      listeners.length = 0;
      socket?.close();
    },
  };
}
