import { z } from 'zod';
import type {
  GenerateOptions,
  StreamChunk,
  LlmResolvedModelInfo,
  LlmFailure,
} from '@deepseek-ai/dsh-llm';
import {
  SUBSCRIPTION_INFERENCE_RESULT,
  SUBSCRIPTION_INFERENCE_OPTIONS,
  SUBSCRIPTION_INFERENCE_CHUNK,
  SUBSCRIPTION_INFERENCE_MODEL,
} from '@smarteverything/domain';

const OPTIONS = z.custom<GenerateOptions>(
  (value) => SUBSCRIPTION_INFERENCE_OPTIONS.safeParse(value).success,
);
const CHUNK = z.custom<StreamChunk>(
  (value) => SUBSCRIPTION_INFERENCE_CHUNK.safeParse(value).success,
);
const MODEL = z.custom<LlmResolvedModelInfo>(
  (value) => SUBSCRIPTION_INFERENCE_MODEL.safeParse(value).success,
);

export function inferenceOptions(value: unknown, signal: AbortSignal): GenerateOptions {
  return { ...OPTIONS.parse(value), signal };
}
export function inferenceChunk(value: unknown): StreamChunk {
  return CHUNK.parse(value);
}
export function inferenceModel(value: unknown): LlmResolvedModelInfo {
  return MODEL.parse(value);
}

export function inferenceFailure(value: unknown): LlmFailure {
  const result = z
    .custom<LlmFailure>(
      (input) =>
        SUBSCRIPTION_INFERENCE_RESULT.safeParse({ kind: 'failure', failure: input }).success,
    )
    .parse(value);
  return result;
}
