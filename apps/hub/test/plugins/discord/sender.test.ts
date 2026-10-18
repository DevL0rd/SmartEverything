import { describe, expect, it } from 'vitest';
import { DiscordInputError, DiscordPolicyError } from '../../../src/plugins/builtin/discord/errors';
import { Sender } from '../../../src/plugins/builtin/discord/sender';
import { StatusBoard } from '../../../src/plugins/builtin/discord/status-board';
import {
  CHANNEL,
  GUEST_ID,
  nothing,
  OTHER_CHANNEL,
  OWNER_CALLER,
  originOf,
  worldOf,
  type World,
} from './fakes';

function senderOf(world: World): Sender {
  return new Sender({
    rest: world.rest,
    policy: world.policy,
    authority: world.authority,
    channels: world.channels,
    interactions: world.interactions,
    statuses: new StatusBoard(
      () => Promise.resolve(null),
      () => Promise.resolve(null),
      nothing,
    ),
    now: Date.now,
    report: nothing,
  });
}

function nonceOf(body: unknown): unknown {
  return typeof body === 'object' && body !== null && 'nonce' in body ? body.nonce : undefined;
}

describe('sending to Discord', () => {
  it('uses Discord nonce dedupe and writes nothing besides the origin row', async () => {
    const world = worldOf();
    const sender = senderOf(world);
    world.origins.capture(originOf(1));
    const rowsAfterCapture = world.records.writes.length;
    const input = { eventId: originOf(1).id, content: 'hello', files: [] };
    await sender.send(input);
    await sender.send(input);
    const posts = world.rest.sentTo(`/channels/${CHANNEL}/messages`);
    expect(posts).toHaveLength(2);
    expect(posts.map((post) => post.body)).toMatchObject([
      { enforce_nonce: true, message_reference: { fail_if_not_exists: false } },
      { enforce_nonce: true },
    ]);
    expect(String(nonceOf(posts[0]?.body)).length).toBeLessThanOrEqual(25);
    expect(nonceOf(posts[0]?.body)).not.toBe(nonceOf(posts[1]?.body));
    expect(world.records.writes).toHaveLength(rowsAfterCapture);
  });

  it('answers with a file through a single multipart post carrying a nonce', async () => {
    const world = worldOf();
    world.origins.capture(originOf(1));
    await senderOf(world).send({
      eventId: originOf(1).id,
      content: '',
      files: [{ data: Buffer.from('x'), name: 'a.txt', contentType: 'text/plain' }],
    });
    const [call] = world.rest.sentTo(`/channels/${CHANNEL}/messages`);
    expect(call?.files?.map((file) => file.name)).toStrictEqual(['a.txt']);
    expect(call?.body).toMatchObject({ enforce_nonce: true });
  });

  it('posts proactively in an allowed channel without any authorization context', async () => {
    const world = worldOf();
    await senderOf(world).send({ channelId: OTHER_CHANNEL, content: 'poll time', files: [] });
    expect(world.rest.sentTo(`/channels/${OTHER_CHANNEL}/messages`)).toHaveLength(1);
  });

  it('refuses a reply to an unknown event and pings only the requester', async () => {
    const world = worldOf();
    const sender = senderOf(world);
    await expect(
      sender.send({ eventId: originOf(9).id, content: 'x', files: [] }),
    ).rejects.toBeInstanceOf(DiscordInputError);
    world.origins.capture(originOf(1));
    await expect(
      sender.send({ eventId: originOf(1).id, content: 'x', files: [], notifyUserId: GUEST_ID }),
    ).rejects.toThrow('only ping the person who asked');
  });
});

describe('who may use the Discord tools', () => {
  it('lets the owner act with no event and refuses everyone else', async () => {
    const world = worldOf();
    await expect(world.authority.access(OWNER_CALLER, undefined)).resolves.toStrictEqual({
      origin: null,
    });
    await expect(
      world.authority.access({ ...OWNER_CALLER, role: 'member' }, undefined),
    ).rejects.toBeInstanceOf(DiscordPolicyError);
  });

  it('reaches a channel by id for the owner and resolves an event to its origin', async () => {
    const world = worldOf();
    world.origins.capture(originOf(1));
    const byChannel = await world.authority.reach(OWNER_CALLER, undefined, CHANNEL);
    expect(byChannel.origin.channelId).toBe(CHANNEL);
    const byEvent = await world.authority.reach(OWNER_CALLER, originOf(1).id, undefined);
    expect(byEvent.origin).toMatchObject({ channelId: CHANNEL });
    await expect(world.authority.reach(OWNER_CALLER, undefined, undefined)).rejects.toThrow(
      'Pass eventId or channelId',
    );
  });
});
