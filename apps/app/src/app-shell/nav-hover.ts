export const HOVER_MS = 350;

export interface Hover<T> {
  readonly candidate: T | null;
  readonly armed: boolean;
}

export type HoverEvent<T> =
  { readonly kind: 'over'; readonly candidate: T | null } | { readonly kind: 'elapsed' };

export function noHover<T>(): Hover<T> {
  return { candidate: null, armed: false };
}

export function hoverStep<T>(hover: Hover<T>, event: HoverEvent<T>): Hover<T> {
  if (event.kind === 'elapsed') {
    return hover.candidate === null || hover.armed ? hover : { ...hover, armed: true };
  }
  return hover.candidate === event.candidate ? hover : { candidate: event.candidate, armed: false };
}
