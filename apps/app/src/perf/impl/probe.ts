import { rawTimers } from '../../dev/raw-timers';
import { ActionLog } from './actions';
import {
  commitStat,
  componentStat,
  addFrame,
  addHot,
  addMount,
  emptyWindow,
  type FanStat,
  listStat,
  type WindowData,
} from './collector';
import { CommitLog } from './commits';
import {
  KEYBOARD_MS,
  DRAG_HOLD_MS,
  FLING_HOLD_MS,
  NO_SCREEN,
  STALL_MS,
  BACKGROUND_GAP_MS,
  STORE_ATTRIBUTION_MS,
  JSON_NOTE_MS,
  NET_NOTE_MS,
} from './config';
import { FanKeys, type FanNode } from './fan';
import type { RenderReason } from './fiber-diff';
import { collect, nextEpoch, type RenderSink } from './fibers';
import { ListTracker } from './lists';
import { NavTracker } from './nav';
import type { PerfSink } from '../sink';
import { RouteVisits } from '../../dev/route-visits';

const STALLS_MAX = 30;
const TRIGGER_KINDS: readonly string[] = ['store', 'query', 'net'];
const KEYS_NAMED = 3;
const EXPLAIN_EVERY = 4;
const EXPLAIN_SLOW_MS = 8;

interface Screen {
  readonly id: string;
  readonly nested: boolean;
}

export class Probe implements PerfSink, RenderSink {
  data: WindowData = emptyWindow();
  screenName = NO_SCREEN;
  readonly visits = new RouteVisits(NO_SCREEN, performance.now());
  fanout = true;
  navigation = true;
  fibers = 0;
  readonly actions = new ActionLog();
  readonly commits = new CommitLog();
  private readonly nav = new NavTracker();
  private readonly lists = new ListTracker(
    (list) => listStat(this.data, this.screenName, list),
    () => this.screenName,
  );
  private keyboardUntil = 0;
  private dragUntil = 0;
  private moved = false;
  private triggerStat: FanStat | null = null;
  private triggerAt = 0;
  private readonly fan = new FanKeys();
  private readonly changed: string[] = new Array<string>(KEYS_NAMED).fill('');
  private stateKeys: string[] | null = null;
  private readonly screens = new Map<string, Screen>();
  private commitCount = 0;
  private stopped = false;
  private readonly frames = new Set<number>();

  stop(): void {
    this.stopped = true;
    this.frames.forEach((handle) => {
      rawTimers.cancelAnimationFrame(handle);
    });
    this.frames.clear();
  }

  private afterFrame(work: () => void): void {
    if (this.stopped) {
      return;
    }
    const handle = rawTimers.requestAnimationFrame(() => {
      this.frames.delete(handle);
      if (!this.stopped) {
        work();
      }
    });
    this.frames.add(handle);
  }

  private now(): number {
    return performance.now();
  }

  private noteCommit(ms: number, top: string): void {
    const now = this.now();
    this.commits.add(now, ms, top);
    const stat = this.triggerStat;
    if (stat !== null && now - this.triggerAt <= STORE_ATTRIBUTION_MS) {
      stat.commits += 1;
      stat.ms += ms;
    }
  }

  record(id: string, ms: number, mounted: boolean): void {
    const key = this.now() < this.keyboardUntil ? `kb.${id}` : id;
    commitStat(this.data, this.screenName, key).add(ms, mounted);
  }

  private screenOf(label: string): Screen {
    let known = this.screens.get(label);
    if (known === undefined) {
      known = { id: `@${label}`, nested: label.includes('>') };
      this.screens.set(label, known);
    }
    return known;
  }

  screenCommit(label: string, phase: string, ms: number): void {
    const screen = this.screenOf(label);
    this.record(screen.id, ms, phase === 'mount');
    if (this.fibers === 0 && !screen.nested) {
      this.noteCommit(ms, label);
    }
  }

  render(name: string, instance: number, self: number, reason: RenderReason | null): void {
    componentStat(this.data, this.screenName, name)?.add(instance, self, reason);
  }

  fiberCommit(root: unknown): void {
    const started = this.now();
    this.commitCount += 1;
    const explainFrom = this.commitCount % EXPLAIN_EVERY === 0 ? 0 : EXPLAIN_SLOW_MS;
    const totals = collect(root, this, explainFrom);
    if (totals === null) {
      return;
    }
    this.fibers = totals.timed ? 2 : 1;
    this.noteCommit(totals.rootMs, totals.top);
    this.data.roots += 1;
    this.data.rootMs += totals.rootMs;
    this.data.probeMs += this.now() - started;
  }

  screenMount(label: string, ms: number): void {
    addMount(this.data, label, { mounts: 1, mountMs: ms, maxMountMs: ms });
    this.nav.mounted(this.now());
  }

  screenUnmount(label: string, lifeMs: number): void {
    addMount(this.data, label, { unmounts: 1, lifeMs });
  }

