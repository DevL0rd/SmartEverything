import {
  AI_DECISION,
  AI_DECISION_SHAPE,
  aiJsonOf,
  aiShapeInstruction,
  aiShapeSchema,
  type AiShape,
  type JsonValue,
} from '@smarteverything/domain';
import type { PersonBudgets } from '../../ledger/person-budget';
import type { ToolHub } from '../../ai-tools/tool-hub';
import { messageOf } from '@smarteverything/logging';
import { AgentCancelledError, DshAgentRun, type AgentHost } from './dsh-agent';
import { IntegrationError } from './integration-error';

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

export interface OneShotPorts {
  readonly agents: AgentHost;
  readonly tools: Pick<ToolHub, 'list'>;
  readonly budgets: Pick<PersonBudgets, 'check'>;
}

type Shaped = { ok: true; value: Record<string, JsonValue> } | { ok: false; problem: string };

function firstMessage(request: OneShotRequest): string {
  const lines = [
    request.system,
    request.shape === null ? null : aiShapeInstruction(request.shape),
    request.prompt,
  ].filter((line) => line !== null);
  return lines.join('\n\n');
}

function shaped(shape: AiShape, text: string): Shaped {
  const json = aiJsonOf(text);
  if (json === undefined) return { ok: false, problem: 'it held no JSON object' };
  const parsed = aiShapeSchema(shape).safeParse(json);
  return parsed.success
    ? { ok: true, value: { ...parsed.data } }
    : { ok: false, problem: parsed.error.issues.map((issue) => issue.message).join('; ') };
}

function reaskMessage(problem: string): string {
  return `That answer was not usable: ${problem}. Answer again with only the JSON object.`;
}

export class OneShotModel {
  constructor(private readonly ports: OneShotPorts) {}

  async ask(request: OneShotRequest): Promise<OneShotAnswer> {
    if (request.signal.aborted) throw new AgentCancelledError();
    if (request.role !== 'owner' && request.tools.length > 0) {
      throw new IntegrationError('Forbidden', 'Only the owner can let an AI call use tools.');
    }
    this.admit(request.profileId);
    this.assertTools(request.tools);
    const run = new DshAgentRun(
      this.ports.agents.open({
        profileId: request.profileId,
        role: request.role,
        automationId: request.automationId,
        model: request.model,
        tools: request.tools,
      }),
      { signal: request.signal, capUsd: request.capUsd },
    );
    try {
      return await this.converse(run, request);
    } finally {
      await run.end();
    }
  }

  async decide(request: Omit<OneShotRequest, 'shape' | 'tools'>): Promise<OneShotDecision> {
    const done = await this.ask({ ...request, shape: AI_DECISION_SHAPE, tools: [] });
    return { ...AI_DECISION.parse(done.result), tokens: done.tokens, costUsd: done.costUsd };
  }

  private async converse(run: DshAgentRun, request: OneShotRequest): Promise<OneShotAnswer> {
    const answer = (result: OneShotAnswer['result'], text: string): OneShotAnswer => ({
      text,
      result,
      ...run.spent(),
    });
    const text = await run.say({ text: firstMessage(request), pictures: request.pictures });
    if (request.shape === null) return answer(null, text);
    const first = shaped(request.shape, text);
    if (first.ok) return answer(first.value, text);
    const again = await run.say({ text: reaskMessage(first.problem), pictures: [] });
    const second = shaped(request.shape, again);
    if (!second.ok) {
      throw new IntegrationError(
        'Invalid',
        `The AI did not answer in the shape: ${second.problem}`,
      );
    }
    return answer(second.value, again);
  }

  private assertTools(names: readonly string[]): void {
    const listed = this.ports.tools.list();
    for (const name of names) {
      if (!listed.some((tool) => tool.name === name && !tool.humanOnly))
        throw new IntegrationError('NotFound', `There is no tool ${name}.`);
    }
  }

  private admit(profileId: string): void {
    try {
      this.ports.budgets.check(profileId);
    } catch (cause) {
      throw new IntegrationError('Refused', messageOf(cause));
    }
  }
}
