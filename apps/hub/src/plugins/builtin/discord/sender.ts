import { z } from 'zod';
import type { Authority } from './authority';
import type { Channels } from './channels';
import { DiscordInputError } from './errors';
import type { Interactions, LiveInteraction } from './interactions';
import type { EventOrigin } from './origins';
import type { DiscordRest } from './link';
import {
  NO_MENTIONS,
  mentionRule,
  newNonce,
  partBody,
  withMention,
  type Delivery,
  type OutFile,
  type Rich,
  type SendOptions,
} from './outgoing';
import { POSTED, type Posted } from './payloads';
import type { Policy } from './policy';
import { splitMessage } from './split';
import type { StatusBoard } from './status-board';

const TYPING_CHECK_MS = 30_000;

interface Checked {
  readonly origin: EventOrigin;
  readonly until: number;
}

interface Reply extends Rich {
  readonly eventId: string;
  readonly notifyRequester?: boolean;
  readonly status?: boolean;
}

export interface SendInput extends Rich {
  readonly eventId?: string | undefined;
  readonly channelId?: string | undefined;
  readonly userId?: string | undefined;
  readonly files: readonly OutFile[];
  readonly notifyUserId?: string | undefined;
  readonly progress?: boolean | undefined;
}

export interface SenderDeps {
  readonly rest: DiscordRest;
  readonly policy: Policy;
  readonly authority: Authority;
  readonly channels: Channels;
  readonly interactions: Interactions;
  readonly statuses: StatusBoard;
  readonly now: () => number;
  readonly report: (cause: unknown) => void;
}

const SENT_DM = z.looseObject({ id: z.string() });

function hasBody(input: Rich & { readonly files?: readonly OutFile[] }): boolean {
  return input.content !== '' || (input.embeds?.length ?? 0) > 0 || (input.files?.length ?? 0) > 0;
}

export class Sender {
  private readonly typingChecks = new Map<string, Checked>();

  constructor(private readonly deps: SenderDeps) {}

  send(input: SendInput): Promise<unknown> {
    const targets = [input.eventId, input.channelId, input.userId].filter(
      (target) => target !== undefined,
    );
    if (targets.length !== 1) {
      throw new DiscordInputError(
        'Choose exactly one of eventId (reply to a request), channelId or userId (DM)',
      );
    }
    if (!hasBody(input)) {
      throw new DiscordInputError('A message needs text, an embed or a file');
    }
    if (input.eventId !== undefined) {
      return this.reply(input, input.eventId);
    }
    if (input.channelId !== undefined) {
      return this.post(input, input.channelId);
    }
    if (input.userId !== undefined) {
      return this.direct(input, input.userId);
    }
    throw new DiscordInputError('There is nowhere to send this');
  }

  async respond(input: Reply): Promise<unknown> {
    const { authority, interactions } = this.deps;
    const origin = await authority.originOf(input.eventId);
    const live = interactions.get(input.eventId);
    if (live !== undefined) {
      const answered = await this.interactionReply(input, live, origin.channelId).catch(
        (cause: unknown) => {
          this.deps.report(cause);
          return null;
        },
      );
      if (answered !== null) {
        return answered;
      }
    }
    return this.channelReply(input, origin);
  }

  async deliver(eventId: string, delivery: Delivery): Promise<Posted> {
    const { authority, interactions, rest, statuses } = this.deps;
    const origin = await authority.originOf(eventId);
    const live = interactions.get(eventId);
    if (live !== undefined) {
      const done = await interactions.deliver(live, delivery).catch((cause: unknown) => {
        this.deps.report(cause);
        return null;
      });
      if (done !== null) {
        return done;
      }
    }
    const files = delivery.files ?? [];
    const body = {
      content: delivery.content,
      components: delivery.components,
      embeds: delivery.embeds,
      allowed_mentions: NO_MENTIONS,
      nonce: newNonce(),
      enforce_nonce: true,
      ...(files.length > 0
        ? { attachments: files.map((file, id) => ({ id, filename: file.name })) }
        : {}),
      ...(origin.messageId === undefined
        ? {}
        : { message_reference: { message_id: origin.messageId, fail_if_not_exists: false } }),
    };
    const route = `/channels/${origin.channelId}/messages`;
    const sent = POSTED.parse(
      files.length > 0 ? await rest.postFiles(route, body, files) : await rest.post(route, body),
    );
    await statuses.settle(eventId);
    return sent;
  }

