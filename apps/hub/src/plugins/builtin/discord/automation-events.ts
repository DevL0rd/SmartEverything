import type { PluginEvent, PluginEventKind } from '@smarteverything/domain';
import { z } from 'zod';
import { SNOWFLAKE } from './ids';
import type { DiscordLink, GatewayPacket, LinkHandlers } from './link';
import { GUILD_VOICE_STATES } from './voice/link';
import type { DiscordEnvironment } from './runtime';

export const GUILD_MESSAGE_REACTIONS_INTENT = 1 << 10;

export const POLL_ENDED = {
  kind: 'poll_ended',
  fields: { channel: 'string', message: 'string' },
} as const;

export const PROMPT_ANSWERED = {
  kind: 'prompt_answered',
  fields: { prompt_id: 'string', answer: 'string', user: 'string' },
} as const;

export const DISCORD_EVENT_KINDS: readonly PluginEventKind[] = [
  {
    kind: 'message_received',
    title: 'Message received',
    fields: {
      channel: 'string',
      message: 'string',
      author: 'string',
      text: 'string',
      has_attachment: 'boolean',
    },
    feed: false,
  },
  {
    kind: 'reaction_added',
    title: 'Reaction added',
    fields: { channel: 'string', message: 'string', person: 'string', emoji: 'string' },
    feed: false,
  },
  {
    kind: 'member_joined_server',
    title: 'Someone joined a server',
    fields: { server: 'string', person: 'string' },
    feed: true,
  },
  {
    kind: 'voice_joined',
    title: 'Someone joined a voice channel',
    fields: { channel: 'string', person: 'string' },
    feed: true,
  },
  {
    kind: 'voice_left',
    title: 'Someone left a voice channel',
    fields: { channel: 'string', person: 'string' },
    feed: true,
  },
  {
    kind: 'bot_voice_changed',
    title: 'The assistant joined or left a voice channel',
    fields: { channel: 'string', connected: 'boolean' },
    feed: true,
  },
  { ...PROMPT_ANSWERED, title: 'A question was answered', feed: true },
  { ...POLL_ENDED, title: 'A poll ended', feed: true },
];

const USER = z.looseObject({ id: SNOWFLAKE, bot: z.boolean().optional() });

const READY = z.looseObject({ user: USER });

const MESSAGE = z.looseObject({
  id: SNOWFLAKE,
  channel_id: SNOWFLAKE,
  content: z.string().default(''),
  author: USER,
  attachments: z.array(z.unknown()).default([]),
});

const POLL_UPDATE = z.looseObject({
  id: SNOWFLAKE,
  channel_id: SNOWFLAKE,
  poll: z.looseObject({
    answers: z.array(
      z.looseObject({
        answer_id: z.number(),
        poll_media: z.looseObject({ text: z.string().nullish() }),
      }),
    ),
    results: z
      .looseObject({
        is_finalized: z.boolean(),
        answer_counts: z.array(z.looseObject({ id: z.number(), count: z.number() })),
      })
      .optional(),
  }),
});

const REACTION = z.looseObject({
  user_id: SNOWFLAKE,
  channel_id: SNOWFLAKE,
  message_id: SNOWFLAKE,
  guild_id: SNOWFLAKE.optional(),
  emoji: z.looseObject({ id: SNOWFLAKE.nullish(), name: z.string().nullish() }),
});

const MEMBER_ADD = z.looseObject({ guild_id: SNOWFLAKE, user: USER });

const VOICE_STATE = z.looseObject({
  guild_id: SNOWFLAKE.optional(),
  channel_id: SNOWFLAKE.nullable(),
  user_id: SNOWFLAKE,
  member: z.looseObject({ user: USER.optional() }).optional(),
});

const GUILD_GONE = z.looseObject({ id: SNOWFLAKE, unavailable: z.boolean().optional() });

function emojiId(emoji: {
  readonly id?: string | null | undefined;
  readonly name?: string | null | undefined;
}): string {
  const name = emoji.name ?? '';
  return emoji.id === null || emoji.id === undefined ? name : `${name}:${emoji.id}`;
}

export function promptAnsweredEvent(answered: {
  readonly promptId: string;
  readonly answer: string;
  readonly user: string;
}): PluginEvent {
  return {
    kind: PROMPT_ANSWERED.kind,
    subject: null,
    data: { prompt_id: answered.promptId, answer: answered.answer, user: answered.user },
  };
}

export class DiscordAutomationEvents {
  private botId: string | null = null;
  private readonly voiceChannels = new Map<string, Map<string, string>>();

  constructor(
    private readonly emit: (event: PluginEvent) => void,
    private readonly report: (cause: unknown) => void,
  ) {}

  packet(packet: GatewayPacket): void {
    try {
      this.handlers[packet.t]?.(packet.d);
    } catch (cause) {
      this.report(cause);
    }
  }

