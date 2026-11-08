import { repairLogOrigin } from '../../../src/server/repair-wiring';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { harnessFailureContext } from '../../../src/harness/failure-context';
import { queueEvent } from '../../../src/assistant/request-events';
import {
  currentExecutionAuthority,
  withExecutionAuthority,
} from '../../../src/assistant/turn-authority';
import { useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

it('uses the exact durable claimed turn without latest grant or stale driver provenance', () => {
  const { store } = rig.opened;
  const chat = rig.newChat(rig.hub.target);
  const sessionId = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId).claim
    .session_id;
  const repairId = randomUUID();
  const input = {
    kind: 'chat' as const,
    chat_id: chat.id,
    message_id: null,
    profile_id: chat.profile_id,
    client_id: null,
    text: 'Investigate',
  };
  const repair = queueEvent(store, { ...input, id: repairId }, undefined, repairId);
  const ordinary = queueEvent(store, { ...input, id: randomUUID() });
  store.harnessRecovery.claimTurn(sessionId, 1, repair.id);
  store.harnessRecovery.claimTurn(sessionId, 2, ordinary.id);
  store.harnessRecovery.claimTurn(sessionId, 3, ordinary.id);
  store.harnessRecovery.claimTurn(sessionId, 3, repair.id);
  store.harnessRecovery.claimTurn(sessionId, 3, repair.id);
  expect(store.harnessRecovery.turnAuthorities(sessionId, 3)).toHaveLength(2);
  const failureContext = harnessFailureContext(store);
  const roots: (string | undefined)[] = [];
  const unknown: (true | undefined)[] = [];
  const capture = (unattributed?: true): void => {
    unknown.push(unattributed);
    roots.push(currentExecutionAuthority()?.repair_origin);
  };
  const stale = store.harnessRecovery.authority(repair.id);
  withExecutionAuthority(stale, () => {
    failureContext({ sessionId, turn: 2 }, capture);
    failureContext({ sessionId, turn: 1 }, capture);
    failureContext({ sessionId, turn: 3 }, capture);
    failureContext({ sessionId, turn: 4 }, capture);
    failureContext({ sessionId: randomUUID(), turn: 1 }, capture);
    failureContext({ sessionId, turn: 1, publicationFailed: true }, capture);
  });
  expect(roots).toEqual([undefined, repairId, repairId, undefined, undefined, undefined]);
  expect(unknown).toEqual([undefined, undefined, undefined, undefined, undefined, true]);
  store.aiChats.remove(chat.id);
  expect(store.harnessRecovery.turnAuthorities(sessionId, 3)).toEqual([]);
});

it('holds explicitly unattributed failure logs while retaining ordinary untracked errors', () => {
  const record = {
    source: 'hub:service',
    scope: 'hub.harness',
    event: 'session.failed',
    payload: { repair_origin: 'unknown' },
  };
  expect(repairLogOrigin(record)).toBe('unknown');
  expect(repairLogOrigin({ ...record, payload: {} })).toBe('ordinary');
  expect(repairLogOrigin({ ...record, payload: {}, repairOrigin: randomUUID() })).toBe('repair');
  expect(repairLogOrigin({ ...record, event: 'other.failure' })).toBe('ordinary');
});
