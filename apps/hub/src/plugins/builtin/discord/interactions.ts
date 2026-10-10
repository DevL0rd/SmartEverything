import { z } from 'zod';
import type { DiscordRest } from './link';
import { NO_MENTIONS, type Delivery } from './outgoing';

export const INTERACTION_LIFETIME_MS = 15 * 60_000;
const FADE_MS = 6000;

const CALLBACK_TYPES = {
  message: 4,
  deferredMessage: 5,
  deferredUpdate: 6,
  modal: 9,
} as const;

export interface LiveInteraction {
  readonly id: string;
  readonly applicationId: string;
  readonly token: string;
  readonly quiet: boolean;
  readonly expiresAt: number;
}

const SENT = z.looseObject({ id: z.string(), channel_id: z.string() });

export type InteractionResult = z.output<typeof SENT>;

export class Interactions {
  private readonly live = new Map<string, LiveInteraction>();

  constructor(
    private readonly rest: DiscordRest,
    private readonly now: () => number,
    private readonly report: (cause: unknown) => void,
  ) {}

  register(eventId: string, interaction: LiveInteraction): void {
    this.live.set(eventId, interaction);
  }

  get(eventId: string): LiveInteraction | undefined {
    const found = this.live.get(eventId);
    if (found !== undefined && found.expiresAt <= this.now()) {
      this.live.delete(eventId);
      return undefined;
    }
    return found;
  }

  deferReply(
    interaction: Pick<LiveInteraction, 'id' | 'token'>,
    update: boolean,
  ): Promise<unknown> {
    return this.rest.anonymous.post(
      `/interactions/${interaction.id}/${interaction.token}/callback`,
      {
        type: update ? CALLBACK_TYPES.deferredUpdate : CALLBACK_TYPES.deferredMessage,
      },
    );
  }

  reply(interaction: Pick<LiveInteraction, 'id' | 'token'>, content: string): Promise<unknown> {
    return this.rest.anonymous.post(
      `/interactions/${interaction.id}/${interaction.token}/callback`,
      {
        type: CALLBACK_TYPES.message,
        data: { content, allowed_mentions: NO_MENTIONS },
      },
    );
  }

  editOriginal(
    interaction: Pick<LiveInteraction, 'applicationId' | 'token'>,
    body: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    return this.rest.anonymous.patch(
      `/webhooks/${interaction.applicationId}/${interaction.token}/messages/@original`,
      { ...body, allowed_mentions: NO_MENTIONS },
    );
  }

  showModal(interaction: Pick<LiveInteraction, 'id' | 'token'>, modal: unknown): Promise<unknown> {
    return this.rest.anonymous.post(
      `/interactions/${interaction.id}/${interaction.token}/callback`,
      {
        type: CALLBACK_TYPES.modal,
        data: modal,
      },
    );
  }

  async deliver(interaction: LiveInteraction, payload: Delivery): Promise<InteractionResult> {
    const body = {
      content: payload.content,
      allowed_mentions: NO_MENTIONS,
      ...(payload.components === undefined ? {} : { components: payload.components }),
      ...(payload.embeds === undefined ? {} : { embeds: payload.embeds }),
    };
    const fleeting = payload.status === true;
    const files = payload.files ?? [];
    const follow = interaction.quiet || fleeting || files.length > 0;
    const sent = SENT.parse(
      follow
        ? await this.followUp(interaction, body, files)
        : await this.rest.anonymous.patch(
            `/webhooks/${interaction.applicationId}/${interaction.token}/messages/@original`,
            { ...body, attachments: [] },
          ),
    );
    if (fleeting) {
      this.fadeLater(interaction, sent.id);
    }
    return { id: sent.id, channel_id: sent.channel_id };
  }

  private followUp(
    interaction: LiveInteraction,
    body: Readonly<Record<string, unknown>>,
    files: NonNullable<Delivery['files']>,
  ): Promise<unknown> {
    const route = `/webhooks/${interaction.applicationId}/${interaction.token}?wait=true`;
    return files.length === 0
      ? this.rest.anonymous.post(route, body)
      : this.rest.anonymous.postFiles(
          route,
          { ...body, attachments: files.map((file, id) => ({ id, filename: file.name })) },
          files,
        );
  }

  private fadeLater(interaction: LiveInteraction, messageId: string): void {
    const timer = setTimeout(() => {
      this.rest.anonymous
        .delete(`/webhooks/${interaction.applicationId}/${interaction.token}/messages/${messageId}`)
        .catch((cause: unknown) => {
          this.report(cause);
        });
    }, FADE_MS);
    timer.unref();
  }
}
