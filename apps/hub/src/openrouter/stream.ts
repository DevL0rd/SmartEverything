import type { ChatChunk, ChatUsage } from './chat-types';
import { errorCodeOf, openRouterError, readJson, type OpenRouterErrorCode } from './errors';
import { OR_CHUNK, type OrChunk, type OrUsage } from './wire';

function detailsOf(
  usage: OrUsage,
): Pick<ChatUsage, 'cachedTokens' | 'cacheWriteTokens' | 'audioTokens' | 'reasoningTokens'> {
  const prompt = usage.prompt_tokens_details ?? {};
  const completion = usage.completion_tokens_details ?? {};
  return {
    cachedTokens: prompt.cached_tokens ?? 0,
    cacheWriteTokens: prompt.cache_write_tokens ?? 0,
    audioTokens: prompt.audio_tokens ?? 0,
    reasoningTokens: completion.reasoning_tokens ?? 0,
  };
}

function usageOf(usage: OrUsage): ChatUsage {
  return {
    cost: usage.cost ?? null,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    ...detailsOf(usage),
    upstreamCost: usage.cost_details?.upstream_inference_cost ?? null,
    searchRequests: usage.server_tool_use?.web_search_requests ?? 0,
  };
}

function streamErrorCode(code: number | string): OpenRouterErrorCode {
  return typeof code === 'number' ? errorCodeOf(code) : 'unavailable';
}

type Delta = NonNullable<OrChunk['choices'][number]['delta']>;

function textChunks(delta: Delta): ChatChunk[] {
  const out: ChatChunk[] = [];
  if (typeof delta.reasoning === 'string' && delta.reasoning !== '') {
    out.push({ type: 'reasoning', text: delta.reasoning });
  }
  if (delta.reasoning_details !== undefined && delta.reasoning_details.length > 0) {
    out.push({ type: 'reasoning_details', details: delta.reasoning_details });
  }
  if (typeof delta.content === 'string' && delta.content !== '') {
    out.push({ type: 'text', text: delta.content });
  }
  return out;
}

function citationChunks(delta: Delta): ChatChunk[] {
  return (delta.annotations ?? []).flatMap((annotation): ChatChunk[] =>
    annotation.type === 'url_citation' && annotation.url_citation !== undefined
      ? [
          {
            type: 'citation',
            url: annotation.url_citation.url,
            title: annotation.url_citation.title ?? '',
          },
        ]
      : [],
  );
}

function toolChunks(delta: Delta): ChatChunk[] {
  return (delta.tool_calls ?? []).map((call) => ({
    type: 'tool_call',
    index: call.index,
    id: call.id ?? null,
    name: call.function?.name ?? null,
    arguments: call.function?.arguments ?? '',
  }));
}

function deltaChunks(chunk: OrChunk): ChatChunk[] {
  return chunk.choices.flatMap((choice): ChatChunk[] => [
    ...(choice.delta === undefined
      ? []
      : [
          ...textChunks(choice.delta),
          ...citationChunks(choice.delta),
          ...toolChunks(choice.delta),
        ]),
    ...(typeof choice.finish_reason === 'string'
      ? [{ type: 'finish' as const, reason: choice.finish_reason }]
      : []),
  ]);
}

export class ChunkReader {
  private started = false;

  read(data: string): ChatChunk[] {
    const chunk = this.parse(data);
    if (chunk.error !== undefined) {
      throw openRouterError(streamErrorCode(chunk.error.code), chunk.error.message);
    }
    const out: ChatChunk[] = [];
    if (!this.started) {
      this.started = true;
      out.push({ type: 'start', generationId: chunk.id, model: chunk.model });
    }
    out.push(...deltaChunks(chunk));
    if (chunk.usage !== undefined && chunk.usage !== null) {
      out.push({
        type: 'usage',
        generationId: chunk.id,
        model: chunk.model,
        usage: usageOf(chunk.usage),
      });
    }
    return out;
  }

  private parse(data: string): OrChunk {
    const json = readJson(data);
    if (!json.ok) {
      throw openRouterError('unreadable', `a stream line wasn’t JSON: ${json.reason}`);
    }
    const parsed = OR_CHUNK.safeParse(json.value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw openRouterError(
        'unreadable',
        issue === undefined ? 'stream chunk' : `${issue.path.join('.')}: ${issue.message}`,
      );
    }
    return parsed.data;
  }
}
