import type {
  AiChatRow,
  AssistantReasonCode,
  ChatTimelineEmbed,
  SettledStep,
} from '@smarteverything/domain';
import type { ConversationLog } from '../../conversation-log';

export class ProviderReplies {
  private readonly id: string;
  private content = '';

  constructor(
    private readonly conversation: ConversationLog,
    chat: AiChatRow,
    replyTo: string | null,
    private readonly model: string,
  ) {
    this.id = conversation.startReply(chat, replyTo, model).id;
  }

  text(delta: string): void {
    this.content += delta;
    this.conversation.flushReply(this.id, this.content);
  }

  fullText(): string {
    return this.content;
  }

  timeline(timeline: ChatTimelineEmbed): void {
    this.conversation.timeline(this.id, timeline);
  }

  finish(steps: readonly SettledStep[]): void {
    this.conversation.finishReply(this.id, this.content, {
      model: this.model,
      steps,
      sources: [],
    });
  }

  fail(reason: string, steps: readonly SettledStep[], code: AssistantReasonCode = 'unknown'): void {
    this.conversation.failReply(this.id, { text: this.content, reason, code }, steps);
  }
}
