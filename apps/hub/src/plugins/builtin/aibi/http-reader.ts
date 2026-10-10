import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';

export interface Head {
  readonly startLine: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface Reader {
  readonly head: (head: Head) => void;
  readonly body: (chunk: Buffer) => void;
  readonly end: () => void;
}

export interface Message extends Head {
  readonly body: Buffer;
}

type Framing = 'none' | 'length' | 'chunked';

type ChunkStep = 'size' | 'data' | 'crlf' | 'trailer';

const HEADER_LIMIT_BYTES = 64 * 1024;

const CRLF = Buffer.from('\r\n');
const HEAD_END = '\r\n\r\n';
const HEX = 16;
const FIRST_NO_BODY_STATUS = 200;
const NO_CONTENT = 204;
const NOT_MODIFIED = 304;

class HttpHeadTooLargeError extends Error {
  override readonly name = 'HttpHeadTooLargeError';

  constructor() {
    super(`HTTP header larger than ${String(HEADER_LIMIT_BYTES)} bytes`);
  }
}

class HttpChunkSizeError extends Error {
  override readonly name = 'HttpChunkSizeError';

  constructor(readonly received: string) {
    super(`Invalid HTTP chunk size ${JSON.stringify(received)}`);
  }
}

export function parseHead(text: string): Head {
  const [startLine = '', ...lines] = text.split('\r\n');
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const at = line.indexOf(':');
    if (at > 0) {
      headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
    }
  }
  return { startLine, headers };
}

export interface RequestLine {
  readonly method: string;
  readonly target: string;
  readonly path: string;
  readonly query: URLSearchParams;
}

export function requestLine(startLine: string): RequestLine {
  const [method = '', target = ''] = startLine.split(' ');
  const url = new URL(`http://local${target.startsWith('/') ? target : `/${target}`}`);
  return { method, target, path: url.pathname, query: url.searchParams };
}

function untilClose(head: Head): boolean {
  const status = Number(head.startLine.split(' ')[1]);
  const length = head.headers['content-length'];
  return (
    (length === undefined || length === '') &&
    status >= FIRST_NO_BODY_STATUS &&
    status !== NO_CONTENT &&
    status !== NOT_MODIFIED
  );
}

function lengthOf(head: Head): number | null {
  const length = Number(head.headers['content-length'] ?? '');
  return Number.isSafeInteger(length) && length > 0 ? length : null;
}

export class HttpReader {
  private buffer: Buffer = Buffer.alloc(0);
  private framing: Framing | null = null;
  private left = 0;
  private chunkStep: ChunkStep = 'size';

  constructor(
    private readonly reader: Reader,
    private readonly response = false,
  ) {}

  push(chunk: Buffer): void {
    this.buffer = this.buffer.length > 0 ? Buffer.concat([this.buffer, chunk]) : chunk;
    while (this.buffer.length > 0 && this.step()) {
      continue;
    }
    if (this.framing === null && this.buffer.length > HEADER_LIMIT_BYTES) {
      throw new HttpHeadTooLargeError();
    }
  }

  close(): void {
    if (this.framing === 'length' && this.left === Infinity) {
      this.finish();
    }
  }

  private step(): boolean {
    switch (this.framing) {
      case null:
        return this.readHead();
      case 'length':
        return this.readLength();
      case 'chunked':
        return this.readChunked();
      case 'none':
        return false;
    }
  }

  private frame(head: Head): void {
    if (/\bchunked\b/i.test(head.headers['transfer-encoding'] ?? '')) {
      this.framing = 'chunked';
      this.left = 0;
      this.chunkStep = 'size';
      return;
    }
    const length = lengthOf(head);
    if (length !== null) {
      this.framing = 'length';
      this.left = length;
    } else if (this.response && untilClose(head)) {
      this.framing = 'length';
      this.left = Infinity;
    } else {
      this.framing = 'none';
    }
  }

  private readHead(): boolean {
    while (this.buffer.subarray(0, CRLF.length).equals(CRLF)) {
      this.buffer = this.buffer.subarray(CRLF.length);
    }
    const end = this.buffer.indexOf(HEAD_END);
    if (end === -1) {
      return false;
    }
    const head = parseHead(this.buffer.subarray(0, end).toString('latin1'));
    this.buffer = this.buffer.subarray(end + HEAD_END.length);
    this.frame(head);
    this.reader.head(head);
    if (this.framing === 'none') {
      this.finish();
    }
    return true;
  }

  private consume(): boolean {
    const take = Math.min(this.left, this.buffer.length);
    if (take === 0) {
      return false;
    }
    this.reader.body(this.buffer.subarray(0, take));
    this.buffer = this.buffer.subarray(take);
    this.left -= take;
    return true;
  }

  private readLength(): boolean {
    const consumed = this.consume();
    if (this.left === 0) {
      this.finish();
    }
    return consumed;
  }

  private readChunked(): boolean {
    if (this.chunkStep === 'data') {
      const consumed = this.consume();
      if (this.left === 0) {
        this.chunkStep = 'crlf';
      }
      return consumed;
    }
    const end = this.buffer.indexOf(CRLF);
    if (end === -1) {
      return false;
    }
    const line = this.buffer.subarray(0, end).toString('latin1');
    this.buffer = this.buffer.subarray(end + CRLF.length);
    this.chunkLine(line);
    return true;
  }

  private chunkLine(line: string): void {
    if (this.chunkStep === 'crlf') {
      this.chunkStep = 'size';
    } else if (this.chunkStep === 'trailer') {
      if (line === '') {
        this.finish();
      }
    } else {
      const size = Number.parseInt((line.split(';')[0] ?? '').trim(), HEX);
      if (!Number.isFinite(size)) {
        throw new HttpChunkSizeError(line);
      }
      this.left = size;
      this.chunkStep = size === 0 ? 'trailer' : 'data';
    }
  }

  private finish(): void {
    this.framing = null;
    this.reader.end();
  }
}

export function collector(onMessage: (message: Message) => void): Reader {
  let head: Head | null = null;
  let parts: Buffer[] = [];
  return {
    head: (next): void => {
      head = next;
      parts = [];
    },
    body: (chunk): void => {
      parts.push(Buffer.from(chunk));
    },
    end: (): void => {
      if (head !== null) {
        onMessage({ ...head, body: Buffer.concat(parts) });
      }
      head = null;
    },
  };
}

function encodeHead(startLine: string, headers: Readonly<Record<string, string>>): Buffer {
  const lines = [startLine, ...Object.entries(headers).map(([key, value]) => `${key}: ${value}`)];
  return Buffer.from(`${lines.join('\r\n')}${HEAD_END}`, 'latin1');
}

export function rebuild(message: Message): Buffer {
  const headers: Record<string, string> = { ...message.headers };
  delete headers['transfer-encoding'];
  if (message.body.length > 0 || 'content-length' in headers) {
    headers['content-length'] = String(message.body.length);
  }
  return Buffer.concat([encodeHead(message.startLine, headers), message.body]);
}

export function decodedBody(message: Message): Buffer {
  const encoding = (message.headers['content-encoding'] ?? '').toLowerCase();
  if (encoding.includes('gzip')) {
    return gunzipSync(message.body);
  }
  if (encoding.includes('deflate')) {
    return inflateSync(message.body);
  }
  return encoding.includes('br') ? brotliDecompressSync(message.body) : message.body;
}
