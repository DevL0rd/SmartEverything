import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, resolve, sep } from 'node:path';
import { randomInt } from 'node:crypto';
import type { TalkChannelRow, TalkMessageRow } from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import { OggOpusWriter } from './ogg';
import type { PacketSink } from './transmission';

const HOUR_MS = 3_600_000;

class TalkPathError extends Error {
  override readonly name = 'TalkPathError';

  constructor(storagePath: string) {
    super(`The talk message path ${storagePath} leaves the talk directory.`);
  }
}

export interface Recording extends PacketSink {
  readonly storagePath: string;
  readonly saved: () => Promise<boolean>;
}

export interface RecorderOptions {
  readonly store: Pick<Store, 'host'>;
  readonly directory: string;
  readonly now: () => Date;
  readonly log: Logger;
}

export class TalkRecorder {
  private readonly root: string;

  constructor(private readonly options: RecorderOptions) {
    this.root = resolve(options.directory);
  }

  pathOf(storagePath: string): string {
    const path = resolve(this.root, storagePath);
    if (!path.startsWith(`${this.root}${sep}`)) {
      throw new TalkPathError(storagePath);
    }
    return path;
  }

  open(channelId: string, messageId: string): Recording {
    const storagePath = `${channelId}/${messageId}.ogg`;
    const path = this.pathOf(storagePath);
    const pages = new PassThrough();
    const done = this.save(pages, path).then(
      () => true,
      (cause: unknown) => {
        this.options.log.warn('talk.recording_failed', { messageId, reason: messageOf(cause) });
        return false;
      },
    );
    const writer = new OggOpusWriter(randomInt(1, 0x7fffffff), (page) => {
      pages.write(page);
    });
    writer.start();
    return {
      storagePath,
      packet: (packet): void => {
        writer.packet(packet);
      },
      end: (): void => {
        writer.end();
        pages.end();
      },
      saved: () => done,
    };
  }

  private async save(pages: PassThrough, path: string): Promise<void> {
    try {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    } catch (cause) {
      pages.destroy();
      throw cause;
    }
    await pipeline(pages, createWriteStream(path, { mode: 0o600 }));
  }

  async remove(storagePath: string): Promise<void> {
    await rm(this.pathOf(storagePath), { force: true });
  }

  async discard(messages: readonly TalkMessageRow[]): Promise<void> {
    await Promise.all(
      messages.flatMap((message) =>
        message.storage_path === null ? [] : [this.remove(message.storage_path)],
      ),
    );
  }

  async prune(channel: TalkChannelRow): Promise<void> {
    const before = new Date(this.options.now().getTime() - channel.keep_hours * HOUR_MS);
    const expired = await this.options.store.host.write('talkPrune', {
      channelId: channel.id,
      before: before.toISOString(),
    });
    await this.discard(expired);
  }

  async clearUnfinished(): Promise<void> {
    const { removed, channels } = await this.options.store.host.write('talkClearUnfinished', null);
    await this.discard(removed);
    await Promise.all(channels.map((channel) => this.prune(channel)));
  }
}
