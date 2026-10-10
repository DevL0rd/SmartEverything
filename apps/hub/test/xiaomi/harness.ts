import { createSocket } from 'node:dgram';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AdapterFailure,
  AdapterSink,
  DeviceEvent,
  DiscoveredDevice,
  ProviderPrompt,
  StateUpdate,
} from '@smarteverything/domain';
import { Logger, type LogRecord } from '@smarteverything/logging';
import type { RunContext, StoredAccount } from '../../src/adapters/contract';
import type { Fetch, XiaomiDependencies } from '../../src/adapters/xiaomi/dependencies';
import { requestOf, type Route } from './fake-http';

export interface Recorded {
  readonly states: StateUpdate[];
  readonly events: DeviceEvent[];
  readonly devices: (readonly DiscoveredDevice[])[];
  readonly failures: AdapterFailure[];
}

export interface Harness {
  readonly context: RunContext;
  readonly prompts: ProviderPrompt[];
  readonly saved: StoredAccount[];
  readonly attention: string[];
  readonly logs: LogRecord[];
  readonly cleanup: () => Promise<void>;
}

export function routedFetch(routes: readonly Route[], seen: string[] = []): Fetch {
  return (url, init): Promise<Response> => {
    seen.push(`${init.method ?? 'GET'} ${url}`);
    const request = requestOf(url, init);
    for (const route of routes) {
      const response = route(request);
      if (response !== null) {
        return Promise.resolve(response);
      }
    }
    return Promise.resolve(new Response(`no fake route for ${url}`, { status: 599 }));
  };
}

export function dependencies(fetch: Fetch, miioPort: number): XiaomiDependencies {
  let counter = 0;
  return {
    fetch,
    createSocket: () => createSocket('udp4'),
    randomBytes: (length): Uint8Array => {
      counter += 1;
      return Uint8Array.from({ length }, (_, index) => (index + counter) % 256);
    },
    now: () => Date.now(),
    timing: {
      lanPollMs: 80,
      cloudPollMs: 120,
      cameraPollMs: 80,
      requestTimeoutMs: 150,
      requestAttempts: 2,
      handshakeMaxAgeMs: 60_000,
      lanFailuresBeforeCloud: 2,
    },
    specBaseUrl: 'https://miot-spec.org',
    miioPort,
  };
}

export async function harness(answers: (prompt: ProviderPrompt) => string): Promise<Harness> {
  const logs: LogRecord[] = [];
  Logger.reset();
  Logger.configure({ level: 'trace', sink: (record) => logs.push(record) });
  const dataDirectory = await mkdtemp(join(tmpdir(), 'xiaomi-adapter-'));
  const prompts: ProviderPrompt[] = [];
  const saved: StoredAccount[] = [];
  const attention: string[] = [];
  const context: RunContext = {
    log: new Logger('tool.xiaomi-test'),
    dataDirectory,
    ask: (prompt): Promise<string> => {
      prompts.push(prompt);
      return Promise.resolve(answers(prompt));
    },
    saveAccount: (account): Promise<void> => {
      saved.push(account);
      return Promise.resolve();
    },
    needsAttention: (reason): Promise<void> => {
      attention.push(reason);
      return Promise.resolve();
    },
  };
  return {
    context,
    prompts,
    saved,
    attention,
    logs,
    cleanup: () => rm(dataDirectory, { recursive: true, force: true }),
  };
}

export function recorder(): Recorded & { readonly sink: AdapterSink } {
  const recorded: Recorded = { states: [], events: [], devices: [], failures: [] };
  return {
    ...recorded,
    sink: {
      state: (update): void => {
        recorded.states.push(update);
      },
      event: (event): void => {
        recorded.events.push(event);
      },
      devices: (devices): void => {
        recorded.devices.push(devices);
      },
      online: (): void => undefined,
      failure: (failure): void => {
        recorded.failures.push(failure);
      },
    },
  };
}

export async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`the condition did not hold within ${String(timeoutMs)} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
