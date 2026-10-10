import { z } from 'zod';
import { THUMBNAIL_WIDTH, type MediaSize } from '@smarteverything/domain';

export interface Go2rtcAccess {
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
  readonly fetch: typeof fetch;
}

export class Go2rtcError extends Error {
  override readonly name = 'Go2rtcError';

  constructor(
    readonly operation: string,
    readonly status: number,
    body: string,
  ) {
    super(`go2rtc refused ${operation} with HTTP ${String(status)}: ${body.trim() || 'no body'}.`);
  }
}

export interface Go2rtcClient {
  readonly putStream: (name: string, sources: readonly string[]) => Promise<void>;
  readonly deleteStream: (name: string) => Promise<void>;
  readonly answer: (stream: string, offer: string) => Promise<string>;
  readonly frame: (stream: string, size: MediaSize, signal: AbortSignal) => Promise<Uint8Array>;
  readonly consumers: (stream: string) => Promise<readonly StreamConsumer[]>;
  readonly closeConsumer: (stream: string, id: number) => Promise<void>;
  readonly clip: (stream: string, seconds: number) => Promise<Uint8Array>;
  readonly play: (stream: string, source: string) => Promise<void>;
  readonly socketOf: (stream: string) => Go2rtcSocket;
}

export interface StreamConsumer {
  readonly id: number;
  readonly format: string;
  readonly remote: string;
  readonly userAgent: string;
}

const STREAM_INFO = z.object({
  consumers: z
    .array(
      z.object({
        id: z.number().int().default(0),
        format_name: z.string().default('unknown'),
        remote_addr: z.string().default(''),
        user_agent: z.string().default(''),
      }),
    )
    .nullable()
    .default([]),
});

export interface Go2rtcSocket {
  readonly url: string;
  readonly authorization: string;
}

export interface Go2rtcMotor {
  readonly motor: (stream: string, operation: number) => Promise<void>;
}

interface Call {
  readonly method: 'GET' | 'PUT' | 'POST' | 'DELETE';
  readonly path: string;
  readonly query: Readonly<Record<string, string | readonly string[]>>;
  readonly sdp?: string;
  readonly signal?: AbortSignal;
}

type Request = (operation: string, call: Call) => Promise<Response>;

function authorizationOf(access: Go2rtcAccess): string {
  return `Basic ${Buffer.from(`${access.username}:${access.password}`).toString('base64')}`;
}

function searchOf(query: Call['query']): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const entry of typeof value === 'string' ? [value] : value) {
      search.append(key, entry);
    }
  }
  return search.toString();
}

function requester(access: Go2rtcAccess): Request {
  const authorization = authorizationOf(access);
  return async (operation, call) => {
    const url = new URL(call.path, access.baseUrl);
    url.search = searchOf(call.query);
    const response = await access.fetch(url, {
      method: call.method,
      headers: {
        authorization,
        ...(call.sdp === undefined ? {} : { 'content-type': 'application/sdp' }),
      },
      ...(call.sdp === undefined ? {} : { body: call.sdp }),
      ...(call.signal === undefined ? {} : { signal: call.signal }),
    });
    if (!response.ok) {
      throw new Go2rtcError(operation, response.status, await response.text());
    }
    return response;
  };
}

function answerOf(request: Request): Go2rtcClient['answer'] {
  return async (stream, offer) =>
    (
      await request('webrtc.offer', {
        method: 'POST',
        path: '/api/webrtc',
        query: { src: stream },
        sdp: offer,
      })
    ).text();
}

function consumersOf(request: Request): Go2rtcClient['consumers'] {
  return async (stream) => {
    const response = await request('streams.get', {
      method: 'GET',
      path: '/api/streams',
      query: { src: stream },
    });
    const info = STREAM_INFO.parse(await response.json());
    return (info.consumers ?? []).map((consumer) => ({
      id: consumer.id,
      format: consumer.format_name,
      remote: consumer.remote_addr,
      userAgent: consumer.user_agent,
    }));
  };
}

function motorOf(request: Request): Go2rtcMotor['motor'] {
  return async (stream, operation) => {
    await request('xiaomi.motor', {
      method: 'POST',
      path: '/api/xiaomi/motor',
      query: { src: stream, operation: String(operation) },
    });
  };
}

function playOf(request: Request): Go2rtcClient['play'] {
  return async (stream, source) => {
    await request('streams.play', {
      method: 'POST',
      path: '/api/streams',
      query: { dst: stream, src: source },
    });
  };
}

function socketOf(access: Go2rtcAccess): Go2rtcClient['socketOf'] {
  return (stream) => {
    const url = new URL('/api/ws', access.baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.search = new URLSearchParams({ src: stream }).toString();
    return { url: url.toString(), authorization: authorizationOf(access) };
  };
}

export function go2rtcClient(access: Go2rtcAccess): Go2rtcClient & Go2rtcMotor {
  const request = requester(access);
  const bytes = async (operation: string, call: Call): Promise<Uint8Array> =>
    new Uint8Array(await (await request(operation, call)).arrayBuffer());
  return {
    putStream: async (name, sources): Promise<void> => {
      await request('streams.put', {
        method: 'PUT',
        path: '/api/streams',
        query: { name, src: sources },
      });
    },
    deleteStream: async (name): Promise<void> => {
      await request('streams.delete', {
        method: 'DELETE',
        path: '/api/streams',
        query: { src: name },
      });
    },
    answer: answerOf(request),
    frame: (stream, size, signal): Promise<Uint8Array> =>
      bytes('frame.jpeg', {
        method: 'GET',
        path: '/api/frame.jpeg',
        query: size === 'thumb' ? { src: stream, w: String(THUMBNAIL_WIDTH) } : { src: stream },
        signal,
      }),
    consumers: consumersOf(request),
    closeConsumer: async (stream, id): Promise<void> => {
      await request('streams.consumer.delete', {
        method: 'DELETE',
        path: '/api/streams/consumer',
        query: { src: stream, id: String(id) },
      });
    },
    clip: (stream, seconds): Promise<Uint8Array> =>
      bytes('stream.mp4', {
        method: 'GET',
        path: '/api/stream.mp4',
        query: { src: stream, duration: String(seconds) },
      }),
    play: playOf(request),
    motor: motorOf(request),
    socketOf: socketOf(access),
  };
}
