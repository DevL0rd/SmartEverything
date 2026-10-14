import {
  ASSISTANT_TEXT_MAX,
  type AiChatRow,
  type SettledStep,
  type ChatTimelineEmbed,
  timelineChunks,
} from '@smarteverything/domain';
import type { ConversationLog } from '../../conversation-log';

export class ProviderReplies {
  private readonly chunks: { readonly id: string; text: string }[];
  constructor(
    private readonly conversation: ConversationLog,
    private readonly chat: AiChatRow,
    private readonly replyTo: string | null,
    private readonly model: string,
  ) {
    this.chunks = [{ id: conversation.startReply(chat, replyTo, model).id, text: '' }];
  }

  text(delta: string): void {
    let remaining = delta;
    while (remaining !== '') {
      const last = this.chunks.at(-1);
      if (last === undefined) throw new Error('The provider reply has no storage chunk.');
      const room = ASSISTANT_TEXT_MAX - last.text.length;
      if (room === 0) {
        this.conversation.finishReply(last.id, last.text, {
          model: this.model,
          steps: [],
          sources: [],
        });
        this.chunks.push({
          id: this.conversation.startReply(this.chat, this.replyTo, this.model).id,
          text: '',
        });
        continue;
      }
      last.text += remaining.slice(0, room);
      remaining = remaining.slice(room);
      this.conversation.flushReply(last.id, last.text);
    }
  }

  fullText(): string {
    return this.chunks.map((chunk) => chunk.text).join('');
  }

  timeline(timeline: ChatTimelineEmbed): void {
    const pieces = timelineChunks(timeline.parts, ASSISTANT_TEXT_MAX);
    for (const [index, parts] of pieces.entries()) {
      const chunk = this.chunks[index];
      if (chunk === undefined) throw new Error('The tool timeline lost its reply storage chunk.');
      this.conversation.timeline(chunk.id, { ...timeline, parts: [...parts] });
    }
  }

  finish(steps: readonly SettledStep[]): void {
    const last = this.chunks.at(-1);
    if (last === undefined) throw new Error('The provider reply has no storage chunk.');
    this.conversation.finishReply(last.id, last.text, { model: this.model, steps, sources: [] });
  }

  fail(reason: string, steps: readonly SettledStep[]): void {
    const last = this.chunks.at(-1);
    if (last === undefined) throw new Error('The provider reply has no storage chunk.');
    this.conversation.failReply(last.id, { text: last.text, reason, code: 'unknown' }, steps);
  }
}
