import { z } from 'zod';
import {
  PLUGIN_OPTION_PAGE_MAX,
  type PluginOption,
  type PluginOptionPage,
  type PluginOptionQuery,
} from '@smarteverything/domain';
import type { PluginOptionProvider } from '../contract';
import type { RestCalls } from './link';

const SNOWFLAKE = z.string().regex(/^\d{1,20}$/);
const CACHE_MS = 15_000;
const CDN = 'https://cdn.discordapp.com';

const ROLE = z.looseObject({
  id: SNOWFLAKE,
  name: z.string(),
  color: z.number().int().default(0),
  position: z.number().int().default(0),
});

const CHANNEL = z.looseObject({
  id: SNOWFLAKE,
  type: z.number().int(),
  name: z.string().nullish(),
  parent_id: SNOWFLAKE.nullish(),
});

const USER = z.looseObject({
  id: SNOWFLAKE,
  username: z.string().nullish(),
  global_name: z.string().nullish(),
  avatar: z.string().nullish(),
  bot: z.boolean().optional(),
});

const MEMBER = z.looseObject({ nick: z.string().nullish(), user: USER });

const THREADS = z.looseObject({ threads: z.array(CHANNEL) });

const CHANNEL_TYPES = new Set([0, 2, 5, 13, 15, 16]);
const THREAD_TYPES = new Set([10, 11, 12]);
const MEMBERS_FROM = 50;
const SEARCH_LIMIT = 25;

export interface PickerWorld {
  readonly rest: RestCalls;
  readonly guilds: () => ReadonlyMap<string, string>;
  readonly ready: () => boolean;
}

function unavailable(message: string): PluginOptionPage {
  return { state: 'unavailable', message };
}

function hexOf(color: number): string | null {
  return color === 0 ? null : `#${color.toString(16).padStart(6, '0')}`;
}

function matches(option: PluginOption, query: string): boolean {
  const needle = query.toLocaleLowerCase();
  return (
    needle === '' || `${option.label} ${option.detail ?? ''}`.toLocaleLowerCase().includes(needle)
  );
}

function idsOf(query: PluginOptionQuery): readonly string[] {
  return query.ids === undefined || query.ids === ''
    ? []
    : query.ids.split(',').filter((id) => SNOWFLAKE.safeParse(id).success);
}

function pageOf(options: readonly PluginOption[], query: PluginOptionQuery): PluginOptionPage {
  const wanted = idsOf(query);
  if (query.ids !== undefined) {
    return {
      state: 'ready',
      options: options
        .filter((option) => wanted.includes(option.id))
        .slice(0, PLUGIN_OPTION_PAGE_MAX),
      next: null,
    };
  }
  const found = options.filter((option) => matches(option, query.q ?? ''));
  const start = Number(query.after ?? '0');
  const next = start + PLUGIN_OPTION_PAGE_MAX;
  return {
    state: 'ready',
    options: found.slice(start, next),
    next: next < found.length ? String(next) : null,
  };
}

function listed(world: PickerWorld, load: () => Promise<PluginOption[]>): PluginOptionProvider {
  let cached: {
    readonly at: number;
    readonly options: PluginOption[];
    readonly key: string;
  } | null = null;
  return async (query) => {
    const key = [...world.guilds().keys()].join(',');
    const now = Date.now();
    if (cached?.key !== key || now - cached.at > CACHE_MS) {
      cached = { at: now, options: await load(), key };
    }
    return pageOf(cached.options, query);
  };
}

