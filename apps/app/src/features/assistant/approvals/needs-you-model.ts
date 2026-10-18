export const DETAIL_LINES = 3;
const DETAIL_CHARACTERS = 200;

export interface RequestNav {
  readonly index: number;
  readonly count: number;
  readonly previous: string | null;
  readonly next: string | null;
}

export function resolveIndex(
  ids: readonly string[],
  activeId: string | null,
  lastIndex: number,
): number {
  const found = activeId === null ? -1 : ids.indexOf(activeId);
  return found >= 0 ? found : Math.max(0, Math.min(lastIndex, ids.length - 1));
}

export interface DockCursorState {
  readonly id: string | null;
  readonly index: number;
}

export function settleCursor(ids: readonly string[], cursor: DockCursorState): DockCursorState {
  const index = resolveIndex(ids, cursor.id, cursor.index);
  return { id: ids[index] ?? null, index };
}

export function requestNav(ids: readonly string[], index: number): RequestNav {
  return {
    index,
    count: ids.length,
    previous: ids[index - 1] ?? null,
    next: ids[index + 1] ?? null,
  };
}

export function pagerLabel(nav: RequestNav): string {
  return `${String(nav.index + 1)} of ${String(nav.count)}`;
}

export function isLongDetail(text: string): boolean {
  return text.split('\n').length > DETAIL_LINES || text.length > DETAIL_CHARACTERS;
}

export function isAllowChord(
  press: { readonly key: string; readonly command: boolean; readonly typing: boolean },
  pending: boolean,
): boolean {
  return !pending && press.command && !press.typing && press.key === 'Enter';
}

export function newRequestIds(
  seen: ReadonlySet<string>,
  ids: readonly string[],
): readonly string[] {
  return ids.filter((id) => !seen.has(id));
}

export type RequestKind = 'permission' | 'question' | 'other';

export interface RequestCopy {
  readonly title: string;
  readonly needs: string;
}

export function requestCopy(kind: RequestKind, machine: string, tool: string): RequestCopy {
  switch (kind) {
    case 'permission':
      return {
        title: `${machine} wants to use ${tool}`,
        needs: `${machine} needs your approval to use ${tool}`,
      };
    case 'question':
      return { title: `${machine} has a question`, needs: `${machine} has a question for you` };
    case 'other':
      return { title: `${machine} sent a request`, needs: `${machine} sent a request` };
  }
}

export function announcementOf(needs: string, touch: boolean): string {
  return `${needs}. ${touch ? 'Swipe to the approval card.' : 'Alt+R to review.'}`;
}

export function expiredCopy(machine: string): string {
  return `Already answered or expired on ${machine}`;
}
