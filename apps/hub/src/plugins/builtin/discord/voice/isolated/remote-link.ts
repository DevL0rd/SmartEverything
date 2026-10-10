import type { ChildHost } from '../../../../isolation/child-host';
import type { VoiceClosing, VoiceLink } from '../link';
import type { VoiceCommand } from './protocol';

class PacketQueue implements AsyncIterable<Uint8Array> {
  private readonly items: Uint8Array[] = [];
  private waiting: ((result: IteratorResult<Uint8Array>) => void) | null = null;
  private done = false;

  push(packet: Uint8Array): void {
    if (this.done) {
      return;
    }
    if (this.waiting === null) {
      this.items.push(packet);
      return;
    }
    const resolve = this.waiting;
    this.waiting = null;
    resolve({ value: packet, done: false });
  }

  end(): void {
    this.done = true;
    const resolve = this.waiting;
    this.waiting = null;
    resolve?.({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return {
      next: (): Promise<IteratorResult<Uint8Array>> => {
        const packet = this.items.shift();
        if (packet !== undefined) {
          return Promise.resolve({ value: packet, done: false });
        }
        if (this.done) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve) => {
          this.waiting = resolve;
        });
      },
    };
  }
}

export interface RemoteLinkParts {
  readonly linkId: string;
  readonly channelId: string;
  readonly muted: boolean;
  readonly host: ChildHost;
  readonly finished: () => void;
}

export class RemoteLink implements VoiceLink {
  private readonly speaking: ((userId: string) => void)[] = [];
  private readonly closing: ((reason: VoiceClosing, cause: unknown) => void)[] = [];
  private readonly streams = new Map<number, PacketQueue>();
  private selfMuted: boolean;
  private lastStream = 0;
  private closed = false;

  constructor(private readonly parts: RemoteLinkParts) {
    this.selfMuted = parts.muted;
  }

  get channelId(): string {
    return this.parts.channelId;
  }

  muted = (): boolean => this.selfMuted;

  setMuted(muted: boolean): boolean {
    const sent = this.command({ name: 'mute', payload: { linkId: this.parts.linkId, muted } });
    if (sent) {
      this.selfMuted = muted;
    }
    return sent;
  }

  onSpeaking(listener: (userId: string) => void): void {
    this.speaking.push(listener);
  }

  listen(userId: string, silenceMs: number): AsyncIterable<Uint8Array> {
    const queue = new PacketQueue();
    if (this.closed) {
      queue.end();
      return queue;
    }
    this.lastStream += 1;
    this.streams.set(this.lastStream, queue);
    this.command({
      name: 'listen',
      payload: { linkId: this.parts.linkId, streamId: this.lastStream, userId, silenceMs },
    });
    return queue;
  }

  play(packet: Uint8Array): void {
    this.command({ name: 'play', payload: { linkId: this.parts.linkId, packet } });
  }

  stop(): void {
    this.command({ name: 'stop', payload: { linkId: this.parts.linkId } });
  }

  onClosed(listener: (reason: VoiceClosing, cause: unknown) => void): void {
    this.closing.push(listener);
  }

  destroy(): void {
    if (this.closed) {
      return;
    }
    this.command({ name: 'destroy', payload: { linkId: this.parts.linkId } });
    this.finish();
  }

  heard(userId: string): void {
    this.speaking.forEach((listener) => {
      listener(userId);
    });
  }

  packet(streamId: number, packet: Uint8Array): void {
    this.streams.get(streamId)?.push(packet);
  }

  streamEnded(streamId: number): void {
    this.streams.get(streamId)?.end();
    this.streams.delete(streamId);
  }

  closedBy(reason: VoiceClosing, cause: unknown): void {
    if (this.closed) {
      return;
    }
    this.finish();
    this.closing.forEach((listener) => {
      listener(reason, cause);
    });
  }

  private finish(): void {
    this.closed = true;
    this.streams.forEach((queue) => {
      queue.end();
    });
    this.streams.clear();
    this.parts.finished();
  }

  private command(command: VoiceCommand): boolean {
    return this.parts.host.send(command.name, command.payload);
  }
}
