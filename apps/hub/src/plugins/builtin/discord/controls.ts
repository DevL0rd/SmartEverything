import { randomUUID } from 'node:crypto';
import type { InboundMessage } from '@smarteverything/domain';
import { replyEmbed, type CommandReply, type CommandSet } from './commands';
import { DiscordPolicyError } from './errors';
import { INTERACTION_LIFETIME_MS, type Interactions, type LiveInteraction } from './interactions';
import type { EventOrigin } from './origins';
import { INTERACTION_TYPES, inputFieldsOf, type RawInteraction } from './payloads';
import { person, rawPerson } from './person';
import { CONTROL_PREFIX, type ControlInput } from './prompts';
import { conversationFor, inboundOf, requestText } from './request';
import type { DiscordServices } from './services';
import { ASK_COMMANDS } from './operations/guilds';
import type { VoiceService } from './voice/service';
import type { Typing } from './typing';

const DENIED = 'You are not approved to use this bot here.';
const CONTROL_DENIED =
  'This control is only for its original approved requester, or is no longer active.';
const ANSWER_PREFIX = 'The person answered your question: ';

export interface ControlsDeps {
  readonly services: DiscordServices;
  readonly interactions: Interactions;
  readonly commands: ReadonlyMap<string, CommandSet>;
  readonly calls: Pick<VoiceService, 'contextFor'>;
  readonly guildNames: ReadonlyMap<string, string>;
  readonly typing: Typing;
  readonly post: (message: InboundMessage) => void;
  readonly report: (cause: unknown) => void;
  readonly refused: (cause: unknown) => void;
}

interface Actor {
  readonly id: string;
  readonly origin: Pick<EventOrigin, 'actorId' | 'channelId' | 'guildId'>;
}

function actorOf(raw: RawInteraction): Actor | null {
  const user = raw.member?.user ?? raw.user;
  if (user === undefined || raw.channel_id === undefined) {
    return null;
  }
  return {
    id: user.id,
    origin: { actorId: user.id, channelId: raw.channel_id, guildId: raw.guild_id ?? null },
  };
}

function textOf(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}

function optionOf(raw: RawInteraction, name: string): string | undefined {
  const found = raw.data?.options?.find((option) => option.name === name)?.value;
  return typeof found === 'string' ? found : undefined;
}

function asks(name: string | undefined): boolean {
  return name !== undefined && ASK_COMMANDS.has(name);
}

export class Controls {
  constructor(private readonly deps: ControlsDeps) {}

  async interaction(raw: RawInteraction): Promise<void> {
    if (raw.application_id !== this.deps.services.identity.applicationId) {
      return;
    }
    const actor = actorOf(raw);
    if (actor === null) {
      return;
    }
    this.learn(raw, actor.id);
    if (raw.type === INTERACTION_TYPES.command) {
      await this.command(raw, actor);
    } else if (raw.type === INTERACTION_TYPES.component || raw.type === INTERACTION_TYPES.modal) {
      await this.control(raw, actor);
    }
  }

  private learn(raw: RawInteraction, actorId: string): void {
    const { policy, directory } = this.deps.services;
    if (raw.member !== undefined && raw.guild_id !== undefined) {
      policy.noteRoles(actorId, raw.guild_id, raw.member.roles);
    }
    const user = raw.member?.user ?? raw.user;
    if (user !== undefined) {
      directory.learnVisible(
        rawPerson(user, raw.member),
        raw.guild_id ?? null,
        raw.member !== undefined,
      );
    }
  }

  private live(raw: RawInteraction, quiet: boolean): LiveInteraction {
    return {
      id: raw.id,
      applicationId: raw.application_id,
      token: raw.token,
      quiet,
      expiresAt: this.deps.services.now() + INTERACTION_LIFETIME_MS,
    };
  }

