import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm';
import type {
  GenerateOptions,
  LlmFailure,
  LlmModelInfo,
  LlmResolvedModelInfo,
  StreamChunk,
} from '@deepseek-ai/dsh-llm';

export const SCRIPTED_PROVIDER = 'scripted';
export const SCRIPTED_MODEL = 'scripted-model';

export type ScriptedReply =
  | { readonly kind: 'text'; readonly text: string; readonly after?: Promise<void> }
  | { readonly kind: 'hang' }
  | { readonly kind: 'fail'; readonly failure: LlmFailure }
  | {
      readonly kind: 'tool';
      readonly id: string;
      readonly name: string;
      readonly input: Readonly<Record<string, unknown>>;
    };

export class ScriptedModel extends LlmAdapter {
  readonly requests: GenerateOptions[] = [];
  private readonly replies: ScriptedReply[] = [];

  script(...replies: readonly ScriptedReply[]): void {
    this.replies.push(...replies);
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve([{ provider, id: SCRIPTED_MODEL, name: SCRIPTED_MODEL }]);
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      context: { contextWindow: 200_000 },
    });
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    await Promise.resolve();
    this.requests.push(options);
    const reply = this.replies.shift();
    if (reply === undefined) throw new Error('The scripted model has no reply left.');
    if (reply.kind === 'hang') {
      await new Promise<void>((resolve) => {
        if (options.signal?.aborted === true) resolve();
        options.signal?.addEventListener('abort', () => {
          resolve();
        });
      });
      options.signal?.throwIfAborted();
      return;
    }
    if (reply.kind === 'text') await reply.after;
    yield* chunks(reply);
  }
}

function chunks(reply: ScriptedReply): readonly StreamChunk[] {
  const usage: StreamChunk = { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } };
  if (reply.kind === 'hang') return [];
  if (reply.kind === 'fail')
    return [{ type: 'finish', reason: { kind: 'error', failure: reply.failure } }];
  if (reply.kind === 'text')
    return [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: reply.text.slice(0, 3) },
      { type: 'text-delta', index: 0, text: reply.text.slice(3) },
      { type: 'block-end', index: 0, block: { type: 'text', text: reply.text } },
      usage,
      { type: 'finish', reason: { kind: 'stop' } },
    ];
  const id = ToolCallId(reply.id);
  const args = JSON.stringify(reply.input);
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name: reply.name, argumentsDelta: args },
    {
      type: 'block-end',
      index: 0,
      block: { type: 'tool-call', id, name: reply.name, arguments: args },
    },
    usage,
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ];
}
