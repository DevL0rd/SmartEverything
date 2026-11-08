import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { DSH_SESSION_EVENTS_WRITE, DSH_SESSION_HEADER } from '@smarteverything/domain';
import type { DshSessionEvent, DshWriterClaim } from '@smarteverything/domain';
import { ConversationLog } from '../../../src/assistant/conversation-log';
import { adoptNativeChild } from '../../../src/assistant/engines/dsh/children';
import { wakeInterruptedParents } from '../../../src/assistant/engines/dsh/helper-wake';
import { harnessRig, type Rig } from './support/rig';

let rig: Rig | undefined;
afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const NOW = '2026-10-25T05:00:00.000Z';

interface World {
  readonly rig: Rig;
  readonly parentSession: string;
  readonly childSession: string;
  readonly childClaim: DshWriterClaim;
  readonly append: (claim: DshWriterClaim, events: readonly DshSessionEvent[]) => void;
}

function world(made: Rig): World {
  const { store } = made.opened;
  const chat = made.newChat(made.hub.target);
  const open = made.service.prepare(made.owner, chat.id, made.authority, made.clientId);
  const host = made.service.directory.get(made.hub.target).host;
  const principal = made.service.hostPrincipal(made.owner.profileId, host);
  store.assistantChat.addMessage({
    profile_id: chat.profile_id,
    client_id: made.clientId,
    role: 'person',
    kind: 'text',
    author: 'Sam',
    text: 'Delegate the slow job.',
    attachments: [],
    state: null,
    reason: null,
    steps: [],
    step_states: [],
    reply_to: null,
    quote: null,
    chat_id: chat.id,
    origin: null,
    embeds: [],
    cost_micros: 0,
    model: null,
  });
  const header = DSH_SESSION_HEADER.parse({
    version: 4,
    id: randomUUID(),
    createdAt: Date.now(),
    cwd: '/tmp/work',
    isSeeded: false,
    parentSession: open.claim.session_id,
    origin: 'subagent',
    delegationDepth: 1,
  });
  const child = adoptNativeChild(store, new ConversationLog(store), {
    principal,
    attach: {
      target: open.claim.target,
      runtime_instance: open.claim.runtime_instance,
      connection_generation: open.claim.connection_generation,
    },
    header,
    inherited: 0,
    label: 'Slow job',
    task: 'Do the slow part and report.',
    now: NOW,
  });
  const append = (claim: DshWriterClaim, events: readonly DshSessionEvent[]): void => {
    store.dshSessions.append(
      { claim, operation_id: randomUUID(), events: DSH_SESSION_EVENTS_WRITE.parse(events) },
      principal,
    );
  };
  const parentClaim = store.dshSessions.attached(open.claim.session_id, made.owner.profileId);
  if (parentClaim === null) throw new Error('The parent lost its writer.');
  const parentSeq = store.dshSessions.stat(open.claim.session_id, made.owner.profileId)?.next_seq;
  append(parentClaim, [
    {
      type: 'subagent/catalog',
      seq: parentSeq ?? 0,
      time: 1_000,
      data: {
        version: 0,
        childId: header.id,
        childCreatedAt: header.createdAt,
        mode: 'continuable',
        label: 'Slow job',
      },
    },
  ]);
  return {
    rig: made,
    parentSession: open.claim.session_id,
    childSession: header.id,
    childClaim: child.opened.claim,
    append,
  };
}

function childSeq(made: World): number {
  return (
    made.rig.opened.store.dshSessions.stat(made.childSession, made.rig.owner.profileId)?.next_seq ??
    0
  );
}

function reopened(made: World): boolean {
  return made.rig.hub.requests.some(
    (request) => request.kind === 'open' && request.claim.session_id === made.parentSession,
  );
}

describe('a parent whose helper was cut off by a restart', () => {
  it('is reopened on its host so the helper notice can wake it', async () => {
    rig = await harnessRig();
    const made = world(rig);
    made.append(made.childClaim, [
      { type: 'turn/start', seq: childSeq(made), time: 1_100, data: { turn: 1 } },
    ]);

    await wakeInterruptedParents(rig.service, rig.hub.target);

    expect(reopened(made)).toBe(true);
  });

  it('stays closed when every helper turn ended', async () => {
    rig = await harnessRig();
    const made = world(rig);
    const seq = childSeq(made);
    made.append(made.childClaim, [
      { type: 'turn/start', seq, time: 1_100, data: { turn: 1 } },
      {
        type: 'turn/end',
        seq: seq + 1,
        time: 1_200,
        data: { turn: 1, reason: { kind: 'completed' } },
      },
    ]);

    await wakeInterruptedParents(rig.service, rig.hub.target);

    expect(reopened(made)).toBe(false);
  });
});
