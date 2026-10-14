import { TurnTimeline } from './turn-timeline';
import type { ToolTimelineDetails } from './tool-timeline-details';
import type { ChatTimelineEmbed } from '@smarteverything/domain';
import {
  settledSteps,
  type ChatActivityNotice,
  type ChatStreamNotice,
  type ChatStreamPart,
  type ChatToolItem,
  type SettledStep,
} from '@smarteverything/domain';

const FLUSH_MS = 50;
const PARTS_PER_FRAME = 64;
const TOOLS_PER_SNAPSHOT = 64;
const STEPS_PER_SNAPSHOT = 40;

export interface StreamTarget {
  readonly chatId: string;
  readonly turnId: string;
  readonly messageId: string | null;
  readonly profileId: string;
}

export type StreamEmit = (notice: ChatActivityNotice | ChatStreamNotice, profileId: string) => void;

interface AssistantAttempt {
  readonly id: string;
  readonly text: string;
  readonly reasoning: string;
  readonly timeline: ChatTimelineEmbed;
}
interface AssistantAttemptSettlement {
  readonly id: string;
  readonly state: 'started' | 'committed' | 'discarded';
}
class AssistantAttemptProjectionError extends Error {
  override readonly name = 'AssistantAttemptProjectionError';
  constructor(
    readonly expected: string | null,
    readonly received: string,
  ) {
    super('Assistant stream settlement differs from its active projection checkpoint.');
  }
}
export class TurnStream {
  private readonly timeline = new TurnTimeline();
  private attempt: AssistantAttempt | null = null;
  private seq = 0;
  private parts: ChatStreamPart[] = [];
  private timer: NodeJS.Timeout | null = null;
  private draft = '';
  private reasoningText = '';
  private readonly tools = new Map<string, ChatToolItem>();

  constructor(
    private readonly target: StreamTarget,
    private readonly emit: StreamEmit,
    private readonly textLimit?: number,
  ) {}

  text(delta: string): void {
    this.timeline.text('text', delta);
    this.draft += delta;
    if (this.textLimit !== undefined) this.draft = this.draft.slice(-this.textLimit);
    this.state = 'replying';
    this.push({ kind: 'text', delta });
  }

  assistantAttempt(settlement: AssistantAttemptSettlement): boolean {
    if (settlement.state === 'started') {
      if (this.attempt !== null)
        throw new AssistantAttemptProjectionError(this.attempt.id, settlement.id);
      this.flush();
      this.attempt = {
        id: settlement.id,
        text: this.draft,
        reasoning: this.reasoningText,
        timeline: this.timeline.current(),
      };
      return false;
    }
    const checkpoint = this.attempt;
    if (checkpoint?.id !== settlement.id)
      throw new AssistantAttemptProjectionError(checkpoint?.id ?? null, settlement.id);
    this.attempt = null;
    if (settlement.state === 'committed') return false;
    this.close();
    this.parts = [];
    this.draft = checkpoint.text;
    this.reasoningText = checkpoint.reasoning;
    this.timeline.restore(checkpoint.timeline);
    this.seq += 1;
    this.snapshot('thinking', null, null);
    return true;
  }
  get content(): string {
    return this.draft;
  }
  get spoken(): string {
    return this.draft.trim();
  }

  reasoning(delta: string): void {
    this.timeline.text('reasoning', delta);
    this.reasoningText += delta;
    if (this.textLimit !== undefined)
      this.reasoningText = this.reasoningText.slice(-this.textLimit);
    this.state = 'thinking';
    this.push({ kind: 'reasoning', delta });
  }

  tool(item: ChatToolItem, details: ToolTimelineDetails = {}): void {
    this.timeline.tool(item, details);
    this.tools.set(item.callId, item);
    if (this.textLimit !== undefined && this.tools.size > TOOLS_PER_SNAPSHOT) {
      const oldest = this.tools.keys().next().value;
      if (oldest !== undefined) this.tools.delete(oldest);
    }
    this.push({ kind: 'tool', ...item });
    this.snapshot('tool', null, null);
  }

  bindTimeline(persist: (timeline: ChatTimelineEmbed) => void): void {
    this.timeline.bind(persist);
  }

  private state: ChatActivityNotice['state'] = 'thinking';
  private finish: string | null = null;
  private reason: string | null = null;

  settled(): readonly SettledStep[] {
    return settledSteps([...this.tools.values()]);
  }

  current(): ChatActivityNotice {
    return {
      type: 'chat_activity',
      chatId: this.target.chatId,
      turnId: this.target.turnId,
      messageId: this.target.messageId,
      seq: this.seq,
      state: this.state,
      steps: this.settled()
        .map((step) => step.title)
        .slice(-STEPS_PER_SNAPSHOT),
      draft: this.draft,
      reasoning: this.reasoningText,
      tools: [...this.tools.values()],
      finish: this.finish,
      reason: this.reason,
    };
  }

  snapshot(state: ChatActivityNotice['state'], finish: string | null, reason: string | null): void {
    this.flush();
    if (state === 'idle' || state === 'failed') this.timeline.finish(finish === 'stopped');
    this.timeline.flush();
    this.state = state;
    this.finish = finish;
    this.reason = reason;
    this.emit(this.current(), this.target.profileId);
  }

  close(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private push(part: ChatStreamPart): void {
    this.parts.push(part);
    if (this.parts.length >= PARTS_PER_FRAME) {
      this.flush();
      return;
    }
    this.timer ??= setTimeout(() => {
      this.flush();
    }, FLUSH_MS);
  }

  private flush(): void {
    this.close();
    if (this.parts.length === 0) {
      return;
    }
    this.timeline.flush();
    const parts = this.parts.splice(0, PARTS_PER_FRAME);
    this.seq += 1;
    this.emit(
      {
        type: 'chat_stream',
        chatId: this.target.chatId,
        turnId: this.target.turnId,
        seq: this.seq,
        parts,
      },
      this.target.profileId,
    );
    if (this.parts.length > 0) {
      this.flush();
    }
  }
}
