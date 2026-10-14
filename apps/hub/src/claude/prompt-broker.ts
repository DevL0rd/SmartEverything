import { randomUUID } from 'node:crypto';
import {
  CLAUDE_QUESTION,
  type ClaudeAnswer,
  type ClaudePrompt,
  type JsonValue,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { Cancel, Clock } from '../clock';
import {
  ClaudeInvalidAnswerError,
  ClaudePromptNotFoundError,
  ClaudePromptNotWaitingError,
} from './errors';
import { NO_ANSWER, type HookOutput } from './hook-events';
import { outputFor, type HookEvent, type PromptVerdict } from './hook-output';
import { PROMPT_HOLD_MS } from './link-paths';
import { classifyPrompt, type Risk } from './prompt-risk';

const FINISHED_KEPT = 50;

const RISKY_HOLD_MS = 0;

const QUESTIONS = z.array(
  z.object({
    question: z.string(),
    header: z.string().nullish(),
    multiSelect: z.boolean().default(false),
    options: z
      .array(z.object({ label: z.string(), description: z.string().nullish() }))
      .default([]),
  }),
);

export type Requester = 'owner' | 'ai';

export interface HoldRequest {
  readonly sessionId: string;
  readonly event: HookEvent;
  readonly toolName: string;
  readonly input: Readonly<Record<string, JsonValue>>;
  readonly cwd: string | null;
}

export interface BrokerOptions {
  readonly clock: Clock;
  readonly log: Logger;
  readonly holdMs?: number;
  readonly riskyHoldMs?: number;
  readonly changed: () => void;
  readonly raised: (prompt: ClaudePrompt) => void;
  readonly finished?: (prompt: ClaudePrompt) => void;
}

interface Held {
  readonly prompt: ClaudePrompt;
  readonly event: HookEvent;
  readonly input: Readonly<Record<string, JsonValue>>;
  readonly settle: (output: HookOutput) => void;
  readonly cancel: Cancel;
}

function questionsOf(input: Readonly<Record<string, JsonValue>>): ClaudePrompt['questions'] {
  const parsed = QUESTIONS.safeParse(input['questions']);
  return parsed.success
    ? parsed.data.map((entry) =>
        CLAUDE_QUESTION.parse({
          question: entry.question,
          header: entry.header ?? null,
          multi_select: entry.multiSelect,
          options: entry.options.map((option) => ({
            label: option.label,
            description: option.description ?? null,
          })),
        }),
      )
    : [];
}

function kindOf(request: HoldRequest): ClaudePrompt['kind'] {
  if (request.toolName === 'AskUserQuestion') {
    return 'question';
  }
  return request.toolName === 'ExitPlanMode' ? 'plan' : 'permission';
}

function isHeldTool(event: HookEvent, toolName: string): boolean {
  return event === 'PermissionRequest'
    ? toolName !== 'AskUserQuestion'
    : toolName === 'AskUserQuestion';
}

function answersOf(
  prompt: ClaudePrompt,
  body: Extract<ClaudeAnswer, { decision: 'answer' }>,
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const entry of body.answers) {
    const question = prompt.questions.find((candidate) => candidate.question === entry.question);
    if (question === undefined) {
      throw new ClaudeInvalidAnswerError(
        prompt.id,
        `"${entry.question}" is not one of its questions`,
      );
    }
    const labels = question.options.map((option) => option.label);
    const unknown = entry.choices.find((choice) => !labels.includes(choice));
    if (unknown !== undefined) {
      throw new ClaudeInvalidAnswerError(prompt.id, `"${unknown}" is not an offered choice`);
    }
    if (!question.multi_select && entry.choices.length !== 1) {
      throw new ClaudeInvalidAnswerError(prompt.id, 'a single-choice question takes one choice');
    }
    answers[entry.question] = entry.choices.join(', ');
  }
  const missing = prompt.questions.find((question) => answers[question.question] === undefined);
  if (missing !== undefined) {
    throw new ClaudeInvalidAnswerError(prompt.id, `"${missing.question}" has no answer`);
  }
  return answers;
}

function promptOf(request: HoldRequest, risk: Risk, now: Date, holdMs: number): ClaudePrompt {
  return {
    id: randomUUID(),
    session_id: request.sessionId,
    kind: kindOf(request),
    tool_name: request.toolName,
    input: request.input,
    questions: questionsOf(request.input),
    risk: risk.risk,
    risk_reasons: [...risk.reasons],
    state: 'waiting',
    answered_by: null,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + holdMs).toISOString(),
  };
}

export class PromptBroker {
  private readonly waiting = new Map<string, Held>();
  private readonly finished = new Map<string, ClaudePrompt>();

  constructor(private readonly options: BrokerOptions) {}

  prompts(): readonly ClaudePrompt[] {
    return [...this.waiting.values()].map((held) => held.prompt);
  }

  stop(): void {
    for (const id of [...this.waiting.keys()]) {
      this.finish(id, 'expired', null, NO_ANSWER);
    }
  }

