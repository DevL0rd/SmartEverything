import { JSON_VALUE, microsOfUsd, type AiShape, type UsageEntry } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import type { ToolHub } from '../../ai-tools/tool-hub';
import { tokenMeters } from '../../ledger/media-notes';
import type { ChatMessage } from '../../openrouter/chat-types';
import type { Catalogue } from '../../openrouter/catalogue';
import type { OpenRouterClient } from '../../openrouter/client';
import { TurnAccumulator, type Turn } from '../../openrouter/turn';
import type { OrUsage } from '../../openrouter/wire';
import { IntegrationError } from './integration-error';
import { callTool, ToolActionError } from './tool';

const TOOL_ARGUMENTS = z.record(z.string(), JSON_VALUE);

const ONE_SHOT_TIMEOUT_MS = 60_000;

export const ONE_SHOT_TOOL_STEPS = 5;

export interface SessionRequest {
  readonly profileId: string;
  readonly automationId: string;
  readonly shape: AiShape | null;
  readonly tools: readonly string[];
  readonly model: string | null;
  readonly capUsd: number | null;
  readonly signal: AbortSignal;
}

export interface SessionPorts {
  readonly chat: Pick<OpenRouterClient, 'chat'>;
  readonly catalogue: Pick<Catalogue, 'resolve'>;
  readonly ledger: { readonly record: (entry: UsageEntry) => void };
  readonly tools: Pick<ToolHub, 'check' | 'call' | 'list' | 'openAiTools'>;
}

type Specs = ReturnType<ToolHub['list']>;

export class OneShotSession {
  tokens = 0;
  costUsd = 0;
  private readonly specs: Specs;
  private readonly resolved: ReturnType<Catalogue['resolve']>;

  constructor(
    private readonly ports: SessionPorts,
    private readonly request: SessionRequest,
    readonly messages: ChatMessage[],
  ) {
    this.resolved = ports.catalogue.resolve(request.model, null);
    this.specs = this.allowed(request.tools);
  }

  async converse(withTools: boolean): Promise<string> {
    for (let step = 0; step <= ONE_SHOT_TOOL_STEPS; step += 1) {
      const turn = await this.turn(withTools ? this.specs : []);
      if (turn.toolCalls.length === 0) return turn.text;
      if (step === ONE_SHOT_TOOL_STEPS) break;
      this.messages.push({ role: 'assistant', content: turn.text, tool_calls: turn.toolCalls });
      for (const call of turn.toolCalls) {
        this.messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: await this.useTool(call.function.name, call.function.arguments),
        });
      }
    }
    throw new IntegrationError('LimitExceeded', 'The AI kept asking for tools.');
  }

  private allowed(names: readonly string[]): Specs {
    const listed = this.ports.tools.list();
    return names.map((name) => {
      const tool = listed.find((candidate) => candidate.name === name && !candidate.humanOnly);
      if (tool === undefined) throw new IntegrationError('NotFound', `There is no tool ${name}.`);
      return tool;
    });
  }

  private async turn(specs: Specs): Promise<Turn> {
    const accumulator = new TurnAccumulator();
    const signal = AbortSignal.any([this.request.signal, AbortSignal.timeout(ONE_SHOT_TIMEOUT_MS)]);
    try {
      for await (const chunk of this.ports.chat.chat(
        {
          model: this.resolved.model_id,
          messages: this.messages,
          effort: this.resolved.effort,
          ...(specs.length === 0
            ? {}
            : { tools: this.ports.tools.openAiTools(specs), toolChoice: 'auto' as const }),
        },
        signal,
      )) {
        accumulator.feed(chunk);
      }
    } catch (cause) {
      if (this.request.signal.aborted) throw cause;
      throw new IntegrationError(
        signal.aborted ? 'Timeout' : 'Unreachable',
        `The AI did not answer: ${messageOf(cause)}`,
      );
    }
    const result = accumulator.result();
    this.charge(result);
    return result;
  }

  private charge(turn: Turn): void {
    const { usage } = turn;
    const cost = usage?.cost ?? null;
    this.ports.ledger.record(this.entryOf(turn, usage, cost));
    this.tokens += (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0);
    this.costUsd += cost ?? 0;
    const cap = this.request.capUsd;
    if (cap !== null && this.costUsd > cap) {
      throw new IntegrationError(
        'LimitExceeded',
        `The AI call cost more than the cap of ${String(cap)} USD.`,
      );
    }
  }

  private entryOf(turn: Turn, usage: OrUsage | null, cost: number | null): UsageEntry {
    return {
      profile_id: this.request.profileId,
      source: 'openrouter',
      work: 'chat',
      model_id: turn.model,
      generation_id: turn.generationId,
      ...tokenMeters(usage),
      cost_micros: cost === null ? 0 : microsOfUsd(cost),
      cost_state: cost === null ? 'estimated' : 'reported',
      meta: { automation_id: this.request.automationId, via: 'automation_one_shot' },
    };
  }

  private async useTool(name: string, args: string): Promise<string> {
    try {
      const given = TOOL_ARGUMENTS.parse(args.trim() === '' ? {} : JSON.parse(args));
      const answer = await callTool(
        this.ports.tools,
        { profileId: this.request.profileId, tool: name, args: given },
        { plugin: null },
      );
      return JSON.stringify(answer);
    } catch (cause) {
      if (
        cause instanceof ToolActionError ||
        cause instanceof SyntaxError ||
        cause instanceof z.ZodError
      ) {
        return JSON.stringify({ error: messageOf(cause) });
      }
      throw cause;
    }
  }
}
