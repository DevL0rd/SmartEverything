import type { Picture } from './gemini';

export interface ToolAnswer {
  readonly response: Readonly<Record<string, unknown>>;
  readonly line: string;
  readonly pictures: readonly Picture[];
}

export function failedAnswer(cause: unknown): ToolAnswer {
  return {
    response: { error: cause instanceof Error ? cause.message : 'That did not work' },
    line: '',
    pictures: [],
  };
}

export function errorOf(response: Readonly<Record<string, unknown>>): string | null {
  const error = response['error'];
  return typeof error === 'string' ? error.slice(0, 400) : null;
}