  hold(request: HoldRequest, closed: AbortSignal): Promise<HookOutput> {
    if (!isHeldTool(request.event, request.toolName)) {
      return Promise.resolve(NO_ANSWER);
    }
    const now = this.options.clock.now();
    const risk = classifyPrompt({
      toolName: request.toolName,
      input: request.input,
      cwd: request.cwd,
    });
    const holdMs =
      risk.risk === 'risky'
        ? (this.options.riskyHoldMs ?? RISKY_HOLD_MS)
        : (this.options.holdMs ?? PROMPT_HOLD_MS);
    const prompt = promptOf(request, risk, now, holdMs);
    return new Promise((resolve) => {
      const cancel = this.options.clock.at(new Date(now.getTime() + holdMs), () => {
        this.finish(prompt.id, 'expired', null, NO_ANSWER);
      });
      this.waiting.set(prompt.id, {
        prompt,
        event: request.event,
        input: request.input,
        settle: resolve,
        cancel,
      });
      this.announce(prompt, closed);
    });
  }

  private announce(prompt: ClaudePrompt, closed: AbortSignal): void {
    if (closed.aborted) {
      this.finish(prompt.id, 'taken_over', 'desktop', NO_ANSWER);
      return;
    }
    closed.addEventListener(
      'abort',
      () => {
        if (this.waiting.has(prompt.id)) {
          this.finish(prompt.id, 'taken_over', 'desktop', NO_ANSWER);
        }
      },
      { once: true },
    );
    this.options.log.info('prompt.waiting', {
      prompt: prompt.id,
      session: prompt.session_id,
      kind: prompt.kind,
      risk: prompt.risk,
    });
    this.options.changed();
    if (prompt.risk === 'risky') {
      this.options.raised(prompt);
    }
  }

  answer(promptId: string, body: ClaudeAnswer, requester: Requester): ClaudePrompt {
    const held = this.waiting.get(promptId);
    if (held === undefined) {
      const done = this.finished.get(promptId);
      if (done === undefined) {
        throw new ClaudePromptNotFoundError(promptId);
      }
      throw new ClaudePromptNotWaitingError(promptId, done.state);
    }
    const verdict = this.verdictOf(held.prompt, body);
    const state =
      verdict.kind === 'deny' ? 'denied' : verdict.kind === 'allow' ? 'allowed' : 'answered';
    return this.finish(promptId, state, requester, outputFor(held.event, verdict, held.input));
  }

  answerQuestion(
    promptId: string,
    answers: Readonly<Record<string, string>>,
    requester: Requester,
  ): ClaudePrompt {
    const held = this.waiting.get(promptId);
    if (held === undefined) throw new ClaudePromptNotFoundError(promptId);
    if (held.prompt.kind !== 'question')
      throw new ClaudeInvalidAnswerError(
        promptId,
        'only an AskUserQuestion request accepts text answers',
      );
    const expected = new Set(held.prompt.questions.map((question) => question.question));
    if (
      Object.keys(answers).length !== expected.size ||
      Object.keys(answers).some((question) => !expected.has(question))
    ) {
      throw new ClaudeInvalidAnswerError(
        promptId,
        'answer exactly the questions offered by this SDK request',
      );
    }
    const verified = z.record(z.string(), z.string().min(1).max(10_000)).parse(answers);
    return this.finish(
      promptId,
      'answered',
      requester,
      outputFor(held.event, { kind: 'answer', answers: verified }, held.input),
    );
  }

  private verdictOf(prompt: ClaudePrompt, body: ClaudeAnswer): PromptVerdict {
    if (body.decision === 'deny') {
      return { kind: 'deny', reason: body.reason ?? null };
    }
    if (body.decision === 'answer') {
      if (prompt.kind !== 'question') {
        throw new ClaudeInvalidAnswerError(
          prompt.id,
          'only a question takes answers; allow or deny it',
        );
      }
      return { kind: 'answer', answers: answersOf(prompt, body) };
    }
    if (prompt.kind === 'question') {
      throw new ClaudeInvalidAnswerError(prompt.id, 'a question takes its answers, not allow');
    }
    return { kind: 'allow' };
  }

  private finish(
    promptId: string,
    state: ClaudePrompt['state'],
    answeredBy: ClaudePrompt['answered_by'],
    output: HookOutput,
  ): ClaudePrompt {
    const held = this.waiting.get(promptId);
    if (held === undefined) {
      throw new ClaudePromptNotFoundError(promptId);
    }
    held.cancel();
    this.waiting.delete(promptId);
    const prompt: ClaudePrompt = { ...held.prompt, state, answered_by: answeredBy };
    this.finished.set(promptId, prompt);
    const oldest = this.finished.keys().next();
    if (this.finished.size > FINISHED_KEPT && oldest.done !== true) {
      this.finished.delete(oldest.value);
    }
    this.options.log.info('prompt.finished', {
      prompt: promptId,
      session: prompt.session_id,
      state,
      by: answeredBy,
    });
    held.settle(output);
    this.options.finished?.(prompt);
    this.options.changed();
    return prompt;
  }
}
