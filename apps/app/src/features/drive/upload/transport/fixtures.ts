import { ITEM_ID_HEADER, ITEM_NAME_HEADER } from './errors';
import { PersistedUrlStorage, type KeyValueStorage } from './resume-store';
import type { TransportAnswer, TransportRequest, UploadTransport } from './types';

export const ITEM_ID = 'a1b2c3d4-0000-4000-8000-0000000000aa';
export const FOLDER_ID = 'a1b2c3d4-0000-4000-8000-0000000000bb';
export const HASH = 'ab'.repeat(32);

class Session {
  readonly parts: Uint8Array[] = [];
  offset = 0;

  constructor(
    readonly length: number,
    readonly metadata: string,
  ) {}

  append(bytes: Uint8Array): void {
    this.parts.push(bytes);
    this.offset += bytes.length;
  }
}

export interface Gate {
  readonly passed: Promise<void>;
  open(): void;
}

export function gate(): Gate {
  let open: () => void = () => undefined;
  const passed = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    passed,
    open: (): void => {
      open();
    },
  };
}

export interface Refusal {
  readonly status: number;
  readonly reason?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface Exchange {
  readonly method: string;
  readonly path: string;
}

function abortion(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
}

export class FakeHub implements UploadTransport {
  readonly exchanges: Exchange[] = [];
  readonly sessions = new Map<string, Session>();
  refuseCreate: Refusal | null = null;
  refuseWrite: Refusal | null = null;
  storedName: string | null = null;
  dieAfterBytes: number | null = null;
  beforeWrite: (() => Promise<void>) | null = null;
  private next = 0;

  count(method: string): number {
    return this.exchanges.filter((exchange) => exchange.method === method).length;
  }

  bytesOf(path: string): Uint8Array {
    const session = this.sessions.get(path);
    if (session === undefined) throw new Error(`no session at ${path}`);
    const out = new Uint8Array(session.offset);
    let at = 0;
    for (const part of session.parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }

  async send(request: TransportRequest): Promise<TransportAnswer> {
    if (request.signal.aborted) throw new DOMException('aborted', 'AbortError');
    this.exchanges.push({ method: request.method, path: request.path });
    if (request.method === 'POST') return this.create(request);
    const session = this.sessions.get(request.path);
    if (session === undefined) return this.refusal({ status: 404 });
    if (request.method === 'HEAD') return this.head(session);
    if (request.method === 'DELETE') {
      this.sessions.delete(request.path);
      return this.answer(204, {});
    }
    return this.write(request, session);
  }

  private create(request: TransportRequest): TransportAnswer {
    if (this.refuseCreate !== null) return this.refusal(this.refuseCreate);
    this.next += 1;
    const path = `/drive/uploads/session-${String(this.next)}`;
    this.sessions.set(
      path,
      new Session(
        Number(request.headers['Upload-Length']),
        request.headers['Upload-Metadata'] ?? '',
      ),
    );
    return this.answer(201, { location: path });
  }

  private head(session: Session): TransportAnswer {
    return this.answer(200, {
      'upload-offset': String(session.offset),
      'upload-length': String(session.length),
    });
  }

  private async write(request: TransportRequest, session: Session): Promise<TransportAnswer> {
    if (this.refuseWrite !== null) return this.refusal(this.refuseWrite);
    if (this.beforeWrite !== null) {
      await Promise.race([this.beforeWrite(), abortion(request.signal)]);
    }
    if (Number(request.headers['Upload-Offset']) !== session.offset) return this.answer(409, {});
    const bytes = new Uint8Array((await request.body?.arrayBuffer()) ?? new ArrayBuffer(0));
    const dying = this.dieAfterBytes;
    this.dieAfterBytes = null;
    session.append(dying === null ? bytes : bytes.slice(0, dying));
    if (dying !== null) throw new TypeError('Network request failed');
    return this.answer(204, this.finalHeaders(session));
  }

  private finalHeaders(session: Session): Readonly<Record<string, string>> {
    const done = session.offset === session.length;
    return {
      'upload-offset': String(session.offset),
      ...(done
        ? {
            [ITEM_ID_HEADER.toLowerCase()]: ITEM_ID,
            [ITEM_NAME_HEADER.toLowerCase()]: encodeURIComponent(this.storedName ?? 'photo.jpg'),
          }
        : {}),
    };
  }

  private refusal(refusal: Refusal): TransportAnswer {
    const body =
      refusal.reason === undefined
        ? ''
        : JSON.stringify({
            error: { code: 'command_refused', message: 'Refused.', reason: refusal.reason },
          });
    return { status: refusal.status, headers: { ...refusal.headers }, body };
  }

  private answer(status: number, headers: Readonly<Record<string, string>>): TransportAnswer {
    return { status, headers: { 'tus-resumable': '1.0.0', ...headers }, body: '' };
  }
}

export class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): Promise<string | null> {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

export function persistedStorage(memory: MemoryStorage): PersistedUrlStorage {
  return new PersistedUrlStorage(memory);
}

export function payload(bytes: number): Blob {
  const data = new Uint8Array(bytes);
  for (let at = 0; at < bytes; at += 1) data[at] = at % 251;
  return new Blob([data], { type: 'image/jpeg' });
}
