import { PHONE_APPROVAL_PUSH, PUSH_PAYLOAD_KEY } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushCommandChannel } from '../../src/extensions/push/commands';
import {
  MachineApprovalDeniedError,
  MachineApprovals,
  approverClients,
  type ApprovalRequest,
} from '../../src/machines/approval';
import { captureLogs, testLogger } from '../support/logs';
import { addClient } from '../support/socket-client';
import { testStore, type TestStore } from '../support/store';

let test: TestStore;
let channel: PushCommandChannel;
let approvals: MachineApprovals;
let sent: { readonly clientId: string; readonly requestId: string }[];
let owner: string;
let member: string;
let memberProfile: string;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  captureLogs();
  test = await testStore();
  owner = addClient(test, 'Owner phone', 'owner').id;
  member = addClient(test, 'Robin phone', 'member').id;
  memberProfile = test.store.profiles.create({ name: 'Robin' }).id;
  test.store.clients.useProfile(member, memberProfile);
  sent = [];
  channel = new PushCommandChannel();
  channel.attach((clientId, data) => {
    const payload = PHONE_APPROVAL_PUSH.parse(JSON.parse(data[PUSH_PAYLOAD_KEY] ?? '{}'));
    sent.push({ clientId, requestId: payload.requestId });
    return Promise.resolve({ outcome: 'sent' });
  });
  approvals = new MachineApprovals(channel, test.store, testLogger('machine'));
});

afterEach(async () => {
  vi.useRealTimers();
  await test.close();
});

function request(profileId: string | null): ApprovalRequest {
  return { action: 'unlock', machine: 'Desk', source: 'assistant', profileId };
}

describe('who is asked to approve', () => {
  it('asks the phones of the machine person first', () => {
    expect(approverClients(test.store, memberProfile)).toEqual([member]);
  });

  it('falls back to the owner phones when the person has no phone', () => {
    const nobody = test.store.profiles.create({ name: 'Sam' }).id;
    expect(approverClients(test.store, nobody)).toEqual([owner]);
    expect(approverClients(test.store, null)).toEqual([owner]);
  });
});

describe('approving a risky machine action from a phone', () => {
  it('lets the action go ahead when the asked phone allows it', async () => {
    const running = approvals.require(request(memberProfile));
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.map((item) => item.clientId)).toEqual([member]);
    const requestId = sent[0]?.requestId ?? '';
    expect(approvals.has(requestId)).toBe(true);
    approvals.answer(member, requestId, { ok: true, detail: 'Allowed' });
    await expect(running).resolves.toBeUndefined();
    expect(approvals.has(requestId)).toBe(false);
  });

  it('refuses with the phone words when the phone denies', async () => {
    const running = approvals.require(request(null));
    const failure = expect(running).rejects.toThrow(MachineApprovalDeniedError);
    await vi.advanceTimersByTimeAsync(0);
    approvals.answer(owner, sent[0]?.requestId ?? '', {
      ok: false,
      detail: 'Denied on the phone.',
    });
    await failure;
  });

  it('refuses when nobody answers within a minute', async () => {
    const running = approvals.require(request(null));
    const failure = expect(running).rejects.toThrow('within 60 s');
    await vi.advanceTimersByTimeAsync(60_000);
    await failure;
  });

  it('refuses at once when no phone can be reached', async () => {
    channel.attach(() => Promise.resolve({ outcome: 'no_target', reason: 'no push token' }));
    await expect(approvals.require(request(null))).rejects.toThrow('no phone could be reached');
  });

  it('does not accept an answer from a phone that was not asked', async () => {
    const running = approvals.require(request(memberProfile));
    const failure = expect(running).rejects.toThrow(MachineApprovalDeniedError);
    await vi.advanceTimersByTimeAsync(0);
    const requestId = sent[0]?.requestId ?? '';
    expect(() => {
      approvals.answer(owner, requestId, { ok: true, detail: 'Allowed' });
    }).toThrow('This phone was not asked');
    approvals.stop();
    await failure;
  });
});
