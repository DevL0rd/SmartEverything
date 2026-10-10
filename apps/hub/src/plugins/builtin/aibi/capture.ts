import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseHead, type Head } from './http-reader';

const CAPTURE_LIMIT = 1000;

const TEXTUAL = /json|text|xml|javascript|urlencoded/i;
const FOLDER_MODE = 0o700;
const FILE_MODE = 0o600;
const SEQUENCE_DIGITS = 6;
const JSON_SUFFIX = '.json';
const HEAD_END = '\r\n\r\n';
const SECRET_HEADERS: ReadonlySet<string> = new Set(['authorization', 'secret']);
const REDACTED = '[redacted]';
const PERSONAL_FIELDS: ReadonlySet<string> = new Set(['email', 'coord']);

export interface CapturedMessage extends Head {
  readonly body: Buffer;
}

export interface Captured {
  readonly scheme: string;
  readonly remote: string;
  readonly started: Date;
  readonly request: CapturedMessage;
  readonly response: Buffer | 'served';
}

export interface CaptureOptions {
  readonly enabled: boolean;
  readonly directory: string;
  readonly failed: (reason: string) => void;
  readonly limit?: number;
}

function redacted(headers: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      SECRET_HEADERS.has(name) ? REDACTED : value,
    ]),
  );
}

function scrubbedJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => scrubbedJson(item));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        name,
        PERSONAL_FIELDS.has(name) ? REDACTED : scrubbedJson(item),
      ]),
    );
  }
  return value;
}

function scrubbed(body: string, type: string): string {
  if (/urlencoded/i.test(type)) {
    const params = new URLSearchParams(body);
    PERSONAL_FIELDS.forEach((name) => {
      if (params.has(name)) {
        params.set(name, REDACTED);
      }
    });
    return params.toString();
  }
  if (!/json/i.test(type)) {
    return body;
  }
  try {
    return JSON.stringify(scrubbedJson(JSON.parse(body)));
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      return body;
    }
    throw cause;
  }
}

function split(raw: Buffer): CapturedMessage {
  const end = raw.indexOf(HEAD_END);
  if (end === -1) {
    return { startLine: raw.toString('latin1'), headers: {}, body: Buffer.alloc(0) };
  }
  return {
    ...parseHead(raw.subarray(0, end).toString('latin1')),
    body: raw.subarray(end + HEAD_END.length),
  };
}

export class TrafficCapture {
  private sequence = 0;
  private writing: Promise<void> = Promise.resolve();
  private readonly limit: number;
  private enabled: boolean;

  constructor(private readonly options: CaptureOptions) {
    this.limit = options.limit ?? CAPTURE_LIMIT;
    this.enabled = options.enabled;
  }

  get on(): boolean {
    return this.enabled;
  }

  enable(on: boolean): void {
    this.enabled = on;
  }

  get directory(): string {
    return this.options.directory;
  }

  record(entry: Captured): void {
    if (!this.enabled) {
      return;
    }
    this.sequence += 1;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `${stamp}-${String(this.sequence).padStart(SEQUENCE_DIGITS, '0')}`;
    this.writing = this.writing
      .then(() => this.write(name, entry))
      .catch((cause: unknown) => {
        this.options.failed(cause instanceof Error ? cause.message : String(cause));
      });
  }

  flushed(): Promise<void> {
    return this.writing;
  }

  private async write(name: string, entry: Captured): Promise<void> {
    const { directory } = this.options;
    await mkdir(directory, { recursive: true, mode: FOLDER_MODE });
    const request = await this.part(name, 'request', entry.request);
    const response =
      entry.response === 'served'
        ? 'live speech stream'
        : await this.part(name, 'response', split(entry.response));
    const record = {
      started: entry.started.toISOString(),
      at: new Date().toISOString(),
      scheme: entry.scheme,
      remote: entry.remote,
      request,
      response,
    };
    await writeFile(
      join(directory, `${name}${JSON_SUFFIX}`),
      `${JSON.stringify(record, null, 2)}\n`,
      {
        mode: FILE_MODE,
      },
    );
    await this.prune();
  }

  private async part(
    name: string,
    side: string,
    message: CapturedMessage,
  ): Promise<Readonly<Record<string, unknown>>> {
    const type = message.headers['content-type'] ?? '';
    const base = {
      startLine: message.startLine,
      headers: redacted(message.headers),
      bytes: message.body.length,
    };
    if (message.body.length === 0) {
      return base;
    }
    if (TEXTUAL.test(type) && message.headers['content-encoding'] === undefined) {
      return { ...base, body: scrubbed(message.body.toString('utf8'), type) };
    }
    const file = `${name}.${side}.bin`;
    await writeFile(join(this.options.directory, file), message.body, { mode: FILE_MODE });
    return { ...base, bodyFile: file };
  }

  private async prune(): Promise<void> {
    const { directory } = this.options;
    const records = (await readdir(directory)).filter((file) => file.endsWith(JSON_SUFFIX)).sort();
    for (const old of records.slice(0, Math.max(0, records.length - this.limit))) {
      const stem = old.slice(0, -JSON_SUFFIX.length);
      await Promise.all(
        [old, `${stem}.request.bin`, `${stem}.response.bin`].map((file) =>
          rm(join(directory, file), { force: true }),
        ),
      );
    }
  }
}
