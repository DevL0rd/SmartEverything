import { describe, expect, it } from 'vitest';
import { CHANNEL_OPERATIONS } from '../../../src/plugins/builtin/discord/operations/channels';
import type { OperationContext } from '../../../src/plugins/builtin/discord/operations/kit';
import { CHANNEL, MESSAGE, OTHER_CHANNEL, originOf, worldOf } from './fakes';

function contextOf(
  world: ReturnType<typeof worldOf>,
  origin: OperationContext['origin'],
): OperationContext {
  return {
    rest: world.rest,
    policy: world.policy,
    channels: world.channels,
    botId: '900000000000000001',
    applicationId: '900000000000000002',
    origin,
  };
}

async function startThread(
  context: OperationContext,
  args: Record<string, unknown>,
): Promise<void> {
  const operation = CHANNEL_OPERATIONS.find((item) => item.action === 'thread_create');
  await operation?.run({ name: 'Plans', ...args }, context);
}

describe('thread_create without an authorization context', () => {
  it('starts a standalone public thread when no request message is involved', async () => {
    const world = worldOf();
    world.rest.answer('POST', `/channels/${CHANNEL}/threads`, { id: '1' });
    await startThread(contextOf(world, null), { channelId: CHANNEL });
    expect(world.rest.calls.at(-1)).toMatchObject({
      route: `/channels/${CHANNEL}/threads`,
      body: { name: 'Plans', type: 11 },
    });
  });

  it('starts from the request message when it is in the same channel', async () => {
    const world = worldOf();
    const origin = originOf(1, { messageId: MESSAGE });
    world.rest.answer('POST', `/channels/${CHANNEL}/messages/${MESSAGE}/threads`, { id: '1' });
    await startThread(contextOf(world, origin), { channelId: CHANNEL });
    expect(world.rest.calls.at(-1)?.route).toBe(`/channels/${CHANNEL}/messages/${MESSAGE}/threads`);
  });

  it('starts from an explicit message, and standalone when the request came from elsewhere', async () => {
    const world = worldOf();
    const origin = originOf(1, { messageId: MESSAGE });
    world.rest.answer('POST', `/channels/${OTHER_CHANNEL}/threads`, { id: '1' });
    await startThread(contextOf(world, origin), { channelId: OTHER_CHANNEL });
    expect(world.rest.calls.at(-1)?.route).toBe(`/channels/${OTHER_CHANNEL}/threads`);
    const explicit = '400000000000000077';
    world.rest.answer('POST', `/channels/${OTHER_CHANNEL}/messages/${explicit}/threads`, {
      id: '2',
    });
    await startThread(contextOf(world, origin), { channelId: OTHER_CHANNEL, messageId: explicit });
    expect(world.rest.calls.at(-1)?.route).toBe(
      `/channels/${OTHER_CHANNEL}/messages/${explicit}/threads`,
    );
  });
});
