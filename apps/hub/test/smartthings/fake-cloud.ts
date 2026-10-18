import { appendTo } from '@smarteverything/domain';
import { Logger, type LogRecord } from '@smarteverything/logging';
import type { ProviderPrompt } from '@smarteverything/domain';
import type { RunContext, ShownPrompt, StoredAccount } from '../../src/adapters/contract';

export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | null;
}

type Handler = (request: RecordedRequest) => Response | Promise<Response>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(init?.headers).entries());
}

function bodyOf(init: RequestInit | undefined): string | null {
  return typeof init?.body === 'string' ? init.body : null;
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

export class FakeCloud {
  readonly requests: RecordedRequest[] = [];
  private readonly queued = new Map<string, Handler[]>();
  private readonly standing = new Map<string, Handler>();

  on(method: string, url: string, handler: Handler): this {
    const key = `${method} ${url}`;
    appendTo(this.queued, key, handler);
    return this;
  }

  always(method: string, url: string, handler: Handler): this {
    this.standing.set(`${method} ${url}`, handler);
    return this;
  }

  readonly fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    const method = init?.method ?? 'GET';
    const request = { method, url, headers: headersOf(init), body: bodyOf(init) };
    this.requests.push(request);
    return Promise.resolve(this.handlerFor(`${method} ${url}`)(request));
  };

  sent(method: string, url: string): readonly RecordedRequest[] {
    return this.requests.filter((request) => request.method === method && request.url === url);
  }

  private handlerFor(key: string): Handler {
    const [next, ...rest] = this.queued.get(key) ?? [];
    if (next !== undefined) {
      this.queued.set(key, rest);
      return next;
    }
    const standing = this.standing.get(key);
    if (standing === undefined) {
      throw new Error(`the fake cloud has no route for ${key}`);
    }
    return standing;
  }
}

export class Clock {
  constructor(private current: number) {}

  readonly now = (): Date => new Date(this.current);

  advance(ms: number): void {
    this.current += ms;
  }
}

export interface ContextRecord {
  readonly context: RunContext;
  readonly saved: StoredAccount[];
  readonly attention: string[];
  readonly prompts: ProviderPrompt[];
  readonly logs: LogRecord[];
}

export function contextFor(dataDirectory: string): ContextRecord {
  const saved: StoredAccount[] = [];
  const attention: string[] = [];
  const prompts: ProviderPrompt[] = [];
  const logs: LogRecord[] = [];
  Logger.configure({ sink: (record) => logs.push(record), level: 'debug' });
  const context: RunContext = {
    log: new Logger('app.hub'),
    dataDirectory,
    ask: (prompt) => {
      prompts.push(prompt);
      return Promise.resolve('accepted');
    },
    show: (prompt): Promise<ShownPrompt> => {
      prompts.push(prompt);
      return Promise.resolve({
        answer: Promise.resolve('accepted'),
        dismiss: () => Promise.resolve(),
      });
    },
    saveAccount: (account) => {
      saved.push(account);
      return Promise.resolve();
    },
    needsAttention: (reason) => {
      attention.push(reason.message);
      return Promise.resolve();
    },
  };
  return { context, saved, attention, prompts, logs };
}

export async function settle(rounds = 100): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}