  action(kind: string, label: string): void {
    const now = this.now();
    this.actions.note(kind, label, now);
    if (kind === 'kb') {
      this.keyboardUntil = now + KEYBOARD_MS;
    }
    if (kind === 'nav') {
      this.nav.begin(now, this.screenName);
    }
    if (TRIGGER_KINDS.includes(kind)) {
      const node = this.fan.child(this.fan.root(kind), label, ':');
      this.startTrigger(node, now, 0);
    }
  }

  private startTrigger(node: FanNode, now: number, listeners: number): void {
    if (!this.fanout) {
      return;
    }
    const stat = this.fan.statOf(node, this.data);
    stat.updates += 1;
    stat.listeners += listeners;
    this.triggerStat = stat;
    this.triggerAt = now;
  }

  private collectChanged(previous: object, next: object): number {
    const keys = (this.stateKeys ??= Object.keys(next));
    let count = 0;
    for (let index = 0; index < keys.length && count < KEYS_NAMED; index += 1) {
      const key = keys[index] ?? '';
      if (!Object.is(Reflect.get(previous, key), Reflect.get(next, key))) {
        this.changed[count] = key;
        count += 1;
      }
    }
    return count;
  }

  store(previous: object, next: object, listeners: number): void {
    if (!this.fanout) {
      return;
    }
    const count = this.collectChanged(previous, next);
    let node = this.fan.root('store');
    if (count === 0) {
      node = this.fan.child(node, 'state', ':');
    }
    for (let index = 0; index < count; index += 1) {
      node = this.fan.child(node, this.changed[index] ?? '', '+');
    }
    const now = this.now();
    this.actions.note('store', node.tail, now);
    this.startTrigger(node, now, listeners);
  }

  screen(screen: string): void {
    if (screen === this.screenName) {
      return;
    }
    const from = this.screenName;
    this.screenName = screen === '' ? NO_SCREEN : screen;
    this.visits.enter(this.screenName, this.now());
    this.lists.seed();
    if (from === NO_SCREEN || !this.navigation) {
      return;
    }
    const arrival = this.nav.arrive(this.now(), from);
    this.afterFrame(() => {
      this.afterFrame(() => {
        this.finishNav(arrival.start, arrival.from, arrival.toMount);
      });
    });
  }

  private finishNav(start: number, from: string, toMount: number | null): void {
    const end = this.now();
    const span = this.commits.span(start, end);
    this.data.navs.push({
      from,
      to: this.screenName,
      ms: end - start,
      toMount,
      renderMs: span.ms,
      commits: span.count,
    });
    this.actions.note('route', this.screenName, start);
  }

  touch(phase: 'start' | 'move' | 'end'): void {
    const now = this.now();
    if (phase === 'start') {
      this.moved = false;
      this.actions.note('tap', '', now);
      return;
    }
    if (phase === 'move') {
      this.dragUntil = now + DRAG_HOLD_MS;
      if (!this.moved) {
        this.actions.note('drag', '', now);
      }
      this.moved = true;
      return;
    }
    this.dragUntil = this.moved ? now + FLING_HOLD_MS : this.dragUntil;
  }

  frame(gap: number, start: number, end: number): void {
    if (gap > BACKGROUND_GAP_MS) {
      return;
    }
    addFrame(this.data, gap, end < this.dragUntil);
    this.lists.frame(gap, end);
    if (gap >= STALL_MS && this.data.stalls.length < STALLS_MAX) {
      const span = this.commits.span(start, end);
      this.data.stalls.push({
        screen: this.screenName,
        gap,
        explained: span.ms,
        top: span.top,
        context: this.actions.contextOf(start, end),
      });
    }
  }

  json(ms: number, size: number): void {
    addHot(this.data, 'json', ms, size);
    if (ms >= JSON_NOTE_MS) {
      this.actions.note('json', String(size), this.now());
    }
  }

  net(path: string, ms: number): void {
    addHot(this.data, 'net', ms, 0);
    this.action('net', path);
    if (ms >= NET_NOTE_MS) {
      this.actions.note('net-slow', path, this.now());
    }
  }

  listRows(list: string, delta: number, total: number): void {
    this.lists.rows(list, delta, total);
  }

  listCell(list: string, index: number, y: number, height: number): void {
    this.lists.cell(list, index, y, height);
  }

  listGone(list: string, index: number): void {
    this.lists.gone(list, index);
  }

  listViewport(list: string, height: number): void {
    this.lists.viewport(list, height);
  }

  listContent(list: string, height: number): void {
    this.lists.content(list, height);
  }

  listScroll(list: string, offset: number): void {
    this.lists.scroll(list, offset, this.now());
  }

  reset(): void {
    nextEpoch();
    this.fan.nextWindow();
    this.triggerStat = null;
    this.stateKeys = null;
    this.data = emptyWindow();
    this.lists.seed();
  }
}
