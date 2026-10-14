import { QUESTION_ANSWER, admitQuestionAnswer } from './question-answer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { JSON_VALUE, AI_HARNESS_INTERACTION } from '@smarteverything/domain';
import type { AiHarnessAnswer, AiHarnessInteraction } from '@smarteverything/domain';
import type { HarnessInteractionPort } from '../host/interactions';
import { HarnessRuntimeError } from '../host/errors';

const APPROVAL = z.enum(['allowed-once', 'rejected', 'cancelled', 'unavailable']);
interface Pending {
  readonly sessionId: string;
  readonly epoch: number;
  readonly request: unknown;
  readonly kind: AiHarnessInteraction['kind'];
  readonly settle: (value: unknown) => void;
  readonly reject: (cause: Error) => void;
}
export class ProcessInteractions implements HarnessInteractionPort {
  private readonly pending = new Map<string, Pending>();
  constructor(
    private readonly epoch: (id: string) => number,
    private readonly publish: (id: string, interaction: AiHarnessInteraction | null) => void,
  ) {}
  pendingFor(sessionId: string): readonly AiHarnessInteraction[] {
    return [...this.pending].flatMap(([id, pending]) =>
      pending.sessionId === sessionId
        ? [
            AI_HARNESS_INTERACTION.parse({
              id,
              epoch: pending.epoch,
              kind: pending.kind,
              request: pending.request,
            }),
          ]
        : [],
    );
  }
  approve: HarnessInteractionPort['approve'] = async (request) => {
    const answer = await this.ask(
      request.agent.id,
      'permission',
      {
        tool_name: request.toolName,
        ...(request.callId === undefined ? {} : { call_id: request.callId }),
        ...(request.reason === undefined ? {} : { reason: request.reason }),
      },
      request.signal,
    );
    return APPROVAL.parse(answer);
  };
  question: HarnessInteractionPort['question'] = async (request) => {
    if (request.agent === undefined)
      throw new HarnessRuntimeError('operation_failed', 'Questions require an owned native agent.');
    const answer = QUESTION_ANSWER.parse(
      await this.ask(
        request.agent.id,
        'question',
        { questions: request.questions },
        request.signal,
      ),
    );
    return {
      answers: answer.answers.map((item) => ({
        id: item.id,
        selected: item.selected,
        ...(item.custom === undefined ? {} : { custom: item.custom }),
      })),
    };
  };
  answer(sessionId: string, input: AiHarnessAnswer): void {
    const pending = this.pending.get(input.interaction_id);
    if (pending?.sessionId !== sessionId || pending.epoch !== input.expected_epoch)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'This question or approval is no longer pending at this native epoch.',
      );
    const answer =
      pending.kind === 'permission'
        ? APPROVAL.parse(input.answer)
        : admitQuestionAnswer(pending.request, input.answer);
    this.pending.delete(input.interaction_id);
    this.publish(sessionId, null);
    pending.settle(answer);
  }
  private async ask(
    sessionId: string,
    kind: AiHarnessInteraction['kind'],
    request: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const id = randomUUID();
    const epoch = this.epoch(sessionId);
    let abort: (() => void) | undefined;
    try {
      return await new Promise<unknown>((resolve, reject) => {
        this.pending.set(id, {
          sessionId,
          epoch,
          kind,
          request: JSON_VALUE.parse(request),
          settle: resolve,
          reject,
        });
        abort = (): void => {
          reject(new HarnessRuntimeError('operation_failed', 'Native interaction was cancelled.'));
        };
        if (signal?.aborted === true) {
          abort();
          return;
        }
        signal?.addEventListener('abort', abort, { once: true });
        this.publish(sessionId, { id, epoch, kind, request: JSON_VALUE.parse(request) });
      });
    } finally {
      if (abort !== undefined) signal?.removeEventListener('abort', abort);
      if (this.pending.delete(id)) this.publish(sessionId, null);
    }
  }
}
