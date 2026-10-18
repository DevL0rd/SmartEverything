import { describe, expect, it } from 'vitest';
import { DiscordInputError, DiscordPolicyError } from '../../../src/plugins/builtin/discord/errors';
import type { Downloader } from '../../../src/plugins/builtin/discord/media-download';
import { MediaIndex, MEDIA_MESSAGE } from '../../../src/plugins/builtin/discord/media-index';
import { MediaService } from '../../../src/plugins/builtin/discord/media-service';
import { CHANNEL, GUILD, OTHER_CHANNEL, OWNER_ID, worldOf } from './fakes';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const MESSAGE_ID = '700000000000000001';
const PICTURE_ID = '800000000000000001';
const NOTES_ID = '800000000000000002';

function messageWith(attachments: readonly Record<string, unknown>[], id = MESSAGE_ID): unknown {
  return {
    id,
    channel_id: CHANNEL,
    author: { id: OWNER_ID },
    timestamp: '2026-10-16T10:00:00.000Z',
    attachments,
  };
}

const PICTURE = {
  id: PICTURE_ID,
  filename: 'Screenshot (2).png',
  size: PNG.length,
  content_type: 'image/png',
  url: 'https://cdn.discordapp.com/attachments/1/2/shot.png?ex=1',
};
const NOTES = {
  id: NOTES_ID,
  filename: 'notes.txt',
  size: 300_000,
  content_type: 'text/plain',
  url: 'https://cdn.discordapp.com/attachments/1/3/notes.txt?ex=1',
};

function rigged(): {
  world: ReturnType<typeof worldOf>;
  index: MediaIndex;
  media: MediaService;
  fetched: string[];
} {
  const world = worldOf();
  const fetched: string[] = [];
  const download: Downloader = (url) => {
    fetched.push(url);
    return Promise.resolve({
      data: url.includes('notes') ? Buffer.alloc(300_000, 97) : PNG,
      type: null,
    });
  };
  const index = new MediaIndex(
    world.policy,
    { enabled: true, capture: 'all', maxAttachments: 3, ttlMinutes: 30 },
    Date.now,
  );
  const media = new MediaService({
    rest: world.rest,
    policy: world.policy,
    channels: world.channels,
    index,
    download,
    settings: { enabled: true, maxFileBytes: 1024 * 1024 },
  });
  world.rest.answer(
    'GET',
    `/channels/${CHANNEL}/messages/${MESSAGE_ID}`,
    messageWith([PICTURE, NOTES]),
  );
  return { world, index, media, fetched };
}

const reachOf = (
  channelId = CHANNEL,
): { origin: { actorId: string; channelId: string; guildId: string } } => ({
  origin: { actorId: OWNER_ID, channelId, guildId: GUILD },
});

describe('reading attachments', () => {
  it('reads a picture by message and attachment id in one hop', async () => {
    const { media, fetched } = rigged();
    const read = await media.read(reachOf(), {
      messageId: MESSAGE_ID,
      attachmentId: PICTURE_ID,
      offset: 0,
      length: 10,
    });
    expect(read.image).toBe(true);
    expect(read.chunk.equals(PNG)).toBe(true);
    expect(read.info).toMatchObject({
      fileName: 'Screenshot (2).png',
      mimeType: 'image/png',
      nextOffset: null,
    });
    expect(fetched).toStrictEqual([PICTURE.url]);
  });

  it('reads other files in chunks that continue at nextOffset', async () => {
    const { media } = rigged();
    const first = await media.read(reachOf(), {
      messageId: MESSAGE_ID,
      attachmentId: NOTES_ID,
      offset: 0,
      length: 131_072,
    });
    expect(first.chunk).toHaveLength(131_072);
    expect(first.info['nextOffset']).toBe(131_072);
    const last = await media.read(reachOf(), {
      messageId: MESSAGE_ID,
      attachmentId: NOTES_ID,
      offset: 262_144,
      length: 131_072,
    });
    expect(last.chunk).toHaveLength(300_000 - 262_144);
    expect(last.info['nextOffset']).toBeNull();
  });

  it('tells the AI when the message has no such attachment or is in another place', async () => {
    const { media, world } = rigged();
    await expect(
      media.read(reachOf(), {
        messageId: MESSAGE_ID,
        attachmentId: '800000000000000099',
        offset: 0,
        length: 10,
      }),
    ).rejects.toBeInstanceOf(DiscordInputError);
    world.rest.answer(
      'GET',
      `/channels/${OTHER_CHANNEL}/messages/${MESSAGE_ID}`,
      messageWith([PICTURE]),
    );
    await expect(
      media.read(
        { origin: { actorId: OWNER_ID, channelId: CHANNEL, guildId: null } },
        {
          messageId: MESSAGE_ID,
          attachmentId: PICTURE_ID,
          channelId: OTHER_CHANNEL,
          offset: 0,
          length: 10,
        },
      ),
    ).rejects.toBeInstanceOf(DiscordPolicyError);
  });
});

describe('finding attachments', () => {
  it('returns message id, attachment id and url from history and from the index', async () => {
    const { media, index, world } = rigged();
    world.rest.answer('GET', `/channels/${CHANNEL}/messages`, [messageWith([PICTURE])]);
    const history = await media.history(reachOf(), { limit: 10, kind: 'all', pageSize: 25 });
    expect(history['attachments']).toMatchObject([
      { messageId: MESSAGE_ID, attachmentId: PICTURE_ID, url: PICTURE.url, channelId: CHANNEL },
    ]);
    index.ingest(MEDIA_MESSAGE.parse(messageWith([PICTURE, NOTES])), GUILD, true);
    const found = media.search(reachOf(), { limit: 10, kind: 'image' });
    expect(found.attachments).toMatchObject([{ messageId: MESSAGE_ID, attachmentId: PICTURE_ID }]);
    expect(found.truncated).toBe(false);
  });

  it('keeps the index at its size setting by dropping the oldest', () => {
    const { index } = rigged();
    for (let count = 1; count <= 5; count += 1) {
      index.ingest(
        MEDIA_MESSAGE.parse(
          messageWith(
            [{ ...PICTURE, id: `80000000000000010${String(count)}` }],
            `70000000000000010${String(count)}`,
          ),
        ),
        GUILD,
        true,
      );
    }
    const found = index.search(reachOf(), { limit: 25, kind: 'all' });
    expect(found.attachments.map((entry) => entry['attachmentId'])).toStrictEqual([
      '800000000000000105',
      '800000000000000104',
      '800000000000000103',
    ]);
    expect(found.indexed).toBe(3);
  });
});
