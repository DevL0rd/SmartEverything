import { QUESTION_ANSWER, admitQuestionAnswer } from './question-answer';
import { reaskedReply } from './reasked-reply';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { JSON_VALUE, AI_HARNESS_INTERACTION, appendTo } from '@smarteverything/domain';
import type { AiHarnessAnswer, AiHarnessInteraction } from '@smarteverything/domain';
import type { HarnessInteractionPort } from '../host/interactions';
import { HarnessRuntimeError } from '../host/errors';

const APPROVAL = z.enum(['allowed-once', 'rejected', 'cancelled', 'unavailable']);
interface Pending {
  readonly sessionId: string;
  readonly epoch: number;
  readonly request: AiHarnessInteraction['request'];
  readonly kind: AiHarnessInteraction['kind'];
  readonly settle: (value: unknown) => void;
}
export class ProcessInteractions implements HarnessInteractionPort {
  private readonly pending = new Map<string, Pending>();
  private readonly cancelled = new Map<string, AiHarnessInteraction[]>();
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
  takeCancelled(sessionId: string): AiHarnessInteraction[] {
    const asked = this.cancelled.get(sessionId) ?? [];
    this.cancelled.delete(sessionId);
    return asked;
  }
  forget(sessionId: string): void {
    this.cancelled.delete(sessionId);
  }
  restore(
    sessionId: string,
    asked: readonly AiHarnessInteraction[],
    steer: (text: string) => void,
  ): void {
    for (const item of asked) {
      const id = randomUUID();
      const epoch = this.epoch(sessionId);
      this.pending.set(id, {
        sessionId,
        epoch,
        kind: item.kind,
        request: item.request,
        settle: (answer): void => {
          steer(reaskedReply(item, answer));
        },
      });
      this.publish(sessionId, { id, epoch, kind: item.kind, request: item.request });
    }
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
    const payload = JSON_VALUE.parse(request);
    let abort: (() => void) | undefined;
    try {
      return await new Promise<unknown>((resolve, reject) => {
        this.pending.set(id, {
          sessionId,
          epoch,
          kind,
          request: payload,
          settle: resolve,
        });
        abort = (): void => {
          reject(new HarnessRuntimeError('operation_failed', 'Native interaction was cancelled.'));
        };
        if (signal?.aborted === true) {
          abort();
          return;
        }
        signal?.addEventListener('abort', abort, { once: true });
        this.publish(sessionId, { id, epoch, kind, request: payload });
      });
    } finally {
      if (abort !== undefined) signal?.removeEventListener('abort', abort);
      if (this.pending.delete(id)) {
        if (signal?.aborted === true)
          appendTo(this.cancelled, sessionId, { id, epoch, kind, request: payload });
        this.publish(sessionId, null);
      }
    }
  }
}