  private async command(raw: RawInteraction, actor: Actor): Promise<void> {
    const { services, interactions, commands } = this.deps;
    const name = raw.data?.name;
    const set = name === undefined ? undefined : commands.get(name);
    if (set === undefined && !asks(name)) {
      return;
    }
    const live = this.live(raw, false);
    try {
      services.policy.assertOrigin(actor.origin);
    } catch (cause) {
      if (!(cause instanceof DiscordPolicyError)) {
        throw cause;
      }
      await interactions.reply(live, DENIED);
      return;
    }
    if (set === undefined) {
      await this.ask(raw, actor, live);
      return;
    }
    await interactions.deferReply(live, false);
    const reply = await set
      .run({
        name: set.name,
        conversation: actor.origin.channelId,
        guildId: actor.origin.guildId,
        actorId: actor.id,
        options: Object.fromEntries(
          (raw.data?.options ?? []).map((option) => [option.name, textOf(option.value)]),
        ),
      })
      .catch((error: unknown): CommandReply => ({
        title: 'Could not do that',
        tone: 'warn',
        lines: [error instanceof Error ? error.message : 'Something went wrong'],
      }));
    await interactions.editOriginal(live, { embeds: [replyEmbed(reply)] });
  }

  private async ask(raw: RawInteraction, actor: Actor, live: LiveInteraction): Promise<void> {
    const { services, interactions } = this.deps;
    const user = raw.member?.user ?? raw.user;
    const origin: EventOrigin = {
      id: randomUUID(),
      kind: 'interaction',
      ...actor.origin,
      text: optionOf(raw, 'text') ?? '',
      author: user === undefined ? person(actor.id) : rawPerson(user, raw.member),
      receivedAt: new Date(services.now()).toISOString(),
    };
    services.origins.capture(origin);
    interactions.register(origin.id, live);
    await interactions.deferReply(live, false);
    await this.hand(
      origin,
      requestText(origin, this.deps.calls.contextFor(origin.guildId, origin.actorId), []),
    );
  }

  private async control(raw: RawInteraction, actor: Actor): Promise<void> {
    const { services, interactions } = this.deps;
    const customId = raw.data?.custom_id;
    if (customId?.startsWith(CONTROL_PREFIX) !== true) {
      return;
    }
    const live = this.live(raw, true);
    const modal = raw.type === INTERACTION_TYPES.modal;
    let accepted: ReturnType<typeof services.flows.accept>;
    try {
      accepted = services.flows.accept(this.inputOf(raw, actor, customId, modal));
    } catch (cause) {
      this.deps.refused(cause);
      await interactions.reply(live, CONTROL_DENIED);
      return;
    }
    if (accepted.modal !== undefined) {
      await interactions.showModal(live, accepted.modal);
      return;
    }
    const child: EventOrigin = {
      id: randomUUID(),
      kind: 'interaction',
      ...actor.origin,
      sourceEventId: accepted.origin.id,
      text: accepted.text ?? '',
      author: accepted.origin.author ?? person(actor.id),
      receivedAt: new Date(services.now()).toISOString(),
    };
    services.origins.capture(child);
    interactions.register(child.id, live);
    await interactions.deferReply(live, true);
    await this.clearControl(raw, modal);
    await this.hand(child, `${ANSWER_PREFIX}${child.text}`);
  }

  private inputOf(
    raw: RawInteraction,
    actor: Actor,
    customId: string,
    modal: boolean,
  ): ControlInput {
    const fields = Object.fromEntries(
      inputFieldsOf(raw.data?.components ?? []).map((field) => [field.custom_id, field.value]),
    );
    return {
      customId,
      actorId: actor.id,
      channelId: actor.origin.channelId,
      guildId: actor.origin.guildId,
      applicationId: raw.application_id,
      modal,
      componentType: modal ? 0 : (raw.data?.component_type ?? 0),
      messageId: raw.message?.id,
      messageAuthorId: raw.message?.author.id,
      values: raw.data?.values,
      ...(modal ? { fields } : {}),
    };
  }

  private async clearControl(raw: RawInteraction, modal: boolean): Promise<void> {
    if (modal || raw.message === undefined || raw.channel_id === undefined) {
      return;
    }
    await this.deps.services.rest
      .patch(`/channels/${raw.channel_id}/messages/${raw.message.id}`, { components: [] })
      .catch(this.deps.report);
  }

  private async hand(origin: EventOrigin, text: string): Promise<void> {
    const { services, typing, guildNames } = this.deps;
    this.deps.post(
      inboundOf({
        origin,
        conversation: await conversationFor(services, guildNames, origin, this.deps.report),
        text,
        attachments: [],
        progress: services.activity.progress(),
      }),
    );
    typing.start(origin.id, () => services.sender.typing(origin.id));
  }
}
