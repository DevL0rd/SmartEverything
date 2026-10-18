import { COMPONENTS_MAX, JANK_MS } from './config';
import type { RenderReason } from './fiber-diff';

export class CommitStat {
  n = 0;
  sum = 0;
  max = 0;
  mounts = 0;

  add(ms: number, mounted: boolean): void {
    this.n += 1;
    this.sum += ms;
    this.max = Math.max(this.max, ms);
    this.mounts += mounted ? 1 : 0;
  }
}

export class ComponentStat {
  n = 0;
  worst = 0;
  self = 0;
  max = 0;
  readonly props = new Map<string, number>();
  readonly hooks = new Map<string, number>();
  parent = 0;

  add(instance: number, self: number, reason: RenderReason | null): void {
    this.n += 1;
    this.worst = Math.max(this.worst, instance);
    this.self += self;
    this.max = Math.max(this.max, self);
    if (reason !== null) {
      this.parent += reason.parent ? 1 : 0;
      reason.props.forEach((key) => {
        bump(this.props, key);
      });
      reason.hooks.forEach((key) => {
        bump(this.hooks, key);
      });
    }
  }
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
  content: number;
  viewport: number;
  offsetMax: number;
  firstIndex: number;
  lastIndex: number;
  cellMax: number;
}

export interface FanStat {
  updates: number;
  listeners: number;
  commits: number;
  ms: number;
}

interface HotStat {
  n: number;
  ms: number;
  max: number;
  size: number;
}

interface StallRecord {
  readonly screen: string;
  readonly gap: number;
  readonly explained: number;
  readonly top: string;
  readonly context: readonly string[];
}

interface NavRecord {
  readonly from: string;
  readonly to: string;
  readonly ms: number;
  readonly toMount: number | null;
  readonly renderMs: number;
  readonly commits: number;
}

interface Frames {
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

export function commitStat(data: WindowData, screen: string, id: string): CommitStat {
  const stats = inner(data.commits, screen);
  let stat = stats.get(id);
  if (stat === undefined) {
    stat = new CommitStat();
    stats.set(id, stat);
  }
  return stat;
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export function componentStat(
  data: WindowData,
  screen: string,
  name: string,
): ComponentStat | null {
  const stats = inner(data.components, screen);
  let stat = stats.get(name);
  if (stat === undefined) {
    if (stats.size >= COMPONENTS_MAX) {
      return null;
    }
    stat = new ComponentStat();
    stats.set(name, stat);
  }
  return stat;
}

export function addMount(data: WindowData, label: string, change: Partial<MountStat>): void {
  let stat = data.mounts.get(label);
  if (stat === undefined) {
    stat = { mounts: 0, unmounts: 0, mountMs: 0, maxMountMs: 0, lifeMs: 0 };
    data.mounts.set(label, stat);
  }
  stat.mounts += change.mounts ?? 0;
  stat.unmounts += change.unmounts ?? 0;
  stat.mountMs += change.mountMs ?? 0;
  stat.maxMountMs = Math.max(stat.maxMountMs, change.maxMountMs ?? 0);
  stat.lifeMs += change.lifeMs ?? 0;
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

export function fanStat(data: WindowData, key: string): FanStat {
  let stat = data.fan.get(key);
  if (stat === undefined) {
    stat = { updates: 0, listeners: 0, commits: 0, ms: 0 };
    data.fan.set(key, stat);
  }
  return stat;
}

export function addHot(data: WindowData, kind: string, ms: number, size: number): void {
  let stat = data.hot.get(kind);
  if (stat === undefined) {
    stat = { n: 0, ms: 0, max: 0, size: 0 };
    data.hot.set(kind, stat);
  }
  stat.n += 1;
  stat.ms += ms;
  stat.max = Math.max(stat.max, ms);
  stat.size += size;
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
    content: 0,
    viewport: 0,
    offsetMax: 0,
    firstIndex: Number.POSITIVE_INFINITY,
    lastIndex: -1,
    cellMax: 0,
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
