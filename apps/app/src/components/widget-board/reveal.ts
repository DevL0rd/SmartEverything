import type { Href } from 'expo-router';
import type { BoardWidget, WidgetSize } from '@smarteverything/domain';

export interface BoardReveal {
  readonly key: string;
  readonly member: string | null;
  readonly pageOf: (widget: BoardWidget) => Href | null;
  readonly onDone: () => void;
}

export type RevealPlan =
  | { readonly kind: 'ring' }
  | { readonly kind: 'page'; readonly widget: BoardWidget }
  | { readonly kind: 'missing' };

const TOO_SMALL_FOR_MEMBERS: readonly WidgetSize[] = ['M'];

export function revealPlan(
  widgets: readonly BoardWidget[],
  request: Pick<BoardReveal, 'key' | 'member' | 'pageOf'>,
): RevealPlan {
  const widget = widgets.find((candidate) => candidate.key === request.key);
  if (widget === undefined) {
    return { kind: 'missing' };
  }
  const opensPage =
    request.member !== null &&
    TOO_SMALL_FOR_MEMBERS.includes(widget.size) &&
    request.pageOf(widget) !== null;
  return opensPage ? { kind: 'page', widget } : { kind: 'ring' };
}
