import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { randomInt } from 'node:crypto';
import type { TalkChannelRow, TalkMessageRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import { OggOpusWriter } from './ogg';
import type { PacketSink } from './transmission';

const TALK_DIRECTORY = 'talk';
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
  readonly store: Store;
  readonly dataDirectory: string;
  readonly now: () => Date;
  readonly log: Logger;
}

function closed(stream: WriteStream): Promise<boolean> {
  return new Promise((done) => {
    stream.once('close', () => {
      done(!stream.errored);
    });
  });
}

export class TalkRecorder {
  private readonly root: string;

  constructor(private readonly options: RecorderOptions) {
    this.root = resolve(options.dataDirectory, TALK_DIRECTORY);
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
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const stream = createWriteStream(path, { mode: 0o600 });
    const done = closed(stream);
    stream.on('error', (cause) => {
      this.options.log.warn('talk.recording_failed', { messageId, reason: cause.message });
    });
    const writer = new OggOpusWriter(randomInt(1, 0x7fffffff), (page) => {
      stream.write(page);
    });
    writer.start();
    return {
      storagePath,
      packet: (packet): void => {
        writer.packet(packet);
      },
      end: (): void => {
        writer.end();
        stream.end();
      },
      saved: () => done,
    };
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
    const expired = this.options.store.talk.expired(channel.id, before.toISOString());
    expired.forEach((message) => this.options.store.talk.removeMessage(message.id));
    await this.discard(expired);
  }

  async clearUnfinished(): Promise<void> {
    const unfinished = this.options.store.talk.unfinished();
    unfinished.forEach((message) => this.options.store.talk.removeMessage(message.id));
    await this.discard(unfinished);
    await Promise.all(this.options.store.talk.channels().map((channel) => this.prune(channel)));
  }
}
