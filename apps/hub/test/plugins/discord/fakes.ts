import type { PluginPerson } from '@smarteverything/domain';
import type { ToolCaller } from '../../../src/ai-tools/hub-tool';
import { Authority } from '../../../src/plugins/builtin/discord/authority';
import { Channels } from '../../../src/plugins/builtin/discord/channels';
import { Interactions } from '../../../src/plugins/builtin/discord/interactions';
import type {
  DiscordFile,
  DiscordRest,
  RestCalls,
} from '../../../src/plugins/builtin/discord/link';
import { OriginStore, type EventOrigin } from '../../../src/plugins/builtin/discord/origins';
import { Policy } from '../../../src/plugins/builtin/discord/policy';
import { DISCORD_SETTINGS } from '../../../src/plugins/builtin/discord/settings';
import type { PluginPeopleView, PluginRecords } from '../../../src/plugins/builtin/contract';

export const OWNER_ID = '100000000000000001';
export const GUEST_ID = '100000000000000002';
export const GUILD = '200000000000000001';
export const CHANNEL = '300000000000000001';
export const OTHER_CHANNEL = '300000000000000002';
export const MESSAGE = '400000000000000001';

interface Call {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly route: string;
  readonly body: unknown;
  readonly query: URLSearchParams | undefined;
  readonly files: readonly DiscordFile[] | undefined;
}

export function nothing(): void {
  return undefined;
}

class FakeRest implements DiscordRest {
  readonly calls: Call[] = [];
  readonly anonymous: RestCalls = this;
  private readonly answers = new Map<string, unknown>();
  private sent = 500_000_000_000_000_000n;

  answer(method: Call['method'], route: string, value: unknown): void {
    this.answers.set(`${method} ${route}`, value);
  }

  get = (route: string, query?: URLSearchParams): Promise<unknown> =>
    this.respond({ method: 'GET', route, body: undefined, query, files: undefined });

  post = (route: string, body: unknown): Promise<unknown> =>
    this.respond({ method: 'POST', route, body, query: undefined, files: undefined });

  postFiles = (route: string, body: unknown, files: readonly DiscordFile[]): Promise<unknown> =>
    this.respond({ method: 'POST', route, body, query: undefined, files });

  patch = (route: string, body: unknown): Promise<unknown> =>
    this.respond({ method: 'PATCH', route, body, query: undefined, files: undefined });

  put = (route: string, body?: unknown): Promise<unknown> =>
    this.respond({ method: 'PUT', route, body, query: undefined, files: undefined });

  delete = (route: string): Promise<unknown> =>
    this.respond({ method: 'DELETE', route, body: undefined, query: undefined, files: undefined });

  sentTo(route: string): Call[] {
    return this.calls.filter((call) => call.method === 'POST' && call.route === route);
  }

  private respond(call: Call): Promise<unknown> {
    const { method, route } = call;
    this.calls.push(call);
    const key = `${method} ${route}`;
    if (this.answers.has(key)) {
      return Promise.resolve(this.answers.get(key));
    }
    if (method === 'POST' && route.endsWith('/messages')) {
      this.sent += 1n;
      return Promise.resolve({ id: String(this.sent), channel_id: route.split('/')[2] });
    }
    return Promise.reject(new Error(`The fake Discord has no answer for ${key}`));
  }
}

export class MemoryRecords implements PluginRecords {
  readonly rows = new Map<string, PluginRecordValue>();
  readonly writes: string[] = [];

  get = (key: string): PluginRecordValue | null => this.rows.get(key) ?? null;

  list = (): readonly { readonly key: string; readonly value: PluginRecordValue }[] =>
    [...this.rows].map(([key, value]) => ({ key, value }));

  put = (key: string, value: PluginRecordValue): void => {
    this.writes.push(key);
    this.rows.set(key, value);
  };

  remove = (key: string): void => {
    this.rows.delete(key);
  };
}

type PluginRecordValue = Parameters<PluginRecords['put']>[1];

function person(externalId: string, status: PluginPerson['status']): PluginPerson {
  return {
    plugin_id: 'discord',
    external_id: externalId,
    name: externalId,
    status,
    profile_id: null,
    added_at: '2026-10-16T10:00:00.000+00:00',
  };
}

export function peopleOf(
  ...entries: readonly [string, PluginPerson['status']][]
): PluginPeopleView {
  const everyone = entries.map(([id, status]) => person(id, status));
  return {
    save: (): never => {
      throw new Error('The fake people list is read only');
    },
    find: (externalId) => everyone.find((one) => one.external_id === externalId) ?? null,
    list: () => everyone,
    requesterOf: (externalId) =>
      everyone.find((one) => one.external_id === externalId)?.status ?? 'unlisted',
    watch: () => nothing,
  };
}

export const OWNER_CALLER: ToolCaller = {
  profileId: 'profile',
  role: 'owner',
  chatId: null,
  via: 'plugin',
  clientId: null,
};

export interface World {
  readonly rest: FakeRest;
  readonly records: MemoryRecords;
  readonly policy: Policy;
  readonly origins: OriginStore;
  readonly channels: Channels;
  readonly authority: Authority;
  readonly interactions: Interactions;
  readonly people: PluginPeopleView;
}

export function worldOf(): World {
  const rest = new FakeRest();
  const records = new MemoryRecords();
  const people = peopleOf([OWNER_ID, 'owner'], [GUEST_ID, 'approved']);
  const policy = new Policy(DISCORD_SETTINGS.parse({}), people, () => []);
  const origins = new OriginStore(records, { warn: nothing });
  const channels = new Channels(rest, policy);
  rest.answer('GET', `/channels/${CHANNEL}`, { id: CHANNEL, type: 0, guild_id: GUILD });
  rest.answer('GET', `/channels/${OTHER_CHANNEL}`, { id: OTHER_CHANNEL, type: 0, guild_id: GUILD });
  return {
    rest,
    records,
    policy,
    origins,
    channels,
    authority: new Authority({ policy, origins, channels, people }),
    interactions: new Interactions(rest, Date.now, nothing),
    people,
  };
}

export function originOf(index: number, overrides: Partial<EventOrigin> = {}): EventOrigin {
  const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  return {
    id,
    kind: 'message',
    actorId: OWNER_ID,
    channelId: CHANNEL,
    guildId: GUILD,
    messageId: MESSAGE.slice(0, 12) + String(index).padStart(6, '0'),
    text: `message ${String(index)}`,
    receivedAt: new Date(Date.UTC(2026, 9, 16, 10, 0, 0, index)).toISOString(),
    ...overrides,
  };
}
