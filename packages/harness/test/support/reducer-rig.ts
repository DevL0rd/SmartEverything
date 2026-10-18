import { randomUUID } from 'node:crypto';
import {
  AI_HARNESS_SESSION,
  DSH_SESSION_HEADER,
  DSH_SESSION_ID,
  DSH_SESSION_METADATA,
  HARNESS_NATIVE_FRAME,
} from '@smarteverything/domain';
import type { AiHarnessEvent, AiHarnessSession, DshSessionMetadata } from '@smarteverything/domain';
import { HarnessReducer } from '../../src/reducer';
import type { SessionOpening } from '../../src/reducer';

type Body = Record<string, unknown>;

const SERVER = { kind: 'server' } as const;
const EPOCH = 3;

export class ReducerRig {
  readonly sessionId = DSH_SESSION_ID.parse(randomUUID());
  readonly chatId = randomUUID();
  readonly history: unknown[] = [];
  durableSeq = -1;
  private readonly reducer = new HarnessReducer({
    metadata: (): DshSessionMetadata => this.metadata(),
    opening: (): SessionOpening => ({ session: this.base(), history: this.history }),
  });

  open(): readonly AiHarnessEvent[] {
    return this.send({ kind: 'open' });
  }

  send(body: Body): readonly AiHarnessEvent[] {
    return this.reducer.apply(
      HARNESS_NATIVE_FRAME.parse({ session_id: this.sessionId, epoch: EPOCH, ...body }),
    );
  }

  event(type: string, seq: number, rest: Body = {}): readonly AiHarnessEvent[] {
    return this.reducer.append(this.sessionId, { type, seq, ...rest });
  }

  private metadata(): DshSessionMetadata {
    return DSH_SESSION_METADATA.parse({
      chat_id: this.chatId,
      profile_id: randomUUID(),
      header: DSH_SESSION_HEADER.parse({
        version: 4,
        id: this.sessionId,
        createdAt: 1,
        isSeeded: false,
      }),
      inherited_event_count: 0,
      next_seq: this.history.length,
      durable_seq: this.durableSeq,
    });
  }

  private base(): AiHarnessSession {
    return AI_HARNESS_SESSION.parse({
      chat_id: this.chatId,
      session_id: this.sessionId,
      metadata: this.metadata(),
      target: SERVER,
      epoch: EPOCH,
      directory: { target: SERVER, path: '/home/test' },
      permission: { sandbox: 'danger-full-access', approval: 'never' },
      route: {
        route_id: randomUUID(),
        capability_revision: 'caps-1',
        model: 'scripted-model',
        effort: null,
      },
      state: 'working',
      interactions: [],
      work: [],
      failure: null,
    });
  }
}

export function states(
  events: readonly AiHarnessEvent[],
): readonly Extract<AiHarnessEvent, { kind: 'state' }>[] {
  return events.flatMap((event) => (event.kind === 'state' ? [event] : []));
}

export const USAGE_STREAM = [
  { type: 'chunk', time: 1, chunk: { type: 'usage', usage: { inputTokens: 40, outputTokens: 5 } } },
];

export function only(events: readonly AiHarnessEvent[]): AiHarnessEvent {
  const [event] = events;
  if (events.length !== 1 || event === undefined)
    throw new Error(`Expected exactly one event, got ${String(events.length)}.`);
  return event;
}

export function stateOf(
  events: readonly AiHarnessEvent[],
): Extract<AiHarnessEvent, { kind: 'state' }> {
  const event = only(events);
  if (event.kind !== 'state') throw new Error(`Expected a state event, got ${event.kind}.`);
  return event;
}

export function claimTurn(rig: ReducerRig, deliveryId: string, turn: number): void {
  rig.event('agent/inbox/spliced', 1, {
    data: { target: 'next-turn', inserted: [{ id: deliveryId }] },
  });
  rig.event('turn/start', 2, { data: { turn } });
  rig.send({ kind: 'input', message_id: deliveryId, turn });
}
