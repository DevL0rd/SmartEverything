import {
  AI_DECISION,
  AI_DECISION_SHAPE,
  aiJsonOf,
  aiShapeInstruction,
  aiShapeSchema,
  type AiShape,
  type JsonValue,
} from '@smarteverything/domain';
import type { ChatMessage, ContentPart } from '../../openrouter/chat-types';
import type { PersonBudgets } from '../../ledger/person-budget';
import { messageOf } from '@smarteverything/logging';
import { IntegrationError } from './integration-error';
import { OneShotSession, type SessionPorts } from './one-shot-session';

export { ONE_SHOT_TOOL_STEPS } from './one-shot-session';

export interface OneShotPicture {
  readonly mimeType: string;
  readonly base64: string;
}

export interface OneShotRequest {
  readonly profileId: string;
  readonly automationId: string;
  readonly role: 'owner' | 'member';
  readonly system: string | null;
  readonly prompt: string;
  readonly pictures: readonly OneShotPicture[];
  readonly shape: AiShape | null;
  readonly tools: readonly string[];
  readonly model: string | null;
  readonly capUsd: number | null;
  readonly signal: AbortSignal;
}

export interface OneShotAnswer {
  readonly text: string;
  readonly result: Readonly<Record<string, JsonValue>> | null;
  readonly tokens: number;
  readonly costUsd: number;
}

export interface OneShotDecision {
  readonly answer: boolean;
  readonly reason: string;
  readonly tokens: number;
  readonly costUsd: number;
}

export interface OneShotPorts extends SessionPorts {
  readonly budgets: Pick<PersonBudgets, 'check'>;
}

type Shaped = { ok: true; value: Record<string, JsonValue> } | { ok: false; problem: string };

function userMessage(prompt: string, pictures: readonly OneShotPicture[]): ChatMessage {
  if (pictures.length === 0) return { role: 'user', content: prompt };
  const parts: ContentPart[] = [
    { type: 'text', text: prompt },
    ...pictures.map((picture): ContentPart => ({
      type: 'image_url',
      image_url: { url: `data:${picture.mimeType};base64,${picture.base64}` },
    })),
  ];
  return { role: 'user', content: parts };
}

function systemText(request: OneShotRequest): string | null {
  const lines = [
    request.system,
    request.shape === null ? null : aiShapeInstruction(request.shape),
  ].filter((line) => line !== null);
  return lines.length === 0 ? null : lines.join('\n\n');
}

function shaped(shape: AiShape, text: string): Shaped {
  const json = aiJsonOf(text);
  if (json === undefined) return { ok: false, problem: 'it held no JSON object' };
  const parsed = aiShapeSchema(shape).safeParse(json);
  return parsed.success
    ? { ok: true, value: { ...parsed.data } }
    : { ok: false, problem: parsed.error.issues.map((issue) => issue.message).join('; ') };
}

export class OneShotModel {
  constructor(private readonly ports: OneShotPorts) {}

  async ask(request: OneShotRequest): Promise<OneShotAnswer> {
    if (request.role !== 'owner' && request.tools.length > 0) {
      throw new IntegrationError('Forbidden', 'Only the owner can let an AI call use tools.');
    }
    this.admit(request.profileId);
    const system = systemText(request);
    const session = new OneShotSession(this.ports, request, [
      ...(system === null ? [] : [{ role: 'system', content: system } as const]),
      userMessage(request.prompt, request.pictures),
    ]);
    const text = await session.converse(true);
    const answer = (result: OneShotAnswer['result'], said: string): OneShotAnswer => ({
      text: said,
      result,
      tokens: session.tokens,
      costUsd: session.costUsd,
    });
    if (request.shape === null) return answer(null, text);
    const first = shaped(request.shape, text);
    if (first.ok) return answer(first.value, text);
    session.messages.push(
      { role: 'assistant', content: text },
      {
        role: 'user',
        content: `That answer was not usable: ${first.problem}. Answer again with only the JSON object.`,
      },
    );
    const again = await session.converse(false);
    const second = shaped(request.shape, again);
    if (!second.ok) {
      throw new IntegrationError(
        'Invalid',
        `The AI did not answer in the shape: ${second.problem}`,
      );
    }
    return answer(second.value, again);
  }

  async decide(request: Omit<OneShotRequest, 'shape' | 'tools'>): Promise<OneShotDecision> {
    const done = await this.ask({ ...request, shape: AI_DECISION_SHAPE, tools: [] });
    return { ...AI_DECISION.parse(done.result), tokens: done.tokens, costUsd: done.costUsd };
  }

  private admit(profileId: string): void {
    try {
      this.ports.budgets.check(profileId);
    } catch (cause) {
      throw new IntegrationError('Refused', messageOf(cause));
    }
  }
}
