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

const BUSY: ReadonlySet<AiHarnessSession['state']> = new Set(['working', 'waiting', 'switching']);

export class NativeSessionActivity {
  private readonly streams = new Map<string, TurnStream>();

  constructor(
    private readonly service: HarnessService,
    private readonly emit: StreamEmit,
    private readonly owned: (chatId: string) => boolean,
  ) {
    service.directory.onOffline(() => {
      for (const chatId of [...this.streams.keys()]) this.sync(chatId);
    });
  }

  received(event: AiHarnessEvent): void {
    if (this.owned(event.chat_id)) return;
    if (event.kind === 'state') this.follow(event, event.session);
    else if (event.kind === 'completed' || event.kind === 'failed') this.close(event.chat_id);
    else this.streamed(event);
  }

  private streamed(
    event: Exclude<AiHarnessEvent, { kind: 'state' | 'completed' | 'failed' }>,
  ): void {
    switch (event.kind) {
      case 'text':
        this.open(event).text(event.delta);
        return;
      case 'reasoning':
        this.open(event).reasoning(event.delta);
        return;
      case 'tool':
        feedTool(this.open(event), {
          callId: event.call_id,
          name: event.name,
          state: event.state,
          detail: event.detail,
          ...(event.input === undefined ? {} : { input: event.input }),
          ...(event.output === undefined ? {} : { output: event.output }),
        });
        return;
      case 'interaction':
        this.open(event);
        return;
      case 'usage':
      case 'agent':
        return;
    }
  }

  yielded(chatId: string): void {
    this.close(chatId);
  }

  sync(chatId: string): void {
    if (this.owned(chatId)) return;
    const chat = this.service.store.aiChats.find(chatId);
    if (chat?.engine.kind !== 'dsh') {
      this.close(chatId);
      return;
    }
    const sessionId = chat.engine.session_id;
    const session =
      sessionId === null ? undefined : this.service.store.harnessSessions.state(sessionId);
    if (
      sessionId === null ||
      session?.epoch === null ||
      session === undefined ||
      !this.online(chat.engine.execution_target)
    ) {
      this.close(chat.id);
      return;
    }
    this.follow({ chat_id: chat.id }, session);
  }

  activity(profileId: string): readonly ChatActivityNotice[] {
    for (const chat of this.service.store.aiChats.usingEngine('dsh'))
      if (chat.profile_id === profileId) this.sync(chat.id);
    return [...this.streams.values()]
      .map((stream) => stream.current())
      .filter((notice) => this.service.store.aiChats.find(notice.chatId)?.profile_id === profileId);
  }

  private online(target: AiHarnessTarget): boolean {
    const key = harnessTargetKey(target);
    return this.service.directory
      .list()
      .some((host) => host.online && harnessTargetKey(host.target) === key);
  }

  private follow(event: Pick<AiHarnessEvent, 'chat_id'>, session: AiHarnessSession): void {
    if (!BUSY.has(session.state)) {
      this.close(event.chat_id);
      return;
    }
    followSession(this.open(event), session);
  }

  private open(event: Pick<AiHarnessEvent, 'chat_id'>): TurnStream {
    const known = this.streams.get(event.chat_id);
    if (known !== undefined) return known;
    const chat = this.service.store.aiChats.chat(event.chat_id);
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
