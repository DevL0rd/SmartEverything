import { Logger, describeFailure } from '@smarteverything/logging';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { InboundMessage } from '@smarteverything/domain';
import { attachedFiles } from './attachments';
import type { History } from './history';
import { DiscordPolicyError } from './errors';
import { MEDIA_MESSAGE, type MediaIndex } from './media-index';
import { authorOf, mentionedOf, observe } from './observation';
import type { EventOrigin } from './origins';
import { MESSAGE_UPDATE, RAW_MESSAGE, type RawMessage } from './payloads';
import { conversationFor, inboundOf, requestText } from './request';
import type { DiscordServices } from './services';
import type { Status } from './status';
import type { Triggers } from './triggers';
import type { Typing } from './typing';
import type { VoiceService } from './voice/service';

const log = new Logger('hub.discord-intake');

const SEEN_LIMIT = 2000;
const SEEN_MS = 10 * 60_000;
const NEGATIVE_MS = 10 * 60_000;

const ROLES = z.array(
  z.looseObject({
    id: z.string(),
    tags: z.looseObject({ bot_id: z.string().optional() }).optional(),
  }),
);

export interface IntakeDeps {
  readonly services: DiscordServices;
  readonly triggers: Triggers;
  readonly history: History;
  readonly mediaIndex: MediaIndex;
  readonly typing: Typing;
  readonly calls: Pick<VoiceService, 'contextFor'>;
  readonly status: Status;
  readonly guilds: ReadonlySet<string>;
  readonly guildNames: ReadonlyMap<string, string>;
  readonly post: (message: InboundMessage) => void;
  readonly report: (cause: unknown) => void;
}

function unlessPolicy(cause: unknown): void {
  if (!(cause instanceof DiscordPolicyError)) {
    throw cause;
  }
}

export class Intake {
  private readonly seen = new Map<string, number>();
  private readonly unknownMembers = new Map<string, number>();
  private readonly botRoles = new Map<string, Promise<string | null>>();

  constructor(private readonly deps: IntakeDeps) {}

  async message(raw: RawMessage): Promise<void> {
    const { services } = this.deps;
    if (!this.claim(raw.id)) {
      return;
    }
    if (raw.guild_id !== undefined) {
      await services.channels.resolve(raw.channel_id).catch(this.deps.report);
      if (raw.member !== undefined) {
        services.policy.noteRoles(raw.author.id, raw.guild_id, raw.member.roles);
      }
    }
    const guildId = raw.guild_id ?? null;
    services.directory.learnVisible(authorOf(raw), guildId, raw.member !== undefined);
    for (const who of mentionedOf(raw)) {
      services.directory.learnVisible(who, guildId);
    }
    await this.capture(raw);
  }

  edited(raw: unknown): void {
    const { services, mediaIndex } = this.deps;
    const update = MESSAGE_UPDATE.parse(raw);
    if (update.content !== undefined) {
      services.origins.edit(update.id, update.channel_id, update.content);
      services.context.update(
        update.id,
        update.content,
        services.settings.message_content_intent || update.guild_id === undefined,
      );
    }
    const full = RAW_MESSAGE.safeParse(raw);
    if (update.attachments !== undefined && full.success) {
      mediaIndex.remove(update.id);
      this.observeMedia(full.data, false);
    }
  }

  removed(ids: readonly string[]): void {
    for (const id of ids) {
      this.deps.services.context.remove(id);
      this.deps.mediaIndex.remove(id);
    }
  }

  private claim(id: string): boolean {
    const now = this.deps.services.now();
    for (const [key, expires] of this.seen) {
      if (expires <= now) {
        this.seen.delete(key);
      }
    }
    if (this.seen.has(id)) {
      return false;
    }
    if (this.seen.size >= SEEN_LIMIT) {
      const oldest = this.seen.keys().next();
      if (oldest.done !== true) {
        this.seen.delete(oldest.value);
      }
    }
    this.seen.set(id, now + SEEN_MS);
    return true;
  }

  private async capture(raw: RawMessage): Promise<void> {
    const { services } = this.deps;
    const trigger = await this.authorizedTrigger(raw);
    this.observeMedia(raw, trigger !== null);
    if (!services.settings.context_enabled) {
      return;
    }
    const observed = observe(
      raw,
      services.policy.threadParent(raw.channel_id) ?? null,
      services.settings.message_content_intent,
    );
    try {
      services.policy.assertObservation(observed);
      services.context.ingest(observed, trigger !== null);
    } catch (cause) {
      unlessPolicy(cause);
    }
  }

  private observeMedia(raw: RawMessage, addressed: boolean): void {
    if (raw.attachments.length === 0) {
      return;
    }
    const parsed = MEDIA_MESSAGE.safeParse({
      id: raw.id,
      channel_id: raw.channel_id,
      author: { id: raw.author.id },
      timestamp: new Date(raw.timestamp).toISOString(),
      attachments: raw.attachments,
    });
    if (!parsed.success) {
      this.deps.report(parsed.error);
      return;
    }
    try {
      this.deps.mediaIndex.ingest(parsed.data, raw.guild_id ?? null, addressed);
    } catch (cause) {
      unlessPolicy(cause);
    }
  }

