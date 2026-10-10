import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, sep } from 'node:path';
import { z } from 'zod';
import type { Reach } from './authority';
import type { Channels } from './channels';
import { DiscordInputError, DiscordPolicyError } from './errors';
import { SNOWFLAKE } from './ids';
import type { DiscordRest } from './link';
import { attachmentUrl, type Downloader } from './media-download';
import { FILE_NAME, inspectFile } from './media-formats';
import {
  MEDIA_MESSAGE,
  MEDIA_SEARCH,
  matches,
  type MediaEntry,
  type MediaIndex,
} from './media-index';
import type { OutFile } from './outgoing';
import type { Policy } from './policy';

const MAX_DOWNLOADS = 3;
const CHUNK_BYTES = 131_072;

export const MEDIA_HISTORY = MEDIA_SEARCH.omit({ cursor: true }).extend({
  before: SNOWFLAKE.optional(),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export const MEDIA_READ = z.strictObject({
  sourceId: z.uuid(),
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
  readonly complete: boolean;
  readonly image: boolean;
  readonly mimeType: string;
}

export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[^\p{L}\p{N}_. -]/gu, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[^\p{L}\p{N}_]+/u, '');
  return cleaned.slice(-100);
}

export async function readLocalFile(
  path: string,
  maxBytes: number,
  roots: readonly string[],
): Promise<OutFile> {
  const real = await realpath(path).catch(() => {
    throw new DiscordInputError(`File not found: ${basename(path)}`);
  });
  const resolved = await Promise.all(roots.map((root) => realpath(root).catch(() => null)));
  const allowed = resolved.filter((root) => root !== null);
  if (!allowed.some((root) => real === root || real.startsWith(`${root}${sep}`))) {
    throw new DiscordPolicyError(
      'Only files in the plugin’s outbox folder or this chat’s own attachments can be sent by path',
    );
  }
  const info = await stat(real);
  if (!info.isFile()) {
    throw new DiscordInputError('Only regular files can be sent');
  }
  if (info.size > maxBytes) {
    throw new DiscordInputError(
      `${basename(real)} is larger than the ${String(Math.round(maxBytes / 1024))} KiB file limit`,
    );
  }
  const data = await readFile(real);
  const name = safeFileName(basename(real));
  FILE_NAME.parse(name);
  const contentType = await inspectFile(data, name);
  return { data, name, contentType, sha256: createHash('sha256').update(data).digest('hex') };
}

function unchanged(
  found: MediaEntry['attachment'] | undefined,
  known: MediaEntry['attachment'],
): found is MediaEntry['attachment'] {
  return found?.size === known.size && found.filename === known.filename;
}

export class MediaService {
  private downloads = 0;

  constructor(private readonly deps: MediaDeps) {}

  assertEnabled(): void {
    const { settings } = this.deps;
    if (!settings.enabled) {
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
    if (messages.some((message) => message.channel_id !== channelId)) {
      throw new DiscordInputError('Discord history source mismatch');
    }
    const entries = messages
      .flatMap((message) => index.records(message, guildId))
      .filter((entry) => matches(entry, input));
    return {
      attachments: entries.slice(0, input.limit).map((entry) => index.expose(reach, entry)),
      coverage: 'discord-channel-history-page',
      incomplete: true,
      scannedMessages: messages.length,
      truncatedAttachments: entries.length > input.limit,
      remaining: entries
        .slice(input.limit)
        .map((entry) => ({ messageId: entry.messageId, attachmentId: entry.attachment.id })),
      nextBefore: input.messageId === undefined ? (messages.at(-1)?.id ?? null) : null,
    };
  }

  async read(reach: Reach, input: z.output<typeof MEDIA_READ>): Promise<AttachmentRead> {
    if (this.downloads >= MAX_DOWNLOADS) {
      throw new DiscordInputError('Too many attachment downloads');
    }
    this.downloads += 1;
    try {
      return await this.downloadRead(reach, input);
    } finally {
      this.downloads -= 1;
    }
  }

  private async fresh(reach: Reach, sourceId: string): Promise<MediaEntry> {
    const { index, rest } = this.deps;
    const source = index.source(reach, sourceId);
    await this.channel(reach, source.channelId);
    const message = MEDIA_MESSAGE.parse(
      await rest.get(`/channels/${source.channelId}/messages/${source.messageId}`),
    );
    if (
      message.id !== source.messageId ||
      message.channel_id !== source.channelId ||
      message.author.id !== source.userId
    ) {
      throw new DiscordPolicyError('Attachment source identity changed');
    }
    const attachment = message.attachments.find((item) => item.id === source.attachment.id);
    if (!unchanged(attachment, source.attachment)) {
      throw new DiscordInputError('Attachment was removed or changed');
    }
    return { ...source, attachment };
  }

  private async downloadRead(
    reach: Reach,
    input: z.output<typeof MEDIA_READ>,
  ): Promise<AttachmentRead> {
    this.assertEnabled();
    const source = await this.fresh(reach, input.sourceId);
    const { attachment } = source;
    if (attachment.size > this.deps.settings.maxFileBytes) {
      throw new DiscordInputError('Attachment exceeds the file size limit in the plugin settings');
    }
    const url = attachmentUrl(attachment.url, source.channelId, attachment.id);
    const bytes = await this.deps.download(url, attachment.size);
    if (bytes.length !== attachment.size) {
      throw new DiscordInputError('Attachment byte count mismatch');
    }
    const mimeType = await inspectFile(
      bytes,
      attachment.filename,
      attachment.content_type ?? undefined,
    );
    this.deps.policy.assertOrigin(reach.origin);
    if (input.offset >= bytes.length) {
      throw new DiscordInputError('Offset is outside attachment');
    }
    const chunk = bytes.subarray(input.offset, input.offset + input.length);
    const end = input.offset + chunk.length;
    return {
      info: {
        sourceId: input.sourceId,
        fileName: attachment.filename,
        mimeType,
        size: bytes.length,
        offset: input.offset,
        nextOffset: end < bytes.length ? end : null,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        complete: chunk.length === bytes.length,
        imageTypeVerified: mimeType.startsWith('image/'),
      },
      chunk,
      complete: chunk.length === bytes.length,
      image: mimeType.startsWith('image/'),
      mimeType,
    };
  }
}
