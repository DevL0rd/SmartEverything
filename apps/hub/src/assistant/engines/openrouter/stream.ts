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

export interface StreamTarget {
  readonly chatId: string;
  readonly turnId: string;
  readonly messageId: string | null;
  readonly profileId: string;
}

export type StreamEmit = (notice: ChatActivityNotice | ChatStreamNotice, profileId: string) => void;

export class TurnStream {
  private seq = 0;
  private parts: ChatStreamPart[] = [];
  private timer: NodeJS.Timeout | null = null;
  private draft = '';
  private separate = false;
  private reasoningText = '';
  private readonly tools = new Map<string, ChatToolItem>();

  constructor(
    private readonly target: StreamTarget,
    private readonly emit: StreamEmit,
  ) {}

  text(delta: string): void {
    const joined = this.separate && this.draft.trim() !== '' ? `\n\n${delta}` : delta;
    this.separate = false;
    this.draft += joined;
    this.state = 'replying';
    this.push({ kind: 'text', delta: joined });
  }

  get spoken(): string {
    return this.draft.trim();
  }

  reasoning(delta: string): void {
    this.reasoningText += delta;
    this.push({ kind: 'reasoning', delta });
  }

  newStep(): void {
    this.separate = true;
  }

  tool(item: ChatToolItem): void {
    this.tools.set(item.callId, item);
    this.push({ kind: 'tool', ...item });
    this.snapshot('tool', null, null);
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
