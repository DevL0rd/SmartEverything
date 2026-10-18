import type { Logger } from '@smarteverything/logging';
import type { ToolAnswer } from './tool-answer';

interface Ids {
  readonly sessionId: string;
  readonly chatId: string | null;
  readonly pluginId: string;
}

function since(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

export class TurnSessionTrace {
  constructor(
    private readonly log: Logger,
    private readonly ids: Ids,
    private readonly generation: () => number,
  ) {}

  private fields(): Record<string, unknown> {
    return { ...this.ids, generation: this.generation() };
  }

  openFailed(cause: unknown, startedAt: number): void {
    this.log.error('voice.turn_session_open_failed', cause, {
      ...this.fields(),
      durationMs: since(startedAt),
    });
  }

  opened(startedAt: number): void {
    this.log.info('voice.turn_session_opened', { ...this.fields(), durationMs: since(startedAt) });
  }

  closedWhileOpening(): void {
    this.log.info('voice.turn_session_closed_while_opening', this.fields());
  }

  ended(reason: string, detail: string | null): void {
    this.log.info('voice.turn_session_ended', {
      ...this.fields(),
      reason,
      detail: detail === null ? undefined : detail.slice(0, 200),
    });
  }

  toolCalled(tool: string, callId: string, own: boolean, argumentKeys: number): void {
    this.log.debug('voice.turn_tool_called', () => ({
      ...this.fields(),
      tool,
      callId,
      own,
      argumentKeys,
    }));
  }

  toolAnswered(tool: string, callId: string, answer: ToolAnswer, startedAt: number): void {
    this.log.debug('voice.turn_tool_answered', () => ({
      ...this.fields(),
      tool,
      callId,
      failed: 'error' in answer.response,
      pictures: answer.pictures.length,
      durationMs: since(startedAt),
    }));
  }

  taskRefused(cause: unknown): void {
    this.log.warn('voice.turn_task_refused', {
      ...this.fields(),
      cause: cause instanceof Error ? cause.name : typeof cause,
    });
  }

  dropped(reason: string, code: number): void {
    this.log.warn('voice.turn_session_dropped', {
      ...this.fields(),
      reason: reason.slice(0, 200),
      code,
    });
  }
}