  async typing(eventId: string): Promise<void> {
    const { authority, rest, now } = this.deps;
    const cached = this.typingChecks.get(eventId);
    const checked =
      cached !== undefined && cached.until > now()
        ? cached
        : { origin: await authority.originOf(eventId), until: now() + TYPING_CHECK_MS };
    this.typingChecks.set(eventId, checked);
    await rest.post(`/channels/${checked.origin.channelId}/typing`, {});
  }

  forgetTyping(eventId: string): void {
    this.typingChecks.delete(eventId);
  }

  private async reply(input: SendInput, eventId: string): Promise<unknown> {
    const origin = await this.deps.authority.originOf(eventId);
    if (input.notifyUserId !== undefined && input.notifyUserId !== origin.actorId) {
      throw new DiscordInputError('A reply can only ping the person who asked');
    }
    if (input.files.length === 0) {
      return this.respond({
        eventId,
        content: input.content,
        ...(input.embeds === undefined ? {} : { embeds: input.embeds }),
        notifyRequester: input.notifyUserId === origin.actorId,
        status: input.progress === true,
      });
    }
    return this.deliver(eventId, {
      content: input.content,
      embeds: input.embeds,
      files: input.files,
    });
  }

  private async post(input: SendInput, channelId: string): Promise<unknown> {
    const { policy, channels, rest } = this.deps;
    policy.assertProactive(channelId);
    if (input.notifyUserId !== undefined) {
      policy.assertUser(input.notifyUserId);
    }
    if (policy.dmUser(channelId) === undefined) {
      await channels.guildChannel(channelId);
    }
    const options: SendOptions = { notify: input.notifyUserId };
    if (input.files.length === 0) {
      return this.sendParts(channelId, input, options);
    }
    return POSTED.parse(
      await rest.postFiles(
        `/channels/${channelId}/messages`,
        {
          content: withMention(input.content, options),
          ...(input.embeds === undefined ? {} : { embeds: input.embeds }),
          allowed_mentions: mentionRule(options),
          nonce: newNonce(),
          enforce_nonce: true,
          attachments: input.files.map((file, id) => ({ id, filename: file.name })),
        },
        input.files,
      ),
    );
  }

  private async direct(input: SendInput, userId: string): Promise<unknown> {
    const { policy, rest } = this.deps;
    policy.assertUser(userId);
    const dm = SENT_DM.parse(await rest.post('/users/@me/channels', { recipient_id: userId }));
    policy.noteDm(dm.id, userId);
    return this.post({ ...input, userId: undefined, notifyUserId: undefined }, dm.id);
  }

  private async channelReply(input: Reply, origin: EventOrigin): Promise<unknown> {
    const { statuses } = this.deps;
    const replyTo = origin.messageId;
    if (input.status === true) {
      return statuses.show(input.eventId, input.content, (content) =>
        this.sendParts(origin.channelId, { content }, { replyTo }),
      );
    }
    const options: SendOptions = {
      replyTo,
      notify: input.notifyRequester === true ? origin.actorId : undefined,
    };
    const sent = await this.sendParts(origin.channelId, input, options);
    await statuses.settle(
      input.eventId,
      sent.parts === undefined
        ? { message: sent, content: withMention(input.content, options) }
        : undefined,
    );
    return sent;
  }

  private async interactionReply(
    input: Reply,
    live: LiveInteraction,
    channelId: string,
  ): Promise<unknown> {
    const [head = '', ...rest] = input.content === '' ? [''] : splitMessage(input.content);
    const done = await this.deps.interactions.deliver(live, {
      content: head,
      embeds: input.embeds,
      status: input.status,
    });
    if (rest.length > 0) {
      await this.sendParts(channelId, { content: rest.join('\n') }, {});
    }
    return done;
  }

  private async sendParts(
    channelId: string,
    message: Rich,
    options: SendOptions,
  ): Promise<Posted & { readonly parts?: number }> {
    if (!hasBody(message)) {
      throw new DiscordInputError('A message needs text or at least one embed');
    }
    const text = withMention(message.content, options);
    const parts = text === '' ? [''] : splitMessage(text);
    const sent: Posted[] = [];
    for (const [index, content] of parts.entries()) {
      sent.push(
        POSTED.parse(
          await this.deps.rest.post(
            `/channels/${channelId}/messages`,
            partBody({ content, index, count: parts.length, message }, options),
          ),
        ),
      );
    }
    const [first] = sent;
    if (first === undefined) {
      throw new DiscordInputError('Nothing was sent');
    }
    return sent.length > 1 ? { ...first, parts: sent.length } : first;
  }
}
