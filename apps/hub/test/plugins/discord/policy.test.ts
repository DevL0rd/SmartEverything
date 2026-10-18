import { beforeEach, describe, expect, it } from 'vitest';
import { DiscordPolicyError } from '../../../src/plugins/builtin/discord/errors';
import { Policy } from '../../../src/plugins/builtin/discord/policy';
import { DISCORD_SETTINGS } from '../../../src/plugins/builtin/discord/settings';
import { CHANNEL, GUEST_ID, GUILD, OTHER_CHANNEL, OWNER_ID, peopleOf } from './fakes';

const STRANGER = '100000000000000009';
const ROLE = '500000000000000001';
const THREAD = '300000000000000099';

function policyOf(
  settings: Record<string, unknown> = {},
  extraNames: readonly string[] = [],
): Policy {
  return new Policy(
    DISCORD_SETTINGS.parse(settings),
    peopleOf([OWNER_ID, 'owner'], [GUEST_ID, 'approved']),
    () => extraNames,
  );
}

describe('who may talk to the assistant', () => {
  it('allows the people the home has approved and nobody else', () => {
    const policy = policyOf();
    expect(policy.userAllowed(OWNER_ID)).toBe(true);
    expect(policy.userAllowed(GUEST_ID)).toBe(true);
    expect(policy.userAllowed(STRANGER)).toBe(false);
    expect(() => {
      policy.assertUser(STRANGER);
    }).toThrow(DiscordPolicyError);
  });

  it('knows which approved person is the owner', () => {
    const policy = policyOf();
    expect(policy.isOwner(OWNER_ID)).toBe(true);
    expect(policy.isOwner(GUEST_ID)).toBe(false);
    expect(policy.isOwner(STRANGER)).toBe(false);
  });

  it('takes the owner from what the home resolved, not from the stored status', () => {
    const view = { ...peopleOf([OWNER_ID, 'owner']), requesterOf: () => 'approved' as const };
    const policy = new Policy(DISCORD_SETTINGS.parse({}), view, () => []);
    expect(policy.userAllowed(OWNER_ID)).toBe(true);
    expect(policy.isOwner(OWNER_ID)).toBe(false);
  });

  it('approves a server member who holds an approved role, and forgets it when roles change', () => {
    const policy = policyOf({ approved_roles: [ROLE] });
    policy.noteRoles(STRANGER, GUILD, [ROLE]);
    expect(policy.userAllowed(STRANGER)).toBe(true);
    policy.noteRoles(STRANGER, GUILD, []);
    expect(policy.userAllowed(STRANGER)).toBe(false);
  });

  it('ignores roles when none is approved', () => {
    const policy = policyOf();
    policy.noteRoles(STRANGER, GUILD, [ROLE]);
    expect(policy.userAllowed(STRANGER)).toBe(false);
  });
});

describe('which servers and channels are in scope', () => {
  it('lets everything in by default and refuses a blocked server or channel', () => {
    const policy = policyOf({ servers_blocked: [GUILD], channels_blocked: [CHANNEL] });
    expect(policy.guildAllowed('200000000000000002')).toBe(true);
    expect(policy.guildAllowed(GUILD)).toBe(false);
    expect(policy.channelAllowed(OTHER_CHANNEL)).toBe(true);
    expect(policy.channelAllowed(CHANNEL)).toBe(false);
  });

  it('in allowlist mode lets in only what is listed, and a block still wins', () => {
    const policy = policyOf({
      servers_mode: 'allowlist',
      servers_allowed: [GUILD],
      channels_mode: 'allowlist',
      channels_allowed: [CHANNEL, OTHER_CHANNEL],
      channels_blocked: [OTHER_CHANNEL],
    });
    expect(policy.guildAllowed(GUILD)).toBe(true);
    expect(policy.guildAllowed('200000000000000002')).toBe(false);
    expect(policy.channelAllowed(CHANNEL)).toBe(true);
    expect(policy.channelAllowed(OTHER_CHANNEL)).toBe(false);
    expect(policy.channelAllowed('300000000000000003')).toBe(false);
  });

  it('judges a thread by itself and by its parent channel', () => {
    const blockParent = policyOf({ channels_blocked: [CHANNEL] });
    blockParent.noteThread(THREAD, CHANNEL);
    expect(blockParent.channelAllowed(THREAD)).toBe(false);
    expect(blockParent.threadParent(THREAD)).toBe(CHANNEL);

    const allow = policyOf({ channels_mode: 'allowlist', channels_allowed: [CHANNEL] });
    allow.noteThread(THREAD, CHANNEL);
    expect(allow.channelAllowed(THREAD)).toBe(true);
    const stray = policyOf({ channels_mode: 'allowlist', channels_allowed: [OTHER_CHANNEL] });
    stray.noteThread(THREAD, CHANNEL);
    expect(stray.channelAllowed(THREAD)).toBe(false);
    expect(allow.threadParent(CHANNEL)).toBeUndefined();
  });
});

