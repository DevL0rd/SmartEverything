import { z } from 'zod';
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

function openRelaySocket(url: string, parts: RelayParts): WebSocket {
  const socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  let queue: SegmentQueue | null = null;
  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'mse', value: playableCodecs() }));
  });
  socket.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.data instanceof ArrayBuffer) {
      try {
        queue?.push(event.data);
        parts.report('connected');
      } catch {
        parts.report('failed');
        socket.close();
      }
      return;
    }
    const message = RELAY_MESSAGE.safeParse(
      typeof event.data === 'string' ? parsedJson(event.data) : null,
    );
    if (message.success && message.data.type === 'mse') {
      try {
        queue = new SegmentQueue(parts.source.addSourceBuffer(message.data.value));
      } catch {
        parts.report('failed');
        socket.close();
      }
    } else {
      parts.report('failed');
    }
  });
  socket.addEventListener('error', () => {
    parts.report('failed');
  });
  socket.addEventListener('close', () => {
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
      closed = true;
      listeners.length = 0;
      socket?.close();
    },
  };
}
