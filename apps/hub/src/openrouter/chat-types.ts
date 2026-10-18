import type { AiEffort, JsonValue } from '@smarteverything/domain';

export type ContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image_url'; readonly image_url: { readonly url: string } }
  | {
      readonly type: 'file';
      readonly file: { readonly filename: string; readonly file_data: string };
    }
  | {
      readonly type: 'input_audio';
      readonly input_audio: { readonly data: string; readonly format: string };
    }
  | { readonly type: 'video_url'; readonly video_url: { readonly url: string } };

export interface ToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: { readonly name: string; readonly arguments: string };
}

export type ChatMessage =
  | { readonly role: 'system'; readonly content: string }
  | { readonly role: 'user'; readonly content: string | readonly ContentPart[] }
  | {
      readonly role: 'assistant';
      readonly content: string | null;
      readonly tool_calls?: readonly ToolCall[];
      readonly reasoning_details?: readonly JsonValue[];
    }
  | {
      readonly role: 'tool';
      readonly tool_call_id: string;
      readonly content: string | readonly ContentPart[];
    };

interface ChatTool {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Readonly<Record<string, unknown>>;
  };
}

export interface ChatRequest {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly ChatTool[];
  readonly toolChoice?: 'auto' | 'none' | 'required';
  readonly parallelToolCalls?: boolean;
  readonly webSearch?: boolean;
  readonly effort: AiEffort | null;
  readonly maxTokens?: number;
  readonly user?: string;
  readonly sessionId?: string;
  readonly cacheControl?: boolean;
  readonly prefixBreakpoint?: boolean;
}

export interface GenerationStats {
  readonly id: string;
  readonly model: string;
  readonly totalCost: number;
  readonly cacheDiscount: number | null;
  readonly upstreamInferenceCost: number | null;
  readonly tokensPrompt: number | null;
  readonly tokensCompletion: number | null;
  readonly nativeTokensPrompt: number | null;
  readonly nativeTokensCompletion: number | null;
  readonly nativeTokensReasoning: number | null;
  readonly nativeTokensCached: number | null;
  readonly nativeTokensCompletionImages: number | null;
  readonly numMediaPrompt: number | null;
  readonly numMediaCompletion: number | null;
  readonly numInputAudioPrompt: number | null;
  readonly numSearchResults: number | null;
  readonly providerName: string | null;
  readonly finishReason: string | null;
  readonly latencyMs: number | null;
  readonly generationTimeMs: number | null;
  readonly createdAt: string;
  readonly isByok: boolean;
}

export interface KeyInfo {
  readonly label: string;
  readonly limit: number | null;
  readonly limitRemaining: number | null;
  readonly limitReset: string | null;
  readonly usage: number;
  readonly usageDaily: number;
  readonly usageWeekly: number;
  readonly usageMonthly: number;
  readonly freeTier: boolean;
}

export interface Credits {
  readonly total: number;
  readonly used: number;
}