describe('origins and observations', () => {
  it('requires an approved person in a direct message, and a server and channel in scope elsewhere', () => {
    const policy = policyOf({ channels_blocked: [OTHER_CHANNEL] });
    const dm = { actorId: GUEST_ID, channelId: CHANNEL, guildId: null };
    expect(() => {
      policy.assertOrigin(dm);
    }).not.toThrow();
    expect(() => {
      policy.assertOrigin({ ...dm, actorId: STRANGER });
    }).toThrow('Discord user is not approved');
    expect(() => {
      policy.assertOrigin({ ...dm, guildId: GUILD });
    }).not.toThrow();
    expect(() => {
      policy.assertOrigin({ ...dm, guildId: GUILD, channelId: OTHER_CHANNEL });
    }).toThrow('Channel or thread is not approved');
    expect(() => {
      policy.assertOrigin({ ...dm, actorId: STRANGER, guildId: GUILD });
    }).toThrow('Discord user is not approved');
  });

  it('lets an observation in a server be about anyone, as long as the place is in scope', () => {
    const policy = policyOf({ servers_blocked: [GUILD] });
    const where = { actorId: STRANGER, channelId: CHANNEL };
    expect(() => {
      policy.assertObservation({ ...where, guildId: '200000000000000002' });
    }).not.toThrow();
    expect(() => {
      policy.assertObservation({ ...where, guildId: GUILD });
    }).toThrow('Guild is not approved');
    expect(() => {
      policy.assertObservation({ ...where, guildId: null });
    }).toThrow('Discord user is not approved');
  });

  it('allows a proactive message to a direct-message partner who is still approved, or to a channel in scope', () => {
    const policy = policyOf({ channels_blocked: [OTHER_CHANNEL] });
    policy.noteDm(CHANNEL, GUEST_ID);
    expect(policy.dmUser(CHANNEL)).toBe(GUEST_ID);
    expect(() => {
      policy.assertProactive(CHANNEL);
    }).not.toThrow();
    policy.noteDm('300000000000000050', STRANGER);
    expect(() => {
      policy.assertProactive('300000000000000050');
    }).toThrow('Discord user is not approved');
    expect(() => {
      policy.assertProactive(OTHER_CHANNEL);
    }).toThrow('Channel or thread is not approved');
    expect(() => {
      policy.assertProactive('300000000000000077');
    }).not.toThrow();
  });
});

describe('names the assistant answers to', () => {
  let policy: Policy;

  beforeEach(() => {
    policy = policyOf({ names: ['Jarvis', 'jarvis'] }, ['Friday', 'JARVIS', 'x', ' ']);
  });

  it('lists the bot, the home names and the configured ones once each, dropping one-letter names', () => {
    policy.botNames = ['SmartEverything'];
    expect(policy.names()).toEqual(['SmartEverything', 'Friday', 'JARVIS']);
  });

  it('starts empty of bot names until the bot is known', () => {
    expect(policy.names()).toEqual(['Friday', 'JARVIS']);
  });
});
