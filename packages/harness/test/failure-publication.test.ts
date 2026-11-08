import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { MessageId, createUserMessage } from '@deepseek-ai/dsh-llm';
import { DSH_SESSION_ID } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { expect, it } from 'vitest';
import { NativeForward } from '../src/process/native-forward';
import { settledFailureContext } from '../src/process/failure-context';
import { bootRuntime } from './support/runtime';

const origin = new AsyncLocalStorage<string | undefined>();

it.each([
  { repair: true, refused: false },
  { repair: false, refused: false },
  { repair: true, refused: true },
])(
  'preserves assembly failure after actual input publication settles (%j)',
  async ({ repair, refused }) => {
    const root = randomUUID();
    const scopes = new Map<string, string>();
    const captured: {
      readonly root: string | undefined;
      readonly unknown: boolean;
      readonly message: string | undefined;
    }[] = [];
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let published = (): void => undefined;
    const publicationStarted = new Promise<void>((resolve) => {
      published = resolve;
    });
    let logged = (): void => undefined;
    const failureLogged = new Promise<void>((resolve) => {
      logged = resolve;
    });
    const forward = new NativeForward(
      async (frame) => {
        if (frame.kind !== 'input') return;
        published();
        await held;
        if (refused) throw new Error('Input publication unavailable');
        if (repair) scopes.set(`${frame.session_id}:${String(frame.turn)}`, root);
      },
      () => [],
    );
    const host = await bootRuntime({
      onEvent: (event): void => {
        forward.event(event);
      },
      mount: (ctx): void => {
        ctx.on('system-prompt/assemble', () =>
          Promise.reject(new Error('Assembly failed before pre-step')),
        );
      },
      failureContext: settledFailureContext(
        forward,
        ({ sessionId, turn, publicationFailed }, write): void => {
          origin.run(
            publicationFailed === true ? undefined : scopes.get(`${sessionId}:${String(turn)}`),
            () => {
              write(publicationFailed);
            },
          );
        },
      ),
    });
    const heldSink = Logger.sink;
    Logger.configure({
      sink: (entry): void => {
        if (entry.event !== 'session.failed') return;
        captured.push({
          root: origin.getStore(),
          unknown: entry.payload['repair_origin'] === 'unknown',
          message: entry.failure?.message,
        });
        logged();
      },
    });
    try {
      const session = await host.runtime.create(host.sessionOptions());
      await forward.open({
        claim: {
          session_id: DSH_SESSION_ID.parse(session.id),
          epoch: 1,
          target: { kind: 'server' },
          runtime_instance: randomUUID(),
          connection_generation: randomUUID(),
        },
      });
      origin.run(root, () => {
        session.prompt({
          ...createUserMessage({
            content: [{ type: 'text', text: 'Investigate' }],
            source: { kind: 'user' },
          }),
          id: MessageId(randomUUID()),
        });
      });
      await publicationStarted;
      await session.drain();
      expect(captured).toEqual([]);
      release();
      await failureLogged;
      await forward.flush();
      expect(captured).toEqual([
        {
          root: repair && !refused ? root : undefined,
          unknown: refused,
          message: 'Assembly failed before pre-step',
        },
      ]);
    } finally {
      release();
      Logger.configure({ sink: heldSink });
      await host.dispose();
    }
  },
);

it('retains the original exception as unknown when failure context itself rejects', async () => {
  const observed: string[] = [];
  let logged = (): void => undefined;
  const failureLogged = new Promise<void>((resolve) => {
    logged = resolve;
  });
  const host = await bootRuntime({
    failureContext: () => Promise.reject(new Error('Context unavailable')),
  });
  const heldSink = Logger.sink;
  Logger.configure({
    sink: (entry): void => {
      if (entry.event === 'session.failure_context_failed') observed.push(entry.event);
      if (entry.event !== 'session.failed') return;
      expect(entry.payload['repair_origin']).toBe('unknown');
      expect(entry.failure?.message).toContain('Original failure');
      observed.push(entry.event);
      logged();
    },
  });
  try {
    const session = await host.runtime.create(host.sessionOptions());
    host.model.script({ kind: 'fail', failure: { code: 'AUTH', message: 'Original failure' } });
    session.text('Investigate');
    await session.drain();
    await failureLogged;
    expect(observed).toEqual(['session.failure_context_failed', 'session.failed']);
  } finally {
    Logger.configure({ sink: heldSink });
    await host.dispose();
  }
});
