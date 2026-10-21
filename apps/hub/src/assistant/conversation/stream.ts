import { Logger } from '@smarteverything/logging';
import { TurnTimeline } from './turn-timeline';
import type { ToolTimelineDetails } from './tool-timeline-details';
import type { ChatTimelineEmbed } from '@smarteverything/domain';
import {
  CHAT_RETRYING_REASON,
  settledSteps,
  type ChatActivityNotice,
  type ChatStreamNotice,
  type ChatStreamPart,
  type ChatToolItem,
  type SettledStep,
} from '@smarteverything/domain';

const log = new Logger('hub.assistant-stream');
const STALL_MS = 15_000;
const FLUSH_MS = 50;
const PARTS_PER_FRAME = 64;

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
  private messageId: string | null;
  private attempt: AssistantAttempt | null = null;
  private seq = 0;
  private parts: ChatStreamPart[] = [];
  private timer: NodeJS.Timeout | null = null;
  private draft = '';
  private reasoningText = '';
  private readonly tools = new Map<string, ChatToolItem>();
  private readonly openedAt = performance.now();
  private lastPartAt = performance.now();
  private firstPartMs: number | null = null;
  private pushed = { text: 0, reasoning: 0, tool: 0 };
  private frames = 0;
  private stalls = 0;

  constructor(
    private readonly target: StreamTarget,
    private readonly emit: StreamEmit,
  ) {
    this.messageId = target.messageId;
  }

  private ids(): Record<string, unknown> {
    return {
      chatId: this.target.chatId,
      turnId: this.target.turnId,
      messageId: this.messageId,
      profileId: this.target.profileId,
    };
  }

  get quiet(): boolean {
    return (
      this.attempt === null && ![...this.tools.values()].some((tool) => tool.state === 'running')
    );
  }

  endSegment(): void {
    this.flush();
    this.timeline.finish(false);
    this.timeline.flush();
  }

  beginSegment(messageId: string): void {
    this.messageId = messageId;
    this.timeline.clear();
    this.tools.clear();
    this.draft = '';
    this.reasoningText = '';
    this.seq += 1;
    this.snapshot('thinking', null, null);
  }

  text(delta: string): void {
    this.timeline.text('text', delta);
    this.draft += delta;
    this.state = 'replying';
    this.reason = null;
    this.push({ kind: 'text', delta });
  }

  assistantAttempt(settlement: AssistantAttemptSettlement): void {
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
      return;
    }
    const checkpoint = this.attempt;
    if (checkpoint?.id !== settlement.id)
      throw new AssistantAttemptProjectionError(checkpoint?.id ?? null, settlement.id);
    this.attempt = null;
    if (settlement.state === 'committed') return;
    this.close();
    this.parts = [];
    this.draft = checkpoint.text;
    this.reasoningText = checkpoint.reasoning;
    this.timeline.restore(checkpoint.timeline);
    this.seq += 1;
    this.snapshot('thinking', null, null);
  }
  get spoken(): string {
    return this.draft.trim();
  }

  reasoning(delta: string): void {
    this.timeline.text('reasoning', delta);
    this.reasoningText += delta;
    this.state = 'thinking';
    this.reason = null;
    this.push({ kind: 'reasoning', delta });
  }

  retrying(): void {
    this.snapshot('thinking', null, CHAT_RETRYING_REASON);
  }

  steer(messageId: string): void {
    this.timeline.steer(messageId);
    this.snapshot(this.state, null, null);
  }

  tool(item: ChatToolItem, details: ToolTimelineDetails = {}): void {
    this.timeline.tool(item, details);
    this.tools.set(item.callId, item);
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
      messageId: this.messageId,
      seq: this.seq,
      state: this.state,
      steps: this.settled().map((step) => step.title),
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
    if (this.state !== state) {
      log.debug('stream.state_changed', () => ({
        ...this.ids(),
        from: this.state,
        to: state,
        finish,
      }));
    }
    if (state === 'idle' || state === 'failed') {
      log.debug('stream.summary', () => ({
        ...this.ids(),
        outcome: state,
        finish,
        textChars: this.pushed.text,
        reasoningChars: this.pushed.reasoning,
        toolParts: this.pushed.tool,
        tools: this.tools.size,
        frames: this.frames,
        stalls: this.stalls,
        firstPartMs: this.firstPartMs ?? undefined,
        durationMs: Math.round(performance.now() - this.openedAt),
      }));
    }
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
    const now = performance.now();
    if (this.firstPartMs === null) {
      this.firstPartMs = Math.round(now - this.openedAt);
      log.debug('stream.first_part', () => ({
        ...this.ids(),
        kind: part.kind,
        firstPartMs: this.firstPartMs,
      }));
    } else if (now - this.lastPartAt > STALL_MS) {
      this.stalls += 1;
      log.warn('stream.resumed_after_stall', {
        ...this.ids(),
        gapMs: Math.round(now - this.lastPartAt),
        kind: part.kind,
      });
    }
    this.lastPartAt = now;
    if (part.kind === 'text') this.pushed.text += part.delta.length;
    else if (part.kind === 'reasoning') this.pushed.reasoning += part.delta.length;
    else this.pushed.tool += 1;
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
    const parts = this.parts.splice(0, PARTS_PER_FRAME);
    this.frames += 1;
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