  private readonly handlers: Readonly<Record<string, (data: unknown) => void>> = {
    READY: (data) => {
      this.botId = READY.parse(data).user.id;
    },
    GUILD_CREATE: (data) => {
      this.seedVoice(data);
    },
    GUILD_DELETE: (data) => {
      const gone = GUILD_GONE.parse(data);
      if (gone.unavailable !== true) {
        this.voiceChannels.delete(gone.id);
      }
    },
    MESSAGE_CREATE: (data) => {
      this.message(MESSAGE.parse(data));
    },
    MESSAGE_UPDATE: (data) => {
      const update = POLL_UPDATE.safeParse(data);
      if (update.success) this.pollUpdate(update.data);
    },
    MESSAGE_REACTION_ADD: (data) => {
      this.reaction(REACTION.parse(data));
    },
    GUILD_MEMBER_ADD: (data) => {
      this.joinedServer(MEMBER_ADD.parse(data));
    },
    VOICE_STATE_UPDATE: (data) => {
      this.voice(VOICE_STATE.parse(data));
    },
  };

  private seedVoice(data: unknown): void {
    const guild = GUILD_VOICE_STATES.parse(data);
    const seated = new Map<string, string>();
    for (const state of guild.voice_states) {
      if (state.channel_id !== null) {
        seated.set(state.user_id, state.channel_id);
      }
    }
    this.voiceChannels.set(guild.id, seated);
  }

  private message(message: z.output<typeof MESSAGE>): void {
    if (message.author.id === this.botId) {
      return;
    }
    this.emit({
      kind: 'message_received',
      subject: null,
      data: {
        channel: message.channel_id,
        message: message.id,
        author: message.author.id,
        text: message.content,
        has_attachment: message.attachments.length > 0,
      },
    });
  }

  private pollUpdate(update: z.output<typeof POLL_UPDATE>): void {
    const { poll } = update;
    if (poll.results?.is_finalized !== true) return;
    const counts = poll.results.answer_counts;
    this.emit({
      kind: 'poll_ended',
      subject: null,
      data: {
        channel: update.channel_id,
        message: update.id,
        results: poll.answers.map((answer) => ({
          answer: answer.poll_media.text ?? '',
          votes: counts.find((entry) => entry.id === answer.answer_id)?.count ?? 0,
        })),
      },
    });
  }

  private reaction(reaction: z.output<typeof REACTION>): void {
    if (reaction.user_id === this.botId || reaction.guild_id === undefined) {
      return;
    }
    this.emit({
      kind: 'reaction_added',
      subject: null,
      data: {
        channel: reaction.channel_id,
        message: reaction.message_id,
        person: reaction.user_id,
        emoji: emojiId(reaction.emoji),
      },
    });
  }

  private joinedServer(added: z.output<typeof MEMBER_ADD>): void {
    if (added.user.bot === true) {
      return;
    }
    this.emit({
      kind: 'member_joined_server',
      subject: null,
      data: { server: added.guild_id, person: added.user.id },
    });
  }

  private seat(guildId: string, userId: string, channelId: string | null): string | null {
    const seated = this.voiceChannels.get(guildId) ?? new Map<string, string>();
    this.voiceChannels.set(guildId, seated);
    const before = seated.get(userId) ?? null;
    if (channelId === null) {
      seated.delete(userId);
    } else {
      seated.set(userId, channelId);
    }
    return before;
  }

  private voice(state: z.output<typeof VOICE_STATE>): void {
    if (state.guild_id === undefined) {
      return;
    }
    const before = this.seat(state.guild_id, state.user_id, state.channel_id);
    if (before === state.channel_id) {
      return;
    }
    if (state.user_id === this.botId) {
      this.emit({
        kind: 'bot_voice_changed',
        subject: null,
        data: { channel: state.channel_id ?? '', connected: state.channel_id !== null },
      });
    } else if (state.member?.user?.bot !== true) {
      this.moved(state.user_id, before, state.channel_id);
    }
  }

  private moved(person: string, before: string | null, after: string | null): void {
    if (before !== null) {
      this.emit({ kind: 'voice_left', subject: null, data: { channel: before, person } });
    }
    if (after !== null) {
      this.emit({ kind: 'voice_joined', subject: null, data: { channel: after, person } });
    }
  }
}

export function withAutomationEvents(
  environment: DiscordEnvironment,
  emit: (event: PluginEvent) => void,
  report: (cause: unknown) => void,
): DiscordEnvironment {
  return {
    ...environment,
    connect: (options): DiscordLink => {
      const link = environment.connect({
        ...options,
        intents: options.intents | GUILD_MESSAGE_REACTIONS_INTENT,
      });
      const events = new DiscordAutomationEvents(emit, report);
      return {
        ...link,
        connect: (handlers: LinkHandlers): Promise<void> =>
          link.connect({
            ...handlers,
            packet: (packet): void => {
              handlers.packet(packet);
              events.packet(packet);
            },
          }),
      };
    },
  };
}
