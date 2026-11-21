import { randomUUID } from 'node:crypto';
import {
  harnessTargetKey,
  type AiHarnessEvent,
  type AiHarnessTarget,
  type AiHarnessSession,
  type ChatActivityNotice,
} from '@smarteverything/domain';
import { TurnStream, type StreamEmit } from '../../conversation/stream';
import type { HarnessService } from '../../../harness/service';
import { feedTool, followSession } from './turn-feed';
import { background } from '@smarteverything/logging';

const BUSY: ReadonlySet<AiHarnessSession['state']> = new Set(['working', 'waiting', 'switching']);

export class NativeSessionActivity {
  private readonly streams = new Map<string, TurnStream>();

  constructor(
    private readonly service: HarnessService,
    private readonly emit: StreamEmit,
    private readonly owned: (chatId: string) => boolean,
  ) {
    service.directory.onOffline(() => {
      for (const chatId of [...this.streams.keys()]) this.resync(chatId);
    });
  }

  async received(event: AiHarnessEvent): Promise<void> {
    if (this.owned(event.chat_id)) return;
    if (event.kind === 'state') await this.follow(event, event.session);
    else if (event.kind === 'completed' || event.kind === 'failed') this.close(event.chat_id);
    else await this.streamed(event);
  }

  private async streamed(
    event: Exclude<AiHarnessEvent, { kind: 'state' | 'completed' | 'failed' }>,
  ): Promise<void> {
    switch (event.kind) {
      case 'text':
        (await this.open(event)).text(event.delta);
        return;
      case 'reasoning':
        (await this.open(event)).reasoning(event.delta);
        return;
      case 'tool':
        feedTool(await this.open(event), {
          callId: event.call_id,
          name: event.name,
          state: event.state,
          detail: event.detail,
          ...(event.input === undefined ? {} : { input: event.input }),
          ...(event.output === undefined ? {} : { output: event.output }),
        });
        return;
      case 'interaction':
        await this.open(event);
        return;
      case 'usage':
      case 'agent':
        return;
    }
  }

  yielded(chatId: string): void {
    this.close(chatId);
  }

  resync(chatId: string): void {
    background(this.sync(chatId), 'dsh.session_activity_failed', { chatId });
  }

  private async sync(chatId: string): Promise<void> {
    if (this.owned(chatId)) return;
    const { host } = this.service.store;
    const chat = await host.call('aiChats', 'find', chatId);
    if (chat?.engine.kind !== 'dsh') {
      this.close(chatId);
      return;
    }
    const sessionId = chat.engine.session_id;
    const session =
      sessionId === null ? undefined : await host.call('harnessSessions', 'state', sessionId);
    if (
      sessionId === null ||
      session?.epoch === null ||
      session === undefined ||
      !this.online(chat.engine.execution_target)
    ) {
      this.close(chat.id);
      return;
    }
    await this.follow({ chat_id: chat.id }, session);
  }

  async activity(profileId: string): Promise<readonly ChatActivityNotice[]> {
    const chats = await this.service.store.host.call('aiChats', 'usingEngine', 'dsh');
    const owned = new Set(
      chats.filter((chat) => chat.profile_id === profileId).map((chat) => chat.id),
    );
    for (const chatId of owned) await this.sync(chatId);
    return [...this.streams.values()]
      .map((stream) => stream.current())
      .filter((notice) => owned.has(notice.chatId));
  }

  private online(target: AiHarnessTarget): boolean {
    const key = harnessTargetKey(target);
    return this.service.directory
      .list()
      .some((host) => host.online && harnessTargetKey(host.target) === key);
  }

  private async follow(
    event: Pick<AiHarnessEvent, 'chat_id'>,
    session: AiHarnessSession,
  ): Promise<void> {
    if (!BUSY.has(session.state)) {
      this.close(event.chat_id);
      return;
    }
    followSession(await this.open(event), session);
  }

  private async open(event: Pick<AiHarnessEvent, 'chat_id'>): Promise<TurnStream> {
    const known = this.streams.get(event.chat_id);
    if (known !== undefined) return known;
    const chat = await this.service.store.host.call('aiChats', 'chat', event.chat_id);
    const raced = this.streams.get(chat.id);
    if (raced !== undefined) return raced;
    const stream = new TurnStream(
      { chatId: chat.id, turnId: randomUUID(), messageId: null, profileId: chat.profile_id },
      this.emit,
    );
    this.streams.set(chat.id, stream);
    stream.snapshot('thinking', null, null);
    return stream;
  }

  private close(chatId: string): void {
    const stream = this.streams.get(chatId);
    if (stream === undefined) return;
    this.streams.delete(chatId);
    stream.snapshot('idle', null, null);
  }
}
