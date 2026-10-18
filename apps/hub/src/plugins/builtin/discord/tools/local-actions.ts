import { z } from 'zod';
import { SNOWFLAKE } from '../ids';
import { describePerson, type Person } from '../person';
import type { DiscordServices } from '../services';
import type { Status } from '../status';
import { plain, type LocalAction, type LocalOutput } from './action-tool';

const PEOPLE_SHOWN = 25;
const PAGE = z.number().int().min(1).max(100).default(25);

function entry(services: DiscordServices, who: Person): Readonly<Record<string, unknown>> {
  return { ...who, label: describePerson(who), owner: services.policy.isOwner(who.id) };
}

async function people(
  services: DiscordServices,
  args: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { query, guildId } = z
    .object({ query: z.string().optional(), guildId: SNOWFLAKE.optional() })
    .parse(args);
  const { policy, directory, people: hub } = services;
  if (guildId !== undefined) {
    policy.assertGuild(guildId);
  }
  const approved = await directory.approved();
  if (query !== undefined && guildId !== undefined) {
    await directory.searchGuild(guildId, query.replace(/^@/, ''));
  }
  const owner = hub.list().find((person) => person.status === 'owner');
  return {
    owner:
      owner === undefined ? null : entry(services, directory.person(owner.external_id, guildId)),
    approved: approved.map((who) => entry(services, who)),
    matches:
      query === undefined
        ? []
        : directory
            .find(query, guildId)
            .slice(0, PEOPLE_SHOWN)
            .map((who) => ({
              ...entry(services, who),
              approved: hub.find(who.id) !== null,
            })),
    note: 'Names are display data only. Approval, owner status and every permission are keyed to the numeric ID.',
  };
}

async function guilds(
  services: DiscordServices,
  args: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { limit, before } = z.object({ limit: PAGE, before: SNOWFLAKE.optional() }).parse(args);
  const query = new URLSearchParams({
    limit: String(limit),
    ...(before === undefined ? {} : { before }),
  });
  const found = z
    .array(z.looseObject({ id: z.string() }))
    .parse(await services.rest.get('/users/@me/guilds', query));
  return found.filter((guild) => services.policy.guildAllowed(guild.id));
}

function summary(list: {
  readonly mode: string;
  readonly allowed: readonly string[];
  readonly blocked: readonly string[];
}): unknown {
  return { mode: list.mode, allowed: list.allowed.length, blocked: list.blocked.length };
}

function statusOf(services: DiscordServices, status: Status): unknown {
  const { settings } = services;
  return {
    ...status.view(),
    servers: summary({
      mode: settings.servers_mode,
      allowed: settings.servers_allowed,
      blocked: settings.servers_blocked,
    }),
    channels: summary({
      mode: settings.channels_mode,
      allowed: settings.channels_allowed,
      blocked: settings.channels_blocked,
    }),
    approvedPeople: services.people.list().length,
  };
}

export function localActions(services: DiscordServices, status: Status): readonly LocalAction[] {
  return [
    {
      action: 'guilds_list',
      description:
        'Discover a bounded page of the servers the bot joined, limited to the approved ones.',
      shape: { limit: PAGE, before: SNOWFLAKE.optional() },
      run: async (args, caller, eventId): Promise<LocalOutput> => {
        await services.authority.access(caller, eventId);
        return plain(await guilds(services, args));
      },
    },
    {
      action: 'people',
      description:
        'List the owner and approved people with their names and IDs, and find known server members whose name contains query (pass guildId to also search that server). Use it to turn a name into an ID.',
      shape: { query: z.string().min(1).max(100).optional(), guildId: SNOWFLAKE.optional() },
      run: async (args, caller, eventId): Promise<LocalOutput> => {
        await services.authority.access(caller, eventId);
        return plain(await people(services, args));
      },
    },
    {
      action: 'status',
      description: 'Read the connection state and the server and channel rules.',
      shape: {},
      run: async (_args, caller, eventId): Promise<LocalOutput> => {
        await services.authority.access(caller, eventId);
        return plain(statusOf(services, status));
      },
    },
  ];
}
