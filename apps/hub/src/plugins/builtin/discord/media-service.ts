import { z } from 'zod';
import type { Reach } from './authority';
import type { Channels } from './channels';
import { DiscordInputError, DiscordPolicyError } from './errors';
import { SNOWFLAKE } from './ids';
import type { DiscordRest } from './link';
import { mimeOf, type Downloader } from './media-download';
import { MEDIA_MESSAGE, MEDIA_SEARCH, matches, type MediaIndex } from './media-index';
import type { Policy } from './policy';

const CHUNK_BYTES = 131_072;

export const MEDIA_HISTORY = MEDIA_SEARCH.extend({
  before: SNOWFLAKE.optional(),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export const MEDIA_READ = z.strictObject({
  messageId: SNOWFLAKE,
  attachmentId: SNOWFLAKE,
  channelId: SNOWFLAKE.optional(),
  offset: z.number().int().min(0).default(0),
  length: z.number().int().min(1).max(CHUNK_BYTES).default(CHUNK_BYTES),
});

interface MediaServiceSettings {
  readonly enabled: boolean;
  readonly maxFileBytes: number;
}

export interface MediaDeps {
  readonly rest: DiscordRest;
  readonly policy: Policy;
  readonly channels: Channels;
  readonly index: MediaIndex;
  readonly download: Downloader;
  readonly settings: MediaServiceSettings;
}

export interface AttachmentRead {
  readonly info: Readonly<Record<string, unknown>>;
  readonly chunk: Buffer;
  readonly image: boolean;
  readonly mimeType: string;
}

export class MediaService {
  constructor(private readonly deps: MediaDeps) {}

  assertEnabled(): void {
    if (!this.deps.settings.enabled) {
      throw new DiscordPolicyError('Attachments are switched off in the plugin settings');
    }
  }

  async channel(reach: Reach, channelId: string): Promise<string | null> {
    const { origin } = reach;
    if (origin.guildId === null) {
      if (origin.channelId !== channelId) {
        throw new DiscordPolicyError('DM media must remain in the originating DM');
      }
      return null;
    }
    const channel = await this.deps.channels.guildChannel(channelId);
    if (channel.guild_id !== origin.guildId) {
      throw new DiscordPolicyError('Media must remain in the originating guild');
    }
    return origin.guildId;
  }

  search(reach: Reach, input: z.output<typeof MEDIA_SEARCH>): ReturnType<MediaIndex['search']> {
    this.assertEnabled();
    this.deps.policy.assertOrigin(reach.origin);
    return this.deps.index.search(reach, input);
  }

  async history(
    reach: Reach,
    input: z.output<typeof MEDIA_HISTORY>,
  ): Promise<Readonly<Record<string, unknown>>> {
    this.assertEnabled();
    const { rest, index } = this.deps;
    const channelId = input.channelId ?? reach.origin.channelId;
    const guildId = await this.channel(reach, channelId);
    const route = `/channels/${channelId}/messages`;
    const page =
      input.messageId === undefined
        ? await rest.get(
            route,
            new URLSearchParams({
              limit: String(input.pageSize),
              ...(input.before === undefined ? {} : { before: input.before }),
            }),
          )
        : [await rest.get(`${route}/${input.messageId}`)];
    const messages = z.array(MEDIA_MESSAGE).max(100).parse(page);
    const entries = messages
      .flatMap((message) => index.records(message, guildId))
      .filter((entry) => matches(entry, input));
    return {
      attachments: entries.slice(0, input.limit).map((entry) => index.describe(entry)),
      scannedMessages: messages.length,
      truncated: entries.length > input.limit,
      nextBefore: input.messageId === undefined ? (messages.at(-1)?.id ?? null) : null,
    };
  }

  async read(reach: Reach, input: z.output<typeof MEDIA_READ>): Promise<AttachmentRead> {
    this.assertEnabled();
    const { rest, policy, download, settings } = this.deps;
    const channelId = input.channelId ?? reach.origin.channelId;
    const guildId = await this.channel(reach, channelId);
    const message = MEDIA_MESSAGE.parse(
      await rest.get(`/channels/${channelId}/messages/${input.messageId}`),
    );
    const attachment = message.attachments.find((item) => item.id === input.attachmentId);
    if (attachment === undefined) {
      throw new DiscordInputError('That message has no attachment with this attachmentId');
    }
    policy.assertObservation({ actorId: message.author.id, channelId, guildId });
    const { data, type } = await download(attachment.url, settings.maxFileBytes);
    const mimeType = await mimeOf(data, attachment.content_type ?? type);
    const image = mimeType.startsWith('image/');
    const chunk = image ? data : data.subarray(input.offset, input.offset + input.length);
    const end = (image ? 0 : input.offset) + chunk.length;
    return {
      info: {
        fileName: attachment.filename,
        mimeType,
        size: data.length,
        offset: image ? 0 : input.offset,
        nextOffset: end < data.length ? end : null,
      },
      chunk,
      image,
      mimeType,
    };
  }
}
