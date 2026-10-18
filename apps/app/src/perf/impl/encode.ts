import type { ComponentStat, WindowData } from './collector';
import {
  COMMIT_IDS_MAX,
  COMPONENTS_REPORTED,
  LINES_MAX,
  LINE_MAX,
  NAME_MAX,
  SCREEN_MAX,
  STORM_RENDERS,
  WINDOW_MS,
} from './config';

export interface WindowMeta {
  readonly boot: string;
  readonly seq: number;
  readonly version: string;
  readonly theme: string;
  readonly heapMb: number | null;
  readonly gcCount: number | null;
  readonly gcMs: number | null;
  readonly fibers: number;
  readonly screen: string;
  readonly visited: string;
}

type Row = readonly unknown[];

const LONG_RUN = /[A-Za-z0-9_-]{24,}/g;

export function safe(text: string, limit: number): string {
  return text.replace(LONG_RUN, (run) => run.slice(0, NAME_MAX)).slice(0, limit);
}

function r1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function packLines(
  base: Readonly<Record<string, unknown>>,
  field: string,
  rows: readonly Row[],
): string[] {
  const head = JSON.stringify({ ...base, [field]: [] }).slice(0, -2);
  const lines: string[] = [];
  let current: string[] = [];
  let length = head.length + 2;
  for (const row of rows) {
    const text = JSON.stringify(row);
    const joined = length + text.length + (current.length > 0 ? 1 : 0);
    if (current.length > 0 && joined > LINE_MAX) {
      lines.push(`${head}${current.join(',')}]}`);
      current = [];
      length = head.length + 2;
    }
    length += text.length + (current.length > 0 ? 1 : 0);
    current.push(text);
  }
  if (current.length > 0) {
    lines.push(`${head}${current.join(',')}]}`);
  }
  return lines;
}

function topKeys(counts: ReadonlyMap<string, number>): string {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([key, count]) => `${safe(key, NAME_MAX)}:${String(count)}`)
    .join(',');
}

function componentRow(name: string, stat: ComponentStat): Row {
  return [
    safe(name, NAME_MAX),
    stat.n,
    r1(stat.self),
    r1(stat.max),
    topKeys(stat.props),
    topKeys(stat.hooks),
    stat.parent,
    stat.worst,
  ];
}

export function chosenComponents(
  stats: ReadonlyMap<string, ComponentStat>,
): [string, ComponentStat][] {
  const entries = [...stats.entries()];
  const storms = entries
    .filter(([, stat]) => stat.worst >= STORM_RENDERS)
    .sort((left, right) => right[1].worst - left[1].worst)
    .slice(0, COMPONENTS_REPORTED / 2);
  const heavy = entries.sort((left, right) => right[1].self - left[1].self);
  const picked = new Map(storms);
  for (const [name, stat] of heavy) {
    if (picked.size >= COMPONENTS_REPORTED) {
      break;
    }
    picked.set(name, stat);
  }
  return [...picked.entries()];
}

interface ScreenSpec<V> {
  readonly tag: string;
  readonly context: Readonly<Record<string, unknown>>;
  readonly rowOf: (id: string, value: V) => Row;
  readonly pick: (values: ReadonlyMap<string, V>) => [string, V][];
}

function perScreen<V>(
  source: ReadonlyMap<string, ReadonlyMap<string, V>>,
  spec: ScreenSpec<V>,
): string[] {
  const lines: string[] = [];
  for (const [screen, values] of source) {
    const base = { t: spec.tag, ...spec.context, s: safe(screen, SCREEN_MAX) };
    lines.push(
      ...packLines(
        base,
        spec.tag,
        spec.pick(values).map(([id, value]) => spec.rowOf(id, value)),
      ),
    );
  }
  return lines;
}

function topBySum<V extends { sum: number }>(values: ReadonlyMap<string, V>): [string, V][] {
  return [...values.entries()].sort((left, right) => right[1].sum - left[1].sum);
}

function commitLines(data: WindowData, context: Readonly<Record<string, unknown>>): string[] {
  return perScreen(data.commits, {
    tag: 'c',
    context,
    rowOf: (id, stat) => [safe(id, NAME_MAX + 4), stat.n, r1(stat.sum), r1(stat.max), stat.mounts],
    pick: (values) => topBySum(values).slice(0, COMMIT_IDS_MAX),
  });
}

