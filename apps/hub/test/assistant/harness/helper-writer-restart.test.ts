import type { DshWriterClaim } from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { DSH_SESSION_HEADER, DSH_SESSION_EVENTS_WRITE } from '@smarteverything/domain';
import { ConversationLog } from '../../../src/assistant/conversation-log';
import { adoptSubagentSession } from '../../../src/assistant/engines/dsh/children';
import { resumeHelperWriter } from '../../../src/harness/helper-writer-renewal';
import { harnessRig, type Rig } from './support/rig';

let rig: Rig | undefined;
afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

async function interruptedChild(): Promise<{
  readonly made: Rig;
  readonly store: Rig['opened']['store'];
  readonly child: DshWriterClaim;
  readonly parent: DshWriterClaim;
  readonly principal: ReturnType<Rig['service']['hostPrincipal']>;
  readonly before: ReturnType<Rig['service']['hostPrincipal']>;
}> {
  const made = await harnessRig();
  rig = made;
  const { service } = made;
  const store = made.opened.store;
  const chat = made.newChat(made.hub.target);
  const opened = service.prepare(made.owner, chat.id, made.authority, made.clientId);
  const host = service.directory.get(made.hub.target).host;
  const before = service.hostPrincipal(made.owner.profileId, host);
  const child = adoptSubagentSession(store, new ConversationLog(store), {
    principal: before,
    parentClaim: opened.claim,
    parentGrant: service.storage.grant(opened.claim.session_id),
    header: DSH_SESSION_HEADER.parse({
      version: 4,
      id: randomUUID(),
      createdAt: 1,
      isSeeded: false,
      origin: 'subagent',
      parentSession: opened.claim.session_id,
    }),
    inherited: 0,
    now: new Date().toISOString(),
  });
  store.dshSessions.append(
    {
      claim: child.opened.claim,
      operation_id: randomUUID(),
      events: DSH_SESSION_EVENTS_WRITE.parse([
        { type: 'subagent/descriptor', seq: 0, time: 1, data: { mode: 'continuable' } },
        { type: 'turn/start', seq: 1, time: 2, data: { turn: 1 } },
      ]),
    },
    before,
  );
  const principal = {
    ...before,
    runtime_instance: randomUUID(),
    connection_generation: randomUUID(),
  };
  const parent = store.dshSessions.acquire(
    {
      session_id: opened.claim.session_id,
      target: principal.target,
      runtime_instance: principal.runtime_instance,
      connection_generation: principal.connection_generation,
    },
    principal,
  ).claim;
  return { made, store, child: child.opened.claim, parent, principal, before };
}

describe('retired helper writer recovery', () => {
  it('renews an interrupted child without a completed-turn proof, retaining its events and ID', async () => {
    const world = await interruptedChild();
    const { store, child, parent, principal, made } = world;
    const events = store.dshSessions.readAll(child.session_id, made.owner.profileId);
    const resumed = resumeHelperWriter(store, {
      id: child.session_id,
      parent,
      principal,
      grant: made.service.storage.grant(child.session_id),
    });
    expect(resumed.claim).toEqual({
      ...child,
      runtime_instance: principal.runtime_instance,
      connection_generation: principal.connection_generation,
      epoch: child.epoch + 1,
    });
    expect(store.dshSessions.readAll(child.session_id, made.owner.profileId)).toEqual(events);
    expect(() => store.dshSessions.verifyWriter(child, world.before)).toThrow();
    expect(made.service.storage.grant(child.session_id).generation).toBe(
      principal.connection_generation,
    );
    const again = resumeHelperWriter(store, {
      id: child.session_id,
      parent,
      principal,
      grant: made.service.storage.grant(child.session_id),
    });
    expect(again.claim).toEqual(resumed.claim);
  });

  it('rejects a child whose direct-parent lineage differs', async () => {
    const { store, child, principal, made } = await interruptedChild();
    const other = made.newChat(made.hub.target);
    const opened = made.service.prepare(made.owner, other.id, made.authority, made.clientId);
    const unrelated = store.dshSessions.acquire(
      {
        session_id: opened.claim.session_id,
        target: principal.target,
        runtime_instance: principal.runtime_instance,
        connection_generation: principal.connection_generation,
      },
      principal,
    ).claim;
    expect(() =>
      resumeHelperWriter(store, {
        id: child.session_id,
        parent: unrelated,
        principal,
        grant: made.service.storage.grant(child.session_id),
      }),
    ).toThrow('direct parent');
    expect(store.dshSessions.attached(child.session_id, made.owner.profileId)).toEqual(child);
  });
  it('rejects a stale parent without renewing the child', async () => {
    const { store, child, parent, principal, made } = await interruptedChild();
    expect(() =>
      resumeHelperWriter(store, {
        id: child.session_id,
        parent: { ...parent, epoch: parent.epoch - 1 },
        principal,
        grant: made.service.storage.grant(child.session_id),
      }),
    ).toThrow();
    expect(store.dshSessions.attached(child.session_id, made.owner.profileId)).toEqual(child);
  });
});
