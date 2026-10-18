import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ApiError, harnessTargetKey } from '@smarteverything/domain';
import type {
  AiChatRow,
  AiHarnessHandoffRequest,
  AiHarnessInteraction,
  AiHarnessSwitchResult,
  AiHarnessTarget,
  HarnessRuntimeReceipt,
  HarnessRuntimeRequest,
} from '@smarteverything/domain';
import { HarnessService } from '../../../src/harness/service';
import { systemClock } from '../../../src/clock';
import { applyPendingMachine } from '../../../src/harness/pending-machine';
import { acknowledge, useRig, type FakeHost, type Rig } from './support/rig';
import { addMessage } from './support/native-conversation';

let rig: Rig;
useRig((made) => {
  rig = made;
});

async function openOn(host: FakeHost): Promise<{ chat: AiChatRow; epoch: number }> {
  const chat = rig.newChat(host.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(host.target, randomUUID(), open);
  return { chat: rig.opened.store.aiChats.chat(chat.id), epoch: open.claim.epoch };
}

function moveTo(
  host: FakeHost,
  change: Partial<AiHarnessHandoffRequest> = {},
): AiHarnessHandoffRequest {
  return { operation_id: randomUUID(), target: host.target, route: rig.route, ...change };
}

function switchChat(
  chat: AiChatRow,
  input: AiHarnessHandoffRequest,
): Promise<AiHarnessSwitchResult> {
  return rig.service.switch(rig.owner, chat.id, input);
}

function startTurn(chat: AiChatRow): void {
  const { store } = rig.opened;
  const sessionId = rig.service.binding(chat).session_id;
  if (sessionId === null) throw new Error('The chat must be opened first.');
  const question = addMessage(rig, chat.id, { role: 'person', text: 'work' });
  const answer = addMessage(rig, chat.id, { role: 'responder', text: '' });
  const event = store.assistantEvents.add({
    id: randomUUID(),
    kind: 'chat',
    chat_id: chat.id,
    message_id: question.id,
    profile_id: rig.owner.profileId,
    client_id: null,
    text: 'work',
  });
  store.harnessDeliveries.admit(event.id, sessionId, () => answer.id);
}

function targetOf(chat: AiChatRow): string {
  return harnessTargetKey(
    rig.service.binding(rig.opened.store.aiChats.chat(chat.id)).execution_target,
  );
}

function openedCwd(host: FakeHost): string | undefined {
  return host.requests.findLast(
    (request): request is Extract<HarnessRuntimeRequest, { kind: 'open' }> =>
      request.kind === 'open',
  )?.cwd;
}

describe('the hub session always works in the chat folder', () => {
  it('opens in the chat folder when a computer chat moves to the hub', async () => {
    const { chat } = await openOn(rig.desk);

    await switchChat(chat, moveTo(rig.hub));

    expect(openedCwd(rig.hub)).toBe(rig.service.chatFolder(chat.id));
  });

  it('ignores a directory asked for on the hub, so file tools stay inside the chat folder', async () => {
    const { chat } = await openOn(rig.desk);

    await switchChat(
      chat,
      moveTo(rig.hub, { directory: { target: rig.hub.target, path: '/home/someone' } }),
    );

    expect(openedCwd(rig.hub)).toBe(rig.service.chatFolder(chat.id));
  });
});

describe('switching machines when the chat is idle', () => {
  it('moves at once: the old machine closes, the new one opens and is told', async () => {
    const { chat } = await openOn(rig.hub);
    rig.calls.length = 0;

    const result = await switchChat(chat, moveTo(rig.desk));

    expect(rig.calls).toStrictEqual(['hub:close', 'desk:open', 'desk:note']);
    expect(result).toStrictEqual({
      state: 'applied',
      execution_target: rig.desk.target,
      pending_execution_target: null,
    });
  });

  it('tells the AI which machine it is on now and which it left', async () => {
    const { chat } = await openOn(rig.hub);

    await switchChat(chat, moveTo(rig.desk));

    const note = rig.desk.requests.find((request) => request.kind === 'note');
    expect(note).toMatchObject({
      text: 'Machine changed: you are now running on Desk (Linux), folder /home/test. Previous machine: Hub.',
    });
  });

  it('keeps the same native session and re-binds the chat to the new machine', async () => {
    const { chat, epoch } = await openOn(rig.hub);
    const before = rig.service.binding(chat).session_id;

    await switchChat(chat, moveTo(rig.desk));

    const after = rig.opened.store.aiChats.chat(chat.id);
    expect(rig.service.binding(after).session_id).toBe(before);
    expect(targetOf(chat)).toBe(harnessTargetKey(rig.desk.target));
    const session = rig.service.state(rig.owner, chat.id);
    expect(harnessTargetKey(session.target)).toBe(harnessTargetKey(rig.desk.target));
    expect(session.epoch).toBe(epoch + 1);
    expect(session.state).toBe('idle');
  });

  it('reopens the conversation on the new machine as a resume, never a fresh start', async () => {
    const { chat, epoch } = await openOn(rig.hub);

    await switchChat(chat, moveTo(rig.desk));

    const opened = rig.desk.requests.find(
      (request): request is Extract<HarnessRuntimeRequest, { kind: 'open' }> =>
        request.kind === 'open',
    );
    expect(opened?.chat_id).toBe(chat.id);
    expect(opened?.claim.epoch).toBe(epoch + 1);
  });

  it('can move back to the first machine afterwards', async () => {
    const { chat } = await openOn(rig.hub);
    await switchChat(chat, moveTo(rig.desk));

    const back = await switchChat(chat, moveTo(rig.hub));

    expect(back.state).toBe('applied');
    expect(targetOf(chat)).toBe('server');
  });

  it('answers a repeated request for the same move without moving again', async () => {
    const { chat } = await openOn(rig.hub);
    const input = moveTo(rig.desk);
    const first = await switchChat(chat, input);
    rig.calls.length = 0;

    const again = await switchChat(chat, input);

    expect(again).toStrictEqual(first);
    expect(rig.calls).toStrictEqual([]);
  });

  it('refuses a member starting work on a computer', async () => {
    const { chat } = await openOn(rig.hub);
    rig.calls.length = 0;

    await expect(
      rig.service.switch({ ...rig.owner, role: 'member' }, chat.id, moveTo(rig.desk)),
    ).rejects.toThrow(/authorized owner/u);
    expect(rig.calls).toStrictEqual([]);
  });

  it('refuses to move a chat that was never opened natively', async () => {
    const chat = rig.newChat(rig.hub.target);

    await expect(switchChat(chat, moveTo(rig.desk))).rejects.toThrow(/native/u);
  });

  it('changes nothing when the chosen machine is offline', async () => {
    const { chat } = await openOn(rig.hub);
    rig.service.directory.offline(rig.desk.target);
    rig.calls.length = 0;

    await expect(switchChat(chat, moveTo(rig.desk))).rejects.toThrow(/unavailable/u);

    expect(rig.calls).toStrictEqual([]);
    expect(targetOf(chat)).toBe('server');
    expect(rig.service.state(rig.owner, chat.id).state).toBe('idle');
  });

  it('refuses a second change while one is still in progress', async () => {
    const { chat } = await openOn(rig.hub);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = rig.service.directory.execute.bind(rig.service.directory);
    rig.service.directory.execute = async (
      target: AiHarnessTarget,
      id: string,
      request: HarnessRuntimeRequest,
    ): Promise<HarnessRuntimeReceipt> => {
      if (request.kind === 'close') await held;
      return execute(target, id, request);
    };
    const first = switchChat(chat, moveTo(rig.desk));

    await expect(switchChat(chat, moveTo(rig.desk))).rejects.toThrow(/already in progress/u);

    release();
    await first;
  });
});

describe('a machine change that goes wrong never strands the chat', () => {
  it('moves a chat whose opening client is a member, with no authority record left to check', async () => {
    const member = rig.opened.store.clients.create(
      { name: 'Guest', platform: 'android', role: 'member', tokenHash: 'b'.repeat(64) },
      true,
    );
    const chat = rig.newChat(rig.hub.target);
    const open = rig.service.prepare(rig.owner, chat.id, rig.authority, member.id);
    await rig.service.directory.execute(rig.hub.target, randomUUID(), open);

    const result = await switchChat(chat, moveTo(rig.desk));

    expect(result.state).toBe('applied');
    expect(targetOf(chat)).toBe(harnessTargetKey(rig.desk.target));
  });

  it('puts the chat back on the old machine, reopened and idle, when the new machine cannot open', async () => {
    const { chat, epoch } = await openOn(rig.hub);
    rig.desk.script = (request): HarnessRuntimeReceipt => {
      if (request.kind === 'open') throw new ApiError('conflict', 'Cannot open.');
      return acknowledge(request);
    };
    rig.calls.length = 0;

    await expect(switchChat(chat, moveTo(rig.desk))).rejects.toThrow(/Cannot open/u);

    expect(rig.calls.at(-1)).toBe('hub:open');
    expect(targetOf(chat)).toBe('server');
    const session = rig.service.state(rig.owner, chat.id);
    expect(session.state).toBe('idle');
    expect(session.epoch).toBeGreaterThan(epoch);
  });

  it('puts the chat back when the old machine does not confirm it stopped', async () => {
    const { chat } = await openOn(rig.hub);
    let closes = 0;
    rig.hub.script = (request): HarnessRuntimeReceipt | undefined => {
      if (request.kind !== 'close') return undefined;
      closes += 1;
      return closes === 1 ? { ...acknowledge(request), state: 'accepted' } : undefined;
    };

    await expect(switchChat(chat, moveTo(rig.desk))).rejects.toThrow(/did not confirm/u);

    expect(rig.calls).not.toContain('desk:open');
    expect(targetOf(chat)).toBe('server');
    expect(rig.service.state(rig.owner, chat.id).state).toBe('idle');
  });

  it('keeps the chat on its old machine, not switching, even when it cannot be reopened there', async () => {
    const { chat } = await openOn(rig.hub);
    rig.desk.script = (request): HarnessRuntimeReceipt => {
      if (request.kind === 'open') throw new ApiError('conflict', 'Cannot open.');
      return acknowledge(request);
    };
    let opens = 0;
    rig.hub.script = (request): HarnessRuntimeReceipt | undefined => {
      if (request.kind !== 'open') return undefined;
      opens += 1;
      throw new ApiError('conflict', 'Hub is busy.');
    };

    await expect(switchChat(chat, moveTo(rig.desk))).rejects.toThrow(/Cannot open/u);

    expect(opens).toBe(1);
    expect(targetOf(chat)).toBe('server');
    expect(rig.service.state(rig.owner, chat.id).state).not.toBe('switching');
  });

  it('moves a chat whose old machine is gone, without waiting for it', async () => {
    const { chat } = await openOn(rig.desk);
    rig.service.directory.offline(rig.desk.target);
    rig.calls.length = 0;

    const result = await switchChat(chat, moveTo(rig.hub));

    expect(result.state).toBe('applied');
    expect(rig.calls).toStrictEqual(['hub:open', 'hub:note']);
    expect(targetOf(chat)).toBe('server');
  });
});

describe('a hub restart in the middle of a machine change', () => {
  it('ends the change as failed, so the chat is not left switching', async () => {
    const { chat } = await openOn(rig.hub);
    const session = rig.service.state(rig.owner, chat.id);
    rig.opened.store.harnessCoordination.markSwitching(session.session_id);
    expect(rig.service.state(rig.owner, chat.id).state).toBe('switching');

    const restarted = new HarnessService(rig.opened.store, rig.service.routes, () => undefined, {
      dataDirectory: rig.opened.directory,
      clock: systemClock,
    });

    const after = restarted.state(rig.owner, chat.id);
    expect(after.state).toBe('failed');
    expect(after.failure?.message).toContain('hub restarted');
  });
});

describe('switching machines while the AI works', () => {
  it('records the target and leaves everything running where it is', async () => {
    const { chat } = await openOn(rig.hub);
    startTurn(chat);
    rig.calls.length = 0;

    const result = await switchChat(chat, moveTo(rig.desk));

    expect(result).toStrictEqual({
      state: 'pending',
      execution_target: rig.hub.target,
      pending_execution_target: rig.desk.target,
    });
    expect(rig.opened.store.aiChats.chat(chat.id).pending_execution_target).toStrictEqual(
      rig.desk.target,
    );
    expect(rig.calls).toStrictEqual([]);
    expect(targetOf(chat)).toBe('server');
  });

  it('forgets the pending move when the person picks the machine it is already on', async () => {
    const { chat } = await openOn(rig.hub);
    startTurn(chat);
    await switchChat(chat, moveTo(rig.desk));

    const result = await switchChat(chat, moveTo(rig.hub));

    expect(result).toStrictEqual({
      state: 'cleared',
      execution_target: rig.hub.target,
      pending_execution_target: null,
    });
  });

  it('moves at the tool call: interrupts the turn, closes the old machine, opens the new one', async () => {
    const { chat } = await openOn(rig.hub);
    startTurn(chat);
    await switchChat(chat, moveTo(rig.desk));
    rig.calls.length = 0;

    const outcome = await applyPendingMachine(rig.service, chat.id, true);

    expect(rig.calls).toStrictEqual(['hub:interrupt', 'hub:close', 'desk:open']);
    expect(outcome).toMatchObject({
      state: 'moved',
      note: 'Machine changed: you are now running on Desk (Linux), folder /home/test. Previous machine: Hub.',
    });
    expect(rig.opened.store.aiChats.chat(chat.id).pending_execution_target).toBeNull();
    expect(targetOf(chat)).toBe(harnessTargetKey(rig.desk.target));
  });

  it('keeps working on the old machine, and says so, when the pending move fails', async () => {
    const { chat } = await openOn(rig.hub);
    startTurn(chat);
    await switchChat(chat, moveTo(rig.desk));
    rig.desk.script = (request): HarnessRuntimeReceipt => {
      if (request.kind === 'open') throw new ApiError('conflict', 'Cannot open.');
      return acknowledge(request);
    };

    const outcome = await applyPendingMachine(rig.service, chat.id, true);

    expect(outcome).toMatchObject({ state: 'restored', reason: 'Cannot open.' });
    expect(outcome?.state === 'restored' ? outcome.note : '').toMatch(
      /Machine change to Desk failed \(Cannot open\.\)\. You are still running on Hub \(Linux\)\./u,
    );
    expect(rig.opened.store.aiChats.chat(chat.id).pending_execution_target).toBeNull();
    expect(targetOf(chat)).toBe('server');
  });

  it('asks the question the AI was waiting on again on the new machine', async () => {
    const { chat } = await openOn(rig.hub);
    startTurn(chat);
    await switchChat(chat, moveTo(rig.desk));
    const waiting: AiHarnessInteraction = {
      id: 'waiting-1',
      epoch: 1,
      kind: 'question',
      request: { questions: [{ id: 'pick', question: 'Which folder?' }] },
    };
    rig.hub.script = (request): HarnessRuntimeReceipt | undefined =>
      request.kind === 'interrupt'
        ? { ...acknowledge(request), interactions: [waiting] }
        : undefined;

    await applyPendingMachine(rig.service, chat.id, true);

    const opened = rig.desk.requests.find(
      (request): request is Extract<HarnessRuntimeRequest, { kind: 'open' }> =>
        request.kind === 'open',
    );
    expect(opened?.interactions).toStrictEqual([waiting]);
  });

  it('asks it again on the old machine when the move fails and the chat goes back', async () => {
    const { chat } = await openOn(rig.hub);
    startTurn(chat);
    await switchChat(chat, moveTo(rig.desk));
    const waiting: AiHarnessInteraction = {
      id: 'waiting-1',
      epoch: 1,
      kind: 'permission',
      request: { tool_name: 'bash' },
    };
    rig.hub.script = (request): HarnessRuntimeReceipt | undefined =>
      request.kind === 'interrupt'
        ? { ...acknowledge(request), interactions: [waiting] }
        : undefined;
    rig.desk.script = (request): HarnessRuntimeReceipt => {
      if (request.kind === 'open') throw new ApiError('conflict', 'Cannot open.');
      return acknowledge(request);
    };

    await applyPendingMachine(rig.service, chat.id, true);

    const reopened = rig.hub.requests.filter((request) => request.kind === 'open').at(-1);
    expect(reopened?.kind === 'open' ? reopened.interactions : undefined).toStrictEqual([waiting]);
  });

  it('opens the new machine without questions when none were waiting', async () => {
    const { chat } = await openOn(rig.hub);

    await switchChat(chat, moveTo(rig.desk));

    const opened = rig.desk.requests.find(
      (request): request is Extract<HarnessRuntimeRequest, { kind: 'open' }> =>
        request.kind === 'open',
    );
    expect(opened?.interactions).toBeUndefined();
  });

  it('applies nothing when no move is waiting', async () => {
    const { chat } = await openOn(rig.hub);

    expect(await applyPendingMachine(rig.service, chat.id, true)).toBeUndefined();
  });

  it('asks to wait before the model or folder change, which needs a stopped chat', async () => {
    const { chat } = await openOn(rig.hub);
    startTurn(chat);

    await expect(
      switchChat(chat, moveTo(rig.desk, { route: { ...rig.route, model: 'model-b' } })),
    ).rejects.toThrow(/Wait for the reply/u);
  });
});