function listLines(data: WindowData, context: Readonly<Record<string, unknown>>): string[] {
  return perScreen(data.lists, {
    tag: 'l',
    context,
    rowOf: (id, stat) => [
      safe(id, NAME_MAX),
      stat.mountedMax,
      Number.isFinite(stat.mountedMin) ? stat.mountedMin : 0,
      stat.total,
      Math.round(stat.blankMax),
      stat.blankSamples === 0 ? 0 : Math.round(stat.blankSum / stat.blankSamples),
      stat.scrollFrames,
      stat.scrollJanks,
      Math.round(stat.content),
      Math.round(stat.viewport),
      Math.round(stat.offsetMax),
      Number.isFinite(stat.firstIndex) ? stat.firstIndex : -1,
      stat.lastIndex,
      Math.round(stat.cellMax),
    ],
    pick: (values) => [...values.entries()],
  });
}

function componentLines(data: WindowData, context: Readonly<Record<string, unknown>>): string[] {
  return perScreen(data.components, {
    tag: 'g',
    context,
    rowOf: componentRow,
    pick: chosenComponents,
  });
}

function stallLines(data: WindowData, context: Readonly<Record<string, unknown>>): string[] {
  const worst = [...data.stalls].sort((left, right) => right.gap - left.gap).slice(0, 8);
  return packLines(
    { t: 's', ...context },
    's',
    worst.map((stall) => [
      safe(stall.screen, SCREEN_MAX),
      Math.round(stall.gap),
      Math.round(stall.explained),
      safe(stall.top, NAME_MAX),
      stall.context.map((entry) => safe(entry, 28)),
    ]),
  );
}

function navLines(data: WindowData, context: Readonly<Record<string, unknown>>): string[] {
  const navs = data.navs.map((nav) => [
    safe(nav.from, SCREEN_MAX),
    safe(nav.to, SCREEN_MAX),
    Math.round(nav.ms),
    nav.toMount === null ? null : Math.round(nav.toMount),
    r1(nav.renderMs),
    nav.commits,
  ]);
  return packLines({ t: 'n', ...context }, 'n', navs);
}

function miscLines(data: WindowData, context: Readonly<Record<string, unknown>>): string[] {
  const fan = [...data.fan.entries()]
    .sort((left, right) => right[1].ms + right[1].commits - (left[1].ms + left[1].commits))
    .slice(0, 12)
    .map(([key, stat]) => [
      safe(key, NAME_MAX + 6),
      stat.updates,
      stat.listeners,
      stat.commits,
      r1(stat.ms),
    ]);
  const mounts = [...data.mounts.entries()].map(([label, stat]) => [
    safe(label, SCREEN_MAX),
    stat.mounts,
    stat.unmounts,
    r1(stat.mountMs),
    r1(stat.maxMountMs),
    Math.round(stat.lifeMs),
  ]);
  const hot = [...data.hot.entries()].map(([kind, stat]) => [
    kind,
    stat.n,
    r1(stat.ms),
    r1(stat.max),
    stat.size,
  ]);
  return [
    ...packLines({ t: 'f', ...context }, 'f', fan),
    ...packLines({ t: 'm', ...context }, 'm', mounts),
    ...packLines({ t: 'h', ...context }, 'h', hot),
  ];
}

function headerLine(data: WindowData, meta: WindowMeta, dropped: number): string {
  const frames = data.frames;
  return JSON.stringify({
    t: 'w',
    b: meta.boot,
    w: meta.seq,
    s: meta.screen,
    vis: meta.visited,
    v: meta.version,
    th: meta.theme,
    ms: WINDOW_MS,
    fr: [frames.count, frames.janks, Math.round(frames.worst)],
    dr: [frames.dragCount, frames.dragJanks, Math.round(frames.dragWorst)],
    cm: [data.roots, r1(data.rootMs)],
    po: r1(data.probeMs),
    hp: meta.heapMb,
    gc: [meta.gcCount, meta.gcMs],
    fh: meta.fibers,
    dl: dropped,
  });
}

export function encodeWindow(data: WindowData, meta: WindowMeta): string[] {
  const context = { b: meta.boot, w: meta.seq };
  const body = [
    ...stallLines(data, context),
    ...componentLines(data, context),
    ...navLines(data, context),
    ...commitLines(data, context),
    ...listLines(data, context),
    ...miscLines(data, context),
  ];
  const room = LINES_MAX - 1;
  return [headerLine(data, meta, Math.max(0, body.length - room)), ...body.slice(0, room)];
}
