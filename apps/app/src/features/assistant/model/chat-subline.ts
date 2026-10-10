export const CONTEXT_SHOWN_AT = 60;

export const CONTEXT_WARNS_AT = 80;

export const CONTEXT_COMPACTS_AT = 85;

export type Subline =
  | { readonly kind: 'working' }
  | { readonly kind: 'waiting'; readonly count: number }
  | {
      readonly kind: 'plain';
      readonly segments: readonly string[];
      readonly context: number | null;
    };

export interface SublineInput {
  readonly working: boolean;
  readonly waiting: number;
  readonly lead: string | null;
  readonly model: string;
  readonly context: number | null;
  readonly compact: boolean;
}

export function contextShown(percent: number | null): number | null {
  return percent !== null && percent >= CONTEXT_SHOWN_AT ? percent : null;
}

export function sublineOf(input: SublineInput): Subline {
  if (input.working) {
    return { kind: 'working' };
  }
  if (input.waiting > 0) {
    return { kind: 'waiting', count: input.waiting };
  }
  const all = input.lead === null ? [input.model] : [input.lead, input.model];
  return {
    kind: 'plain',
    segments: input.compact ? all.slice(0, 1) : all,
    context: contextShown(input.context),
  };
}

export function waitingText(count: number): string {
  return count === 1 ? '1 message waiting to send' : `${String(count)} messages waiting to send`;
}
