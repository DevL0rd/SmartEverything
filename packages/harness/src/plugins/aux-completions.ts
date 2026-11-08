import { Service } from '@deepseek-ai/cordis';
import type { Context } from '@deepseek-ai/cordis';
import { BlockAssembler, LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { HarnessRuntimeError } from '../host/errors';

declare module '@deepseek-ai/cordis' {
  interface Context {
    auxCompletions: AuxCompletions;
  }
}

export interface AuxCompletionRequest {
  readonly provider: string;
  readonly model: string;
  readonly sessionId: string;
  readonly system: string;
  readonly input: string;
  readonly effort?: string | null;
  readonly purpose?: 'session-title';
}

function effortOf(
  named: string | null | undefined,
  lowest: ReasoningEffortId | undefined,
): ReasoningEffortId | undefined {
  if (named === undefined) return lowest;
  return named === null ? undefined : ReasoningEffortId(named);
}

export class AuxCompletions extends Service {
  static readonly inject = ['llm'];

  constructor(ctx: Context) {
    super(ctx, 'auxCompletions');
  }

  async complete(request: AuxCompletionRequest, signal?: AbortSignal): Promise<string> {
    const info = await this.ctx.llm.resolveModelInfo(request.provider, request.model, signal);
    const effort = effortOf(request.effort, info.reasoning?.efforts[0]?.id);
    const options: GenerateOptions = {
      provider: request.provider,
      model: request.model,
      system: request.system,
      messages: [{ role: 'user', content: [{ type: 'text', text: request.input }] }],
      sessionId: SessionId(request.sessionId),
      ...(effort === undefined ? {} : { reasoningEffort: effort }),
      ...(request.purpose === undefined ? {} : { purpose: request.purpose }),
      ...(signal === undefined ? {} : { signal }),
    };
    const assembler = new BlockAssembler();
    for await (const chunk of this.ctx.llm.stream(options)) {
      assembler.push(chunk);
      if (
        chunk.type === 'finish' &&
        (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')
      )
        throw new LlmError(chunk.reason.failure.message, chunk.reason.failure.code);
    }
    return assembler
      .blocks()
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('');
  }
}

export function completeAux(
  ctx: Context,
  request: AuxCompletionRequest,
  signal?: AbortSignal,
): Promise<string> {
  const service = ctx.get('auxCompletions');
  if (!(service instanceof AuxCompletions))
    throw new HarnessRuntimeError('runtime_unavailable', 'Auxiliary completions are unavailable.');
  return service.complete(request, signal);
}

export const name = 'aux-completions';

export async function mount(ctx: Context): Promise<void> {
  await ctx.plugin(AuxCompletions);
}
