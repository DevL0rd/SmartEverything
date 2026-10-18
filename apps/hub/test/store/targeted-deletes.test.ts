import { randomUUID } from 'node:crypto';
import { TALK_NEW_CHANNEL } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DevicesRepository } from '../../src/store/repositories/devices';
import { InfraredRepository } from '../../src/store/repositories/infrared';
import { TalkRepository } from '../../src/store/repositories/talk';
import { countedStore, type CountedStore } from '../support/counted-store';
import { captureLogs } from '../support/logs';

let counted: CountedStore;
let infrared: InfraredRepository;
let talk: TalkRepository;
let blaster: string;

beforeEach(async () => {
  captureLogs();
  counted = await countedStore();
  infrared = new InfraredRepository(counted.context);
  talk = new TalkRepository(counted.context);
  const [device] = new DevicesRepository(counted.context).upsert([
    {
      provider: 'tuya',
      externalId: 'blaster',
      parentId: null,
      kind: 'ir_blaster',
      name: 'Blaster',
      model: 'b',
      manufacturer: 'Tuya',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  blaster = device?.id ?? '';
});

afterEach(async () => {
  await counted.close();
});

function remoteWith(buttons: number, name: string): string {
  const remote = infrared.addRemote({ blaster_id: blaster, name, category: 'tv', brand: null });
  for (let index = 0; index < buttons; index += 1) {
    infrared.saveCode({
      remote_id: remote.id,
      button: `b${String(index)}`,
      format: 'pulses',
      code: '1,2',
    });
  }
  return remote.id;
}

function statementsFor(work: () => void): number {
  const before = counted.statements();
  work();
  return counted.statements() - before;
}

describe('removeRemote', () => {
  it('removes only its own codes and reads them with one query whatever their number', () => {
    const small = remoteWith(1, 'Small');
    const large = remoteWith(25, 'Large');
    const other = remoteWith(3, 'Other');
    const forSmall = statementsFor(() => {
      infrared.removeRemote(small);
    });
    const forLarge = statementsFor(() => {
      infrared.removeRemote(large);
    });
    expect(forLarge).toBe(forSmall);
    expect(infrared.codes().map((code) => code.remote_id)).toStrictEqual([other, other, other]);
  });
});

const PEOPLE = Array.from({ length: 12 }, () => randomUUID());

function personAt(index: number): string {
  return PEOPLE[index] ?? '';
}

function channelWith(people: number, name: string): string {
  const { members, ...input } = TALK_NEW_CHANNEL.parse({ name, ai_listens: false });
  expect(members).toStrictEqual([]);
  const channel = talk.createChannel(input);
  for (let index = 0; index < people; index += 1) {
    talk.setMember({ channelId: channel.id, kind: 'client', memberId: personAt(index) }, true, {
      label: 'Phone',
      detail: null,
    });
    talk.startMessage({
      id: randomUUID(),
      channel_id: channel.id,
      speaker_kind: 'client',
      speaker_id: personAt(index),
      speaker_label: 'Phone',
      speaker_detail: null,
      kind: 'talk',
      started_at: '2026-10-08T10:00:00.000Z',
    });
  }
  return channel.id;
}

describe('removeChannel', () => {
  it('returns its messages and reads members and messages with one query each whatever their number', () => {
    const small = channelWith(1, 'Small');
    const large = channelWith(12, 'Large');
    const other = channelWith(2, 'Other');
    let removed = 0;
    const forSmall = statementsFor(() => {
      removed += talk.removeChannel(small).length;
    });
    const forLarge = statementsFor(() => {
      removed += talk.removeChannel(large).length;
    });
    expect(removed).toBe(13);
    expect(forLarge).toBe(forSmall);
    expect(talk.members().map((member) => member.channel_id)).toStrictEqual([other, other]);
    expect(talk.messages({ limit: 100 })).toHaveLength(2);
  });
});

describe('member relabel and forget', () => {
  it('relabels and forgets only the member asked for', () => {
    const first = channelWith(2, 'First');
    const second = channelWith(2, 'Second');
    talk.relabel('client', personAt(0), { label: 'Alice', detail: 'Pixel' });
    const labelsOf = (memberId: string): string[] =>
      talk
        .members()
        .filter((member) => member.member_id === memberId)
        .map((member) => member.label);
    expect(labelsOf(personAt(0))).toStrictEqual(['Alice', 'Alice']);
    expect(labelsOf(personAt(1))).toStrictEqual(['Phone', 'Phone']);
    talk.forgetMember('client', personAt(0));
    expect(talk.members().map((member) => member.member_id)).toStrictEqual([
      personAt(1),
      personAt(1),
    ]);
    expect(new Set(talk.members().map((member) => member.channel_id))).toStrictEqual(
      new Set([first, second]),
    );
  });
});
