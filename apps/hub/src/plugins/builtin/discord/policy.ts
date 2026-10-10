import type { PluginPeopleView } from '../contract';
import { DiscordPolicyError } from './errors';
import type { DiscordSettings } from './settings';

export interface Origin {
  readonly actorId: string;
  readonly channelId: string;
  readonly guildId: string | null;
  readonly messageId?: string | undefined;
}

type ListKind = 'servers' | 'channels';

export class Policy {
  botNames: readonly string[] = [];
  private readonly threadParents = new Map<string, string>();
  private readonly dms = new Map<string, string>();
  private readonly memberRoles = new Map<string, Map<string, Set<string>>>();

  constructor(
    readonly config: DiscordSettings,
    private readonly people: PluginPeopleView,
    private readonly extraNames: () => readonly string[],
  ) {}

  names(): string[] {
    const seen = new Set<string>();
    return [...this.botNames, ...this.extraNames(), ...this.config.names].filter((name) => {
      const key = name.trim().toLocaleLowerCase();
      if (key.length < 2 || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  noteRoles(userId: string, guildId: string, roleIds: Iterable<string>): void {
    const guilds = this.memberRoles.get(userId) ?? new Map<string, Set<string>>();
    guilds.set(guildId, new Set(roleIds));
    this.memberRoles.set(userId, guilds);
  }

  userAllowed(userId: string): boolean {
    if (this.people.find(userId) !== null) {
      return true;
    }
    const guilds = [...(this.memberRoles.get(userId)?.values() ?? [])];
    return this.config.approved_roles.some((role) => guilds.some((roles) => roles.has(role)));
  }

  isOwner(userId: string): boolean {
    return this.people.find(userId)?.status === 'owner';
  }

  assertUser(userId: string): void {
    if (!this.userAllowed(userId)) {
      throw new DiscordPolicyError('Discord user is not approved');
    }
  }

  guildAllowed(guildId: string): boolean {
    return this.inScope('servers', guildId);
  }

  noteThread(threadId: string, parentId: string): void {
    this.threadParents.set(threadId, parentId);
  }

  threadParent(channelId: string): string | undefined {
    return this.threadParents.get(channelId);
  }

  channelAllowed(channelId: string): boolean {
    const parent = this.threadParents.get(channelId);
    if (parent === undefined) {
      return this.inScope('channels', channelId);
    }
    const {
      channels_blocked: blocked,
      channels_allowed: allowed,
      channels_mode: mode,
    } = this.config;
    if (blocked.includes(channelId) || blocked.includes(parent)) {
      return false;
    }
    return mode === 'blocklist' || allowed.includes(channelId) || allowed.includes(parent);
  }

  assertGuild(guildId: string): void {
    if (!this.guildAllowed(guildId)) {
      throw new DiscordPolicyError('Guild is not approved');
    }
  }

  assertChannel(channelId: string): void {
    if (!this.channelAllowed(channelId)) {
      throw new DiscordPolicyError('Channel or thread is not approved');
    }
  }

  assertOrigin(origin: Origin): void {
    this.assertUser(origin.actorId);
    if (origin.guildId === null) {
      return;
    }
    this.assertGuild(origin.guildId);
    this.assertChannel(origin.channelId);
  }

  assertObservation(origin: Origin): void {
    if (origin.guildId === null) {
      this.assertUser(origin.actorId);
      return;
    }
    this.assertGuild(origin.guildId);
    this.assertChannel(origin.channelId);
  }

  noteDm(channelId: string, userId: string): void {
    this.dms.set(channelId, userId);
  }

  dmUser(channelId: string): string | undefined {
    return this.dms.get(channelId);
  }

  assertProactive(channelId: string): void {
    const dmUser = this.dms.get(channelId);
    if (dmUser === undefined) {
      this.assertChannel(channelId);
      return;
    }
    this.assertUser(dmUser);
  }

  private inScope(kind: ListKind, id: string): boolean {
    const { config } = this;
    const mode = kind === 'servers' ? config.servers_mode : config.channels_mode;
    const allowed = kind === 'servers' ? config.servers_allowed : config.channels_allowed;
    const blocked = kind === 'servers' ? config.servers_blocked : config.channels_blocked;
    return !blocked.includes(id) && (mode === 'blocklist' || allowed.includes(id));
  }
}
