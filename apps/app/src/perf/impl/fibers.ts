import type { ComponentRender } from './collector';
import {
  COMPONENT_TAGS,
  PERFORMED_WORK,
  isBag,
  nameOf,
  reasonOf,
  type FiberFacts,
} from './fiber-diff';

export interface CommitReport {
  readonly rootMs: number;
  readonly top: string;
  readonly visited: number;
  readonly timed: boolean;
  readonly components: readonly ComponentRender[];
}

interface View extends FiberFacts {
  readonly raw: unknown;
  readonly child: unknown;
  readonly sibling: unknown;
  readonly alternate: unknown;
}

const VISIT_MAX = 20_000;

function view(value: unknown): View | null {
  if (!isBag(value)) {
    return null;
  }
  const tag = value['tag'];
  const flags = value['flags'];
  if (typeof tag !== 'number' || typeof flags !== 'number') {
    return null;
  }
  const duration = value['actualDuration'];
  return {
    raw: value,
    tag,
    flags,
    type: value['type'],
    props: value['memoizedProps'],
    state: value['memoizedState'],
    duration: typeof duration === 'number' ? duration : 0,
    fresh: value['alternate'] === null,
    child: value['child'],
    sibling: value['sibling'],
    alternate: value['alternate'],
  };
}

function childrenMs(node: View): number {
  let sum = 0;
  for (let child = view(node.child); child !== null; child = view(child.sibling)) {
    sum += child.duration;
  }
  return sum;
}

function rendered(node: View, before: View | null): boolean {
  return (
    COMPONENT_TAGS.includes(node.tag) && (before === null || (node.flags & PERFORMED_WORK) !== 0)
  );
}

interface Counter {
  n: number;
  epoch: number;
}

const instances = new WeakMap<object, Counter>();
let epoch = 0;

export function nextEpoch(): void {
  epoch += 1;
}

function instanceCount(node: View): number {
  const keys = [node.raw, node.alternate].filter((key): key is object => isBag(key));
  const known = keys.map((key) => instances.get(key)).find((found) => found !== undefined);
  const counter = known ?? { n: 0, epoch };
  if (counter.epoch !== epoch) {
    counter.n = 0;
    counter.epoch = epoch;
  }
  counter.n += 1;
  keys.forEach((key) => {
    instances.set(key, counter);
  });
  return counter.n;
}

function render(node: View, before: View | null): ComponentRender {
  const reason = reasonOf(node, before);
  return {
    name: nameOf(node.type),
    instance: instanceCount(node),
    self: Math.max(0, node.duration - childrenMs(node)),
    props: reason.props,
    hooks: reason.hooks,
    parent: reason.parent,
  };
}

function visit(node: View, stack: unknown[], components: ComponentRender[]): void {
  const before = view(node.alternate);
  if (rendered(node, before)) {
    components.push(render(node, before));
  }
  stack.push(node.sibling);
  if (before === null || before.child !== node.child) {
    stack.push(node.child);
  }
}

export function collect(root: unknown): CommitReport | null {
  const top = isBag(root) ? view(root['current']) : null;
  if (top === null) {
    return null;
  }
  const components: ComponentRender[] = [];
  const stack: unknown[] = [top.child];
  let visited = 0;
  while (stack.length > 0 && visited < VISIT_MAX) {
    const node = view(stack.pop());
    if (node !== null) {
      visited += 1;
      visit(node, stack, components);
    }
  }
  const heaviest = components.reduce<ComponentRender | null>(
    (best, item) => (best === null || item.self > best.self ? item : best),
    null,
  );
  return {
    rootMs: top.duration,
    top: heaviest?.name ?? '',
    visited,
    timed: top.duration > 0,
    components,
  };
}

export function watchCommits(onCommit: (report: CommitReport) => void): boolean {
  const hook: unknown = Reflect.get(globalThis, '__REACT_DEVTOOLS_GLOBAL_HOOK__');
  const original = isBag(hook) ? hook['onCommitFiberRoot'] : undefined;
  if (!isBag(hook) || typeof original !== 'function') {
    return false;
  }
  return Reflect.set(hook, 'onCommitFiberRoot', (...args: unknown[]): unknown => {
    const result: unknown = Reflect.apply(original, hook, args);
    const report = collect(args[1]);
    if (report !== null) {
      onCommit(report);
    }
    return result;
  });
}
