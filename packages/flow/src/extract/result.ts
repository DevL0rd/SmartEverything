export type ExtractCode =
  | 'empty'
  | 'unknown_key'
  | 'unknown_kind'
  | 'trigger'
  | 'scattered'
  | 'stateful'
  | 'persistent'
  | 'dynamic'
  | 'unknown_variable'
  | 'control'
  | 'unreadable'
  | 'nested_read'
  | 'name_taken'
  | 'unsupported'
  | 'invalid_result';

export interface Refusal {
  readonly ok: false;
  readonly code: ExtractCode;
  readonly reason: string;
  readonly suggestion: readonly string[];
}

export class ExtractRefusal extends Error {
  constructor(
    readonly code: ExtractCode,
    readonly reason: string,
    readonly suggestion: readonly string[],
  ) {
    super(reason);
    this.name = 'ExtractRefusal';
  }
}

export function refuse(
  code: ExtractCode,
  reason: string,
  suggestion: readonly string[] = [],
): never {
  throw new ExtractRefusal(code, reason, suggestion);
}

export function attempt<T>(run: () => T): T | Refusal {
  try {
    return run();
  } catch (error) {
    if (error instanceof ExtractRefusal) {
      return { ok: false, code: error.code, reason: error.reason, suggestion: error.suggestion };
    }
    throw error;
  }
}
