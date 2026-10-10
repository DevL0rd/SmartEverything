import type { NodeFailure, NodeFailureCode } from '@smarteverything/domain';

const FAILURE_TEXT_MAX = 500;

export class NodeFailureError extends Error {
  override readonly name = 'NodeFailureError';

  constructor(
    readonly code: NodeFailureCode,
    message: string,
  ) {
    super(message);
  }
}

export function failureOf(cause: unknown): NodeFailure {
  if (cause instanceof NodeFailureError) {
    return { code: cause.code, message: cause.message };
  }
  const text = cause instanceof Error ? cause.message.trim() : '';
  return {
    code: 'failed',
    message: text === '' ? 'The computer could not do that.' : text.slice(0, FAILURE_TEXT_MAX),
  };
}
