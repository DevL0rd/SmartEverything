import { IDENT_PATTERN, SCOPE_NAME, isReservedWord } from '@smarteverything/domain';

export type ScopeRoot = 'body' | 'onFailure';

export type ChildPart =
  | { readonly kind: 'scope'; readonly name: string }
  | { readonly kind: 'branch'; readonly id: string }
  | { readonly kind: 'case'; readonly id: string }
  | { readonly kind: 'catch'; readonly id: string };

export type ScopePath =
  | { readonly t: 'root'; readonly root: ScopeRoot }
  | { readonly t: 'child'; readonly key: string; readonly part: ChildPart };

const ROW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const BODY_PATH: ScopePath = { t: 'root', root: 'body' };
export const ON_FAILURE_PATH: ScopePath = { t: 'root', root: 'onFailure' };

export function childPath(key: string, part: ChildPart): ScopePath {
  return { t: 'child', key, part };
}

export function formatChildPart(part: ChildPart): string {
  return part.kind === 'scope' ? part.name : `${part.kind}:${part.id}`;
}

export function formatScopePath(path: ScopePath): string {
  return path.t === 'root' ? path.root : `${path.key}.${formatChildPart(path.part)}`;
}

function rowPart(text: string, kind: 'branch' | 'case' | 'catch'): ChildPart | undefined {
  const prefix = `${kind}:`;
  const id = text.slice(prefix.length);
  return text.startsWith(prefix) && ROW_ID.test(id) ? { kind, id } : undefined;
}

function scopePart(text: string): ChildPart | undefined {
  if (!SCOPE_NAME.safeParse(text).success) return undefined;
  return { kind: 'scope', name: text };
}

function parsePart(text: string): ChildPart | undefined {
  return (
    rowPart(text, 'branch') ?? rowPart(text, 'case') ?? rowPart(text, 'catch') ?? scopePart(text)
  );
}

export function parseScopePath(text: string): ScopePath | undefined {
  if (text === 'body') return BODY_PATH;
  if (text === 'onFailure') return ON_FAILURE_PATH;
  const dot = text.indexOf('.');
  if (dot < 0) return undefined;
  const key = text.slice(0, dot);
  if (!IDENT_PATTERN.test(key) || isReservedWord(key)) return undefined;
  const part = parsePart(text.slice(dot + 1));
  if (part === undefined) return undefined;
  return childPath(key, part);
}

export function sameScopePath(left: ScopePath, right: ScopePath): boolean {
  return formatScopePath(left) === formatScopePath(right);
}
