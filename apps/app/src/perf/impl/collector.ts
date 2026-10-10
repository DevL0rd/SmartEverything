import { COMPONENTS_MAX, JANK_MS } from './config';

export interface CommitStat {
  n: number;
  sum: number;
  max: number;
  mounts: number;
}

export interface ComponentStat {
  n: number;
  worst: number;
  self: number;
  max: number;
  props: Map<string, number>;
  hooks: Map<string, number>;
  parent: number;
}

export interface MountStat {
  mounts: number;
  unmounts: number;
  mountMs: number;
  maxMountMs: number;
  lifeMs: number;
}

export interface ListStat {
  mountedMax: number;
  mountedMin: number;
  total: number;
  blankMax: number;
  blankSum: number;
  blankSamples: number;
  scrollFrames: number;
  scrollJanks: number;
}

export interface FanStat {
  updates: number;
  listeners: number;
  commits: number;
  ms: number;
}

export interface HotStat {
  n: number;
  ms: number;
  max: number;
  size: number;
}

export interface StallRecord {
  readonly screen: string;
  readonly gap: number;
  readonly explained: number;
  readonly top: string;
  readonly context: readonly string[];
}

export interface NavRecord {
  readonly from: string;
  readonly to: string;
  readonly ms: number;
  readonly toMount: number | null;
  readonly renderMs: number;
  readonly commits: number;
}

export interface Frames {
  count: number;
  janks: number;
  worst: number;
  dragCount: number;
  dragJanks: number;
  dragWorst: number;
}

export interface WindowData {
  commits: Map<string, Map<string, CommitStat>>;
  components: Map<string, Map<string, ComponentStat>>;
  mounts: Map<string, MountStat>;
  lists: Map<string, Map<string, ListStat>>;
  fan: Map<string, FanStat>;
  hot: Map<string, HotStat>;
  stalls: StallRecord[];
  navs: NavRecord[];
  frames: Frames;
  probeMs: number;
  roots: number;
  rootMs: number;
}

export function emptyWindow(): WindowData {
  return {
    commits: new Map(),
    components: new Map(),
    mounts: new Map(),
    lists: new Map(),
    fan: new Map(),
    hot: new Map(),
    stalls: [],
    navs: [],
    frames: { count: 0, janks: 0, worst: 0, dragCount: 0, dragJanks: 0, dragWorst: 0 },
    probeMs: 0,
    roots: 0,
    rootMs: 0,
  };
}

function inner<V>(outer: Map<string, Map<string, V>>, key: string): Map<string, V> {
  const found = outer.get(key);
  if (found !== undefined) {
    return found;
  }
  const made = new Map<string, V>();
  outer.set(key, made);
  return made;
}

export interface CommitSample {
  readonly ms: number;
  readonly mounted: boolean;
}

export function addCommit(
  data: WindowData,
  screen: string,
  id: string,
  sample: CommitSample,
): void {
  const stats = inner(data.commits, screen);
  const stat = stats.get(id) ?? { n: 0, sum: 0, max: 0, mounts: 0 };
  stats.set(id, {
    n: stat.n + 1,
    sum: stat.sum + sample.ms,
    max: Math.max(stat.max, sample.ms),
    mounts: stat.mounts + (sample.mounted ? 1 : 0),
  });
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export interface ComponentRender {
  readonly name: string;
  readonly instance: number;
  readonly self: number;
  readonly props: readonly string[];
  readonly hooks: readonly string[];
  readonly parent: boolean;
}

export function addComponent(data: WindowData, screen: string, render: ComponentRender): void {
  const stats = inner(data.components, screen);
  let stat = stats.get(render.name);
  if (stat === undefined) {
    if (stats.size >= COMPONENTS_MAX) {
      return;
    }
    stat = { n: 0, worst: 0, self: 0, max: 0, props: new Map(), hooks: new Map(), parent: 0 };
    stats.set(render.name, stat);
  }
  stat.n += 1;
  stat.worst = Math.max(stat.worst, render.instance);
  stat.self += render.self;
  stat.max = Math.max(stat.max, render.self);
  stat.parent += render.parent ? 1 : 0;
  render.props.forEach((key) => {
    bump(stat.props, key);
  });
  render.hooks.forEach((key) => {
    bump(stat.hooks, key);
  });
}

export function addMount(data: WindowData, label: string, change: Partial<MountStat>): void {
  const stat = data.mounts.get(label) ?? {
    mounts: 0,
    unmounts: 0,
    mountMs: 0,
    maxMountMs: 0,
    lifeMs: 0,
  };
  data.mounts.set(label, {
    mounts: stat.mounts + (change.mounts ?? 0),
    unmounts: stat.unmounts + (change.unmounts ?? 0),
    mountMs: stat.mountMs + (change.mountMs ?? 0),
    maxMountMs: Math.max(stat.maxMountMs, change.maxMountMs ?? 0),
    lifeMs: stat.lifeMs + (change.lifeMs ?? 0),
  });
}

export function addFrame(data: WindowData, gap: number, dragging: boolean): void {
  const frames = data.frames;
  frames.count += 1;
  frames.worst = Math.max(frames.worst, gap);
  frames.janks += gap > JANK_MS ? 1 : 0;
  if (dragging) {
    frames.dragCount += 1;
    frames.dragWorst = Math.max(frames.dragWorst, gap);
    frames.dragJanks += gap > JANK_MS ? 1 : 0;
  }
}

export function addFan(
  data: WindowData,
  key: string,
  change: { updates?: number; listeners?: number; commits?: number; ms?: number },
): void {
  const stat = data.fan.get(key) ?? { updates: 0, listeners: 0, commits: 0, ms: 0 };
  data.fan.set(key, {
    updates: stat.updates + (change.updates ?? 0),
    listeners: stat.listeners + (change.listeners ?? 0),
    commits: stat.commits + (change.commits ?? 0),
    ms: stat.ms + (change.ms ?? 0),
  });
}

export function addHot(data: WindowData, kind: string, ms: number, size: number): void {
  const stat = data.hot.get(kind) ?? { n: 0, ms: 0, max: 0, size: 0 };
  data.hot.set(kind, {
    n: stat.n + 1,
    ms: stat.ms + ms,
    max: Math.max(stat.max, ms),
    size: stat.size + size,
  });
}

export function listStat(data: WindowData, screen: string, id: string): ListStat {
  const lists = inner(data.lists, screen);
  const found = lists.get(id);
  if (found !== undefined) {
    return found;
  }
  const made: ListStat = {
    mountedMax: 0,
    mountedMin: Number.POSITIVE_INFINITY,
    total: 0,
    blankMax: 0,
    blankSum: 0,
    blankSamples: 0,
    scrollFrames: 0,
    scrollJanks: 0,
  };
  lists.set(id, made);
  return made;
}

export function isIdle(data: WindowData): boolean {
  return (
    data.commits.size === 0 &&
    data.stalls.length === 0 &&
    data.navs.length === 0 &&
    data.frames.janks === 0 &&
    data.lists.size === 0 &&
    data.mounts.size === 0
  );
}
