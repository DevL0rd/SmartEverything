import { ApiError, type AssistantReasonCode } from '@smarteverything/domain';

const MODEL_UNAVAILABLE: AssistantReasonCode = 'model_unavailable';

export function modelUnavailable(message: string): ApiError {
  return new ApiError('conflict', message, MODEL_UNAVAILABLE);
}

export function isModelUnavailable(cause: unknown): cause is ApiError {
  return cause instanceof ApiError && cause.reason === MODEL_UNAVAILABLE;
}
