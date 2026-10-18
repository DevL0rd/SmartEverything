import {
  COMPONENT_TAGS,
  PERFORMED_WORK,
  isBag,
  nameOf,
  reasonOf,
  type Bag,
  type FiberFacts,
  type RenderReason,
} from './fiber-diff';

export interface RenderSink {
  render(name: string, instance: number, self: number, reason: RenderReason | null): void;
}

export interface CommitTotals {
  readonly rootMs: number;
  readonly top: string;
  readonly visited: number;
  readonly timed: boolean;
}

const VISIT_MAX = 20_000;

interface Counter {
  n: number;
  epoch: number;
}

const instances = new WeakMap<object, Counter>();
const names = new WeakMap<object, string>();
const stack: unknown[] = [];
let epoch = 0;

export function nextEpoch(): void {
  epoch += 1;
}

function numberOf(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function nameFor(type: unknown): string {
  if (!isBag(type)) {
    return nameOf(type);
  }
  const known = names.get(type);
  if (known !== undefined) {
    return known;
  }
  const made = nameOf(type);
  names.set(type, made);
  return made;
}

function childrenMs(node: Bag): number {
  let sum = 0;
  for (let child = node['child']; isBag(child); child = child['sibling']) {
    sum += numberOf(child['actualDuration']);
  }
  return sum;
}

function instanceCount(node: Bag, before: Bag | null): number {
  const found = instances.get(node) ?? (before === null ? undefined : instances.get(before));
  const counter = found ?? { n: 0, epoch };
  if (counter.epoch !== epoch) {
    counter.n = 0;
    counter.epoch = epoch;
  }
  counter.n += 1;
  if (instances.get(node) !== counter) {
    instances.set(node, counter);
  }
  if (before !== null && instances.get(before) !== counter) {
    instances.set(before, counter);
  }
  return counter.n;
}

function factsOf(node: Bag, tag: number): FiberFacts {
  return {
    tag,
    flags: numberOf(node['flags']),
    type: node['type'],
    props: node['memoizedProps'],
    state: node['memoizedState'],
    duration: 0,
    fresh: false,
  };
}

function reasonFor(node: Bag, before: Bag | null, tag: number): RenderReason | null {
  return before === null ? null : reasonOf(factsOf(node, tag), factsOf(before, tag));
}

function performed(tag: number, flags: number, before: Bag | null): boolean {
  return COMPONENT_TAGS.includes(tag) && (before === null || (flags & PERFORMED_WORK) !== 0);
}

class Walk {
  visited = 0;
  heaviestSelf = -1;
  heaviestName = '';

  constructor(
    private readonly sink: RenderSink,
    private readonly explain: boolean,
  ) {}

  run(): void {
    while (stack.length > 0 && this.visited < VISIT_MAX) {
      const node = stack.pop();
      if (isBag(node)) {
        this.visit(node);
      }
    }
  }

  private visit(node: Bag): void {
    const tag = node['tag'];
    const flags = node['flags'];
    if (typeof tag !== 'number' || typeof flags !== 'number') {
      return;
    }
    this.visited += 1;
    const alternate = node['alternate'];
    const before = isBag(alternate) ? alternate : null;
    if (performed(tag, flags, before)) {
      this.render(node, before, tag);
    }
    stack.push(node['sibling']);
    if (before === null || before['child'] !== node['child']) {
      stack.push(node['child']);
    }
  }

  private render(node: Bag, before: Bag | null, tag: number): void {
    const name = nameFor(node['type']);
    const self = Math.max(0, numberOf(node['actualDuration']) - childrenMs(node));
    this.sink.render(
      name,
      instanceCount(node, before),
      self,
      this.explain ? reasonFor(node, before, tag) : null,
    );
    if (self > this.heaviestSelf) {
      this.heaviestSelf = self;
      this.heaviestName = name;
    }
  }
}

export function collect(root: unknown, sink: RenderSink, explainFrom: number): CommitTotals | null {
  const top = isBag(root) ? root['current'] : null;
  if (!isBag(top) || typeof top['tag'] !== 'number' || typeof top['flags'] !== 'number') {
    return null;
  }
  const rootMs = numberOf(top['actualDuration']);
  stack.length = 0;
  stack.push(top['child']);
  const walk = new Walk(sink, rootMs >= explainFrom);
  walk.run();
  stack.length = 0;
  return { rootMs, top: walk.heaviestName, visited: walk.visited, timed: rootMs > 0 };
}

export function watchCommits(onCommit: (root: unknown) => void): (() => void) | null {
  const hook: unknown = Reflect.get(globalThis, '__REACT_DEVTOOLS_GLOBAL_HOOK__');
  const original = isBag(hook) ? hook['onCommitFiberRoot'] : undefined;
  if (!isBag(hook) || typeof original !== 'function') {
    return null;
  }
  const commit = original;
  const subscriber: { current: typeof onCommit | null } = { current: onCommit };
  function wrapped(this: unknown, ...args: unknown[]): unknown {
    const result: unknown = Reflect.apply(commit, this, args);
    subscriber.current?.(args[1]);
    return result;
  }
  if (!Reflect.set(hook, 'onCommitFiberRoot', wrapped)) {
    return null;
  }
  return (): void => {
    subscriber.current = null;
    if (Reflect.get(hook, 'onCommitFiberRoot') === wrapped) {
      Reflect.set(hook, 'onCommitFiberRoot', original);
    }
  };
}