  private async authorizedTrigger(raw: RawMessage): Promise<EventOrigin | null> {
    const { services } = this.deps;
    if (!(await this.allowedAuthor(raw))) {
      return null;
    }
    const origin: EventOrigin = {
      id: randomUUID(),
      kind: 'message',
      actorId: raw.author.id,
      channelId: raw.channel_id,
      guildId: raw.guild_id ?? null,
      messageId: raw.id,
      text: raw.content,
      author: authorOf(raw),
      mentions: mentionedOf(raw),
      receivedAt: new Date(services.now()).toISOString(),
    };
    try {
      services.policy.assertOrigin(origin);
    } catch (cause) {
      unlessPolicy(cause);
      return null;
    }
    if (!(await this.addressed(raw)) || services.origins.hasMessage(raw.channel_id, raw.id)) {
      return null;
    }
    services.origins.capture(origin);
    await this.deliver(origin, raw);
    return origin;
  }

  private async learnRoles(userId: string): Promise<void> {
    const { services, guilds } = this.deps;
    const { policy, rest } = services;
    if (services.settings.approved_roles.length === 0 || policy.userAllowed(userId)) {
      return;
    }
    const now = services.now();
    if ((this.unknownMembers.get(userId) ?? 0) > now) {
      return;
    }
    for (const guildId of guilds) {
      const found = await rest
        .get(`/guilds/${guildId}/members/${userId}`)
        .catch((cause: unknown) => {
          log.debug('member.lookup_failed', () => ({
            guildId,
            userId,
            error: describeFailure(cause).message,
          }));
          return null;
        });
      const member = z.looseObject({ roles: z.array(z.string()) }).safeParse(found);
      if (member.success) {
        policy.noteRoles(userId, guildId, member.data.roles);
      }
    }
    if (!policy.userAllowed(userId)) {
      this.unknownMembers.set(userId, now + NEGATIVE_MS);
    }
  }

  private async allowedAuthor(raw: RawMessage): Promise<boolean> {
    const { services } = this.deps;
    if (raw.guild_id === undefined) {
      await this.learnRoles(raw.author.id);
    }
    return (
      services.policy.userAllowed(raw.author.id) &&
      raw.author.id !== services.identity.botId &&
      raw.webhook_id === undefined
    );
  }

  private async addressed(raw: RawMessage): Promise<boolean> {
    const { services, triggers } = this.deps;
    if (raw.guild_id === undefined) {
      return true;
    }
    if (triggers.accepts(raw.author.id, raw.content, services.identity.botId)) {
      return true;
    }
    if (await this.mentionsBotRole(raw, raw.guild_id)) {
      return true;
    }
    return services.settings.reply_to_bot && (await this.repliesToBot(raw));
  }

  private botRole(guildId: string): Promise<string | null> {
    const cached = this.botRoles.get(guildId);
    if (cached !== undefined) {
      return cached;
    }
    const { services } = this.deps;
    const found = services.rest
      .get(`/guilds/${guildId}/roles`)
      .then((roles) => {
        const mine = ROLES.parse(roles).find(
          (role) => role.tags?.bot_id === services.identity.botId,
        );
        return mine?.id ?? null;
      })
      .catch((cause: unknown) => {
        this.botRoles.delete(guildId);
        this.deps.report(cause);
        return null;
      });
    this.botRoles.set(guildId, found);
    return found;
  }

  private async mentionsBotRole(raw: RawMessage, guildId: string): Promise<boolean> {
    if (raw.mention_roles.length === 0) {
      return false;
    }
    const role = await this.botRole(guildId);
    return role !== null && raw.mention_roles.includes(role);
  }

  private async repliesToBot(raw: RawMessage): Promise<boolean> {
    const reference = raw.message_reference;
    if (
      reference?.message_id === undefined ||
      reference.channel_id !== raw.channel_id ||
      (reference.guild_id !== undefined && reference.guild_id !== raw.guild_id)
    ) {
      return false;
    }
    const { services } = this.deps;
    const target = RAW_MESSAGE.safeParse(
      await services.rest
        .get(`/channels/${raw.channel_id}/messages/${reference.message_id}`)
        .catch((cause: unknown) => {
          log.debug('reference.lookup_failed', () => ({
            channelId: raw.channel_id,
            messageId: reference.message_id,
            error: describeFailure(cause).message,
          }));
          return null;
        }),
    );
    return (
      target.success &&
      target.data.id === reference.message_id &&
      target.data.channel_id === raw.channel_id &&
      target.data.author.id === services.identity.botId
    );
  }

  private async deliver(origin: EventOrigin, raw: RawMessage): Promise<void> {
    const { services, history, typing } = this.deps;
    const files = await attachedFiles(
      raw.attachments,
      {
        enabled: services.settings.media_enabled,
        maxFileBytes: services.settings.media_max_file_bytes,
      },
      services.download,
    );
    const past = await history.textFor(origin).catch((cause: unknown) => {
      this.deps.report(cause);
      return '';
    });
    this.deps.post(
      inboundOf({
        origin,
        conversation: await conversationFor(
          services,
          this.deps.guildNames,
          origin,
          this.deps.report,
        ),
        text: requestText(
          origin,
          `${this.deps.calls.contextFor(origin.guildId, origin.actorId)}${past}`,
          files.notes,
        ),
        attachments: files.attachments,
        progress: services.activity.progress(),
      }),
    );
    typing.start(origin.id, () => services.sender.typing(origin.id));
  }
}
