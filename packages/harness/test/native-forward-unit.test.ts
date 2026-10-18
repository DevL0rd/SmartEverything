import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DSH_SESSION_ID } from '@smarteverything/domain';
import type {
  AiHarnessInteraction,
  AiHarnessSession,
  DshSessionId,
  HarnessNativeFrame,
  HarnessRuntimeRequest,
} from '@smarteverything/domain';
import { describeFailure } from '@smarteverything/logging';
import { nativeEvents, nativeHeader } from '../src/persistence/validation';
import { NativeForward } from '../src/process/native-forward';

function kinds(frames: readonly HarnessNativeFrame[]): readonly string[] {
  return frames.map((frame) => frame.kind);
}

describe('what the forwarder does on its own', () => {
  function forwarder(pending: () => readonly AiHarnessInteraction[] = () => []): {
    readonly forward: NativeForward;
    readonly sent: HarnessNativeFrame[];
    readonly session: DshSessionId;
  } {
    const sent: HarnessNativeFrame[] = [];
    const forward = new NativeForward((frame) => {
      sent.push(frame);
      return Promise.resolve();
    }, pending);
    return { forward, sent, session: DSH_SESSION_ID.parse(randomUUID()) };
  }

  function openRequest(session: DshSessionId): Extract<HarnessRuntimeRequest, { kind: 'open' }> {
    return {
      kind: 'open',
      chat_id: randomUUID(),
      claim: {
        session_id: session,
        target: { kind: 'server' },
        runtime_instance: randomUUID(),
        connection_generation: randomUUID(),
        epoch: 4,
      },
      route: {
        route_id: randomUUID(),
        capability_revision: 'caps-1',
        model: 'scripted-model',
        effort: null,
      },
      permission: { sandbox: 'danger-full-access', approval: 'never' },
      cwd: '/home/test',
      mode: 'create',
    };
  }

  it('forwards the full pending list with the request that was added and then the emptied list', async () => {
    const asked: AiHarnessInteraction = {
      id: 'ask-1',
      epoch: 4,
      kind: 'permission',
      request: { tool_name: 'write' },
    };
    let pending: readonly AiHarnessInteraction[] = [];
    const { forward, sent, session } = forwarder(() => pending);
    await forward.open(openRequest(session));

    pending = [asked];
    forward.interaction(session, asked);
    pending = [];
    forward.interaction(session, null);
    await forward.flush(session);

    expect(sent.slice(1)).toMatchObject([
      { kind: 'interactions', interactions: [asked], added: asked },
      { kind: 'interactions', interactions: [], added: null },
    ]);
  });

  it('forwards a permission change and a project binding in order', async () => {
    const { forward, sent, session } = forwarder();
    await forward.open(openRequest(session));
    const operation = randomUUID();
    const permission = { sandbox: 'read-only', approval: 'on-request' } as const;
    const binding = { kind: 'managed', chat_id: randomUUID() } as const;

    forward.permission(session, operation, permission);
    forward.workspace(session, binding);
    await forward.flush();

    expect(sent.slice(1)).toMatchObject([
      { kind: 'permission', operation_id: operation, permission },
      { kind: 'workspace', storage_binding: binding },
    ]);
  });

  it('forwards nothing for a session that is not open and nothing after it closed', async () => {
    const { forward, sent, session } = forwarder();
    forward.interaction(session, null);
    await forward.flush(session);
    await forward.open(openRequest(session));
    forward.close(session);
    forward.close(session);
    forward.interaction(session, null);
    await forward.flush(session);

    expect(kinds(sent)).toStrictEqual(['open', 'close']);
  });

  it('forwards the small facts of the runtime as frames', async () => {
    const { forward, sent, session } = forwarder();
    await forward.open(openRequest(session));
    const revision = 'b'.repeat(64);

    forward.event({ kind: 'commands', sessionId: session, revision });
    forward.event({ kind: 'context', sessionId: session, estimate: 90 });
    forward.event({
      kind: 'error',
      sessionId: session,
      failure: describeFailure(new Error('boom')),
    });
    forward.event({ kind: 'input', sessionId: session, messageId: 'm1', turn: 2 });
    forward.event({ kind: 'discarded', sessionId: session, messageId: 'm2' });
    await forward.flush(session);

    expect(sent.slice(1)).toMatchObject([
      { kind: 'commands', revision },
      { kind: 'context', estimate: 90 },
      { kind: 'error', message: 'boom' },
      { kind: 'input', message_id: 'm1', turn: 2 },
      { kind: 'discarded', message_id: 'm2' },
    ]);
  });

  it('settles the machine state after a command or a compaction finished', async () => {
    const { forward, sent, session } = forwarder();
    const work: AiHarnessSession['work'] = [
      { kind: 'turn', id: session, reason: 'Native turn is running.' },
    ];
    let running = true;
    forward.workFor = (): AiHarnessSession['work'] => (running ? work : []);
    await forward.open(openRequest(session));
    const header = nativeHeader({ version: 4, id: session, createdAt: 1, isSeeded: false });
    const [done, compacted] = nativeEvents(header, [
      { type: 'command/done', seq: 0, time: 1, data: {} },
      { type: 'compaction/end', seq: 1, time: 2, data: {} },
    ]);
    if (done === undefined || compacted === undefined) throw new Error('Events were not built.');
    const flushed: string[] = [];
    forward.idle = (id): Promise<void> => {
      flushed.push(id);
      return Promise.resolve();
    };

    forward.event({ kind: 'session', sessionId: session, event: done });
    await forward.flush(session);
    running = false;
    forward.event({ kind: 'session', sessionId: session, event: compacted });
    await forward.flush(session);

    expect(sent.slice(1)).toMatchObject([
      { kind: 'status', status: 'running', work },
      { kind: 'status', status: 'idle', work: [] },
    ]);
    expect(flushed).toHaveLength(3);
  });

  it('makes the log durable after the events the hub reduces and after no others', async () => {
    const { forward, sent, session } = forwarder();
    await forward.open(openRequest(session));
    const header = nativeHeader({ version: 4, id: session, createdAt: 1, isSeeded: false });
    const events = nativeEvents(header, [
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      { type: 'turn/end', seq: 1, time: 2, data: { turn: 1, reason: { kind: 'completed' } } },
      { type: 'step/start', seq: 2, time: 3, data: { turn: 1, step: 1 } },
    ]);
    const flushed: string[] = [];
    forward.idle = (id): Promise<void> => {
      flushed.push(id);
      return Promise.resolve();
    };

    for (const event of events) forward.event({ kind: 'session', sessionId: session, event });
    await forward.flush(session);

    expect(flushed).toStrictEqual([session, session]);
    expect(kinds(sent)).toStrictEqual(['open']);
  });

  it('lets the frames of a closed chat reach the hub before the chat opens again', async () => {
    const sent: HarnessNativeFrame[] = [];
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const forward = new NativeForward(
      async (frame) => {
        if (frame.kind === 'close') await gate;
        sent.push(frame);
      },
      () => [],
    );
    const session = DSH_SESSION_ID.parse(randomUUID());
    await forward.open(openRequest(session));
    forward.close(session);

    const reopening = forward.open(openRequest(session));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(kinds(sent)).toStrictEqual(['open']);
    release();
    await reopening;

    expect(kinds(sent)).toStrictEqual(['open', 'close', 'open']);
  });

  it('has nothing to wait for when no session ever forwarded anything', async () => {
    const { forward, session } = forwarder();

    await expect(forward.flush(session)).resolves.toBeUndefined();
    await expect(forward.admit(session)).resolves.toBeUndefined();
  });
});
