import { NAME_MAX } from './config';

export type Bag = Readonly<Record<string, unknown>>;

export function isBag(value: unknown): value is Bag {
  return typeof value === 'object' && value !== null;
}

function field(value: unknown, key: string): unknown {
  return isBag(value) ? value[key] : undefined;
}

export function nameOf(type: unknown): string {
  if (typeof type === 'function') {
    const named = field(type, 'displayName');
    return typeof named === 'string' && named !== ''
      ? named
      : type.name === ''
        ? 'anon'
        : type.name;
  }
  if (isBag(type)) {
    const inner = type['render'] ?? type['type'];
    const named = type['displayName'];
    return typeof named === 'string' && named !== ''
      ? named
      : inner === undefined
        ? 'anon'
        : nameOf(inner);
  }
  return 'anon';
}

export function changedProps(previous: unknown, next: unknown): string[] {
  if (!isBag(previous) || !isBag(next) || previous === next) {
    return [];
  }
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...keys]
    .filter((key) => !Object.is(previous[key], next[key]))
    .map((key) => key.slice(0, NAME_MAX));
}

function isEffect(state: unknown): boolean {
  return isBag(state) && 'create' in state && 'tag' in state;
}

const HOOKS_MAX = 80;

export function changedHooks(previous: unknown, next: unknown): string[] {
  const changed: string[] = [];
  let left = previous;
  let right = next;
  for (let index = 0; index < HOOKS_MAX && isBag(left) && isBag(right); index += 1) {
    const before = left['memoizedState'];
    const after = right['memoizedState'];
    if (!isEffect(after) && !isEffect(before) && !Object.is(before, after)) {
      changed.push(`h${String(index)}`);
    }
    left = left['next'];
    right = right['next'];
  }
  return changed;
}

export interface FiberFacts {
  readonly tag: number;
  readonly flags: number;
  readonly type: unknown;
  readonly props: unknown;
  readonly state: unknown;
  readonly duration: number;
  readonly fresh: boolean;
}

export const COMPONENT_TAGS: readonly number[] = [0, 1, 11, 15];
export const PERFORMED_WORK = 1;

export interface RenderReason {
  readonly props: string[];
  readonly hooks: string[];
  readonly parent: boolean;
}

function hooksOf(current: FiberFacts, before: FiberFacts): string[] {
  if (current.tag === 1) {
    return Object.is(before.state, current.state) ? [] : ['state'];
  }
  return changedHooks(before.state, current.state);
}

export function reasonOf(current: FiberFacts, before: FiberFacts | null): RenderReason {
  if (before === null) {
    return { props: [], hooks: [], parent: false };
  }
  const props = changedProps(before.props, current.props);
  const hooks = hooksOf(current, before);
  return { props, hooks, parent: props.length === 0 && hooks.length === 0 };
}