function servers(world: PickerWorld): PluginOptionProvider {
  return listed(world, () =>
    Promise.resolve(
      [...world.guilds()]
        .map(([id, name]) => ({ id, label: name, detail: null, color: null, image: null }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ),
  );
}

async function perGuild(
  world: PickerWorld,
  each: (guildId: string, guildName: string) => Promise<PluginOption[]>,
): Promise<PluginOption[]> {
  const lists = await Promise.all([...world.guilds()].map(([id, name]) => each(id, name)));
  return lists.flat();
}

function roles(world: PickerWorld): PluginOptionProvider {
  return listed(world, () =>
    perGuild(world, async (guildId, guildName) =>
      z
        .array(ROLE)
        .parse(await world.rest.get(`/guilds/${guildId}/roles`))
        .filter((role) => role.id !== guildId)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({
          id: role.id,
          label: `@${role.name}`,
          detail: guildName,
          color: hexOf(role.color),
          image: null,
        })),
    ),
  );
}

function channelOption(
  channel: z.output<typeof CHANNEL>,
  guildName: string,
  thread: boolean,
): PluginOption {
  return {
    id: channel.id,
    label: `#${channel.name ?? channel.id}`,
    detail: thread ? `Thread · ${guildName}` : guildName,
    color: null,
    image: null,
  };
}

async function channelsOf(
  world: PickerWorld,
  guildId: string,
  guildName: string,
): Promise<PluginOption[]> {
  const [channels, active] = await Promise.all([
    world.rest.get(`/guilds/${guildId}/channels`),
    world.rest.get(`/guilds/${guildId}/threads/active`),
  ]);
  return [
    ...z
      .array(CHANNEL)
      .parse(channels)
      .filter((channel) => CHANNEL_TYPES.has(channel.type))
      .map((channel) => channelOption(channel, guildName, false)),
    ...THREADS.parse(active)
      .threads.filter((thread) => THREAD_TYPES.has(thread.type))
      .map((thread) => channelOption(thread, guildName, true)),
  ];
}

function channels(world: PickerWorld): PluginOptionProvider {
  return listed(world, () => perGuild(world, (id, name) => channelsOf(world, id, name)));
}

function avatarOf(user: z.output<typeof USER>): string | null {
  return user.avatar === null || user.avatar === undefined
    ? null
    : `${CDN}/avatars/${user.id}/${user.avatar}.png?size=64`;
}

function personOption(
  user: z.output<typeof USER>,
  nick: string | null | undefined,
  guildName: string | null,
): PluginOption {
  const handle = user.username ?? user.id;
  return {
    id: user.id,
    label: nick ?? user.global_name ?? handle,
    detail: guildName === null ? `@${handle}` : `@${handle} · ${guildName}`,
    color: null,
    image: avatarOf(user),
  };
}

interface MembersAsk {
  readonly guildId: string;
  readonly guildName: string;
  readonly query: PluginOptionQuery;
  readonly after: string;
}

async function membersOf(world: PickerWorld, ask: MembersAsk): Promise<PluginOption[]> {
  const { guildId, guildName, query, after } = ask;
  const text = query.q ?? '';
  const found =
    text === ''
      ? await world.rest.get(
          `/guilds/${guildId}/members`,
          new URLSearchParams({ limit: String(MEMBERS_FROM), after }),
        )
      : await world.rest.get(
          `/guilds/${guildId}/members/search`,
          new URLSearchParams({ query: text, limit: String(SEARCH_LIMIT) }),
        );
  return z
    .array(MEMBER)
    .parse(found)
    .filter((member) => member.user.bot !== true)
    .map((member) => personOption(member.user, member.nick, guildName));
}

async function usersByIds(world: PickerWorld, ids: readonly string[]): Promise<PluginOption[]> {
  const users = await Promise.all(
    ids
      .slice(0, PLUGIN_OPTION_PAGE_MAX)
      .map(async (id) => await world.rest.get(`/users/${id}`).catch(() => null)),
  );
  return users.flatMap((raw) => {
    const user = USER.safeParse(raw);
    return user.success ? [personOption(user.data, null, null)] : [];
  });
}

function cursorOf(after: string | undefined): { readonly guild: number; readonly after: string } {
  const [guild = '0', last = '0'] = (after ?? '0:0').split(':');
  return { guild: Number(guild), after: last };
}

function people(world: PickerWorld): PluginOptionProvider {
  return async (query) => {
    if (query.ids !== undefined) {
      return { state: 'ready', options: await usersByIds(world, idsOf(query)), next: null };
    }
    const guilds = [...world.guilds()];
    const cursor = cursorOf(query.after);
    const searching = (query.q ?? '') !== '';
    const picked = guilds.slice(
      searching ? 0 : cursor.guild,
      searching ? undefined : cursor.guild + 1,
    );
    const lists = await Promise.all(
      picked.map(([id, name]) =>
        membersOf(world, { guildId: id, guildName: name, query, after: cursor.after }),
      ),
    );
    return peoplePage(lists.flat(), guilds.length, cursor, searching);
  };
}

function peoplePage(
  found: readonly PluginOption[],
  guildCount: number,
  cursor: { readonly guild: number; readonly after: string },
  searching: boolean,
): PluginOptionPage {
  const options = [...new Map(found.map((option) => [option.id, option])).values()];
  if (searching) {
    return { state: 'ready', options, next: null };
  }
  const last = found.at(-1);
  const more = found.length >= MEMBERS_FROM && last !== undefined;
  const next = more
    ? `${String(cursor.guild)}:${last.id}`
    : cursor.guild + 1 < guildCount
      ? `${String(cursor.guild + 1)}:0`
      : null;
  return { state: 'ready', options, next };
}

const NOT_CONNECTED = 'Discord is not connected. Check the bot token and the plugin status.';

function sourcesOf(world: PickerWorld): Readonly<Record<string, PluginOptionProvider>> {
  return {
    servers: servers(world),
    channels: channels(world),
    roles: roles(world),
    people: people(world),
  };
}

export const PICKER_SOURCES = ['servers', 'channels', 'roles', 'people'] as const;

export function discordPicker(
  source: (typeof PICKER_SOURCES)[number],
  current: () => PickerWorld | null,
): PluginOptionProvider {
  const built = new WeakMap<PickerWorld, Readonly<Record<string, PluginOptionProvider>>>();
  return async (query) => {
    const world = current();
    if (world?.ready() !== true) {
      return unavailable(NOT_CONNECTED);
    }
    const sources = built.get(world) ?? sourcesOf(world);
    built.set(world, sources);
    try {
      return (await sources[source]?.(query)) ?? unavailable(NOT_CONNECTED);
    } catch (cause) {
      return unavailable(
        `Discord would not list that: ${cause instanceof Error ? cause.message : 'unknown error'}`,
      );
    }
  };
}
