import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { MessageId, createUserMessage } from '@deepseek-ai/dsh-llm';
import { Logger } from '@smarteverything/logging';
import { expect, it } from 'vitest';
import { bootRuntime, type RuntimeFixture } from './support/runtime';
import type { HarnessSession } from '../src/host/session';

const origin = new AsyncLocalStorage<string | undefined>();

function prompt(session: HarnessSession, id: string): void {
  session.prompt({
    ...createUserMessage({ content: [{ type: 'text', text: id }], source: { kind: 'user' } }),
    id: MessageId(id),
  });
}

async function queuedFailure(
  host: RuntimeFixture,
  first: string,
  next: string,
  driverOrigin: string | undefined,
): Promise<void> {
  const session = await host.runtime.create(host.sessionOptions());
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = (): void => undefined;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  const { model } = host;
  model.guard = (): void => {
    started();
  };
  host.model.script(
    { kind: 'text', text: 'First turn complete', after: held },
    { kind: 'fail', failure: { code: 'AUTH', message: 'Queued turn failed' } },
  );
  origin.run(driverOrigin, () => {
    prompt(session, first);
  });
  await began;
  prompt(session, next);
  release();
  await session.drain();
}

it('logs failures under the actual claimed input rather than the original queued driver context', async () => {
  const root = randomUUID();
  const repair = randomUUID();
  const captured: (string | undefined)[] = [];
  const scopes = new Map<string, string | undefined>();
  const host = await bootRuntime({
    mount: (ctx): void => {
      ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
        const key = `${agent.id}:${String(turn)}`;
        if (message.id === repair) scopes.set(key, root);
      });
    },
    failureContext: ({ sessionId, turn }, work): void => {
      origin.run(scopes.get(`${sessionId}:${String(turn)}`), work);
    },
  });
  const heldSink = Logger.sink;
  Logger.configure({
    sink: (entry): void => {
      if (entry.event === 'session.failed') captured.push(origin.getStore());
    },
  });
  try {
    const idle = await host.runtime.create(host.sessionOptions());
    host.model.script({ kind: 'fail', failure: { code: 'AUTH', message: 'Idle repair failed' } });
    origin.run(undefined, () => {
      prompt(idle, repair);
    });
    await idle.drain();
    await queuedFailure(host, randomUUID(), repair, undefined);
    await queuedFailure(host, repair, randomUUID(), root);
    expect(captured).toEqual([root, root, undefined]);
  } finally {
    Logger.configure({ sink: heldSink });
    await host.dispose();
  }
});
