import { randomUUID } from 'node:crypto';
import type {
  AiChatRow,
  AssistantReasonCode,
  ChatTimelineEmbed,
  SettledStep,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ConversationLog } from '../../conversation-log';

export class ProviderReplies {
  private readonly id = randomUUID();
  private content = '';

  constructor(
    private readonly conversation: ConversationLog,
    chat: AiChatRow,
    replyTo: string | null,
    private readonly model: string,
  ) {
    this.written(conversation.startReply({ id: this.id, chat, replyTo, model }), 'start');
  }

  text(delta: string): void {
    this.content += delta;
    this.written(this.conversation.flushReply(this.id, this.content), 'text');
  }

  fullText(): string {
    return this.content;
  }

  timeline(timeline: ChatTimelineEmbed): void {
    this.written(this.conversation.timeline(this.id, timeline), 'timeline');
  }

  async finish(steps: readonly SettledStep[]): Promise<void> {
    await this.conversation.finishReply(this.id, this.content, {
      model: this.model,
      steps,
      sources: [],
    });
  }

  fail(
    reason: string,
    steps: readonly SettledStep[],
    code: AssistantReasonCode = 'unknown',
  ): Promise<void> {
    return this.conversation.failReply(this.id, { text: this.content, reason, code }, steps);
  }

  private written(write: Promise<unknown>, step: string): void {
    background(write, 'computer.reply_write_failed', { replyId: this.id, step });
  }
}
