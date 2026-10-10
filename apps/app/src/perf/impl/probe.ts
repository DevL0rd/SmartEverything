import { ActionLog } from './actions';
import {
  addCommit,
  addComponent,
  addFan,
  addFrame,
  addHot,
  addMount,
  emptyWindow,
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
import { nextEpoch, type CommitReport } from './fibers';
import { ListTracker } from './lists';
import { NavTracker } from './nav';
import type { PerfSink } from '../sink';

const STALLS_MAX = 30;
const TRIGGER_KINDS: readonly string[] = ['store', 'query', 'net'];

interface Trigger {
  readonly key: string;
  readonly at: number;
}

function changedKeys(previous: object, next: object): string[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...keys].filter((key) => !Object.is(Reflect.get(previous, key), Reflect.get(next, key)));
}

export class Probe implements PerfSink {
  data: WindowData = emptyWindow();
  screenName = NO_SCREEN;
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
  private trigger: Trigger | null = null;

  private now(): number {
    return performance.now();
  }

  private noteCommit(ms: number, top: string): void {
    const now = this.now();
    this.commits.add(now, ms, top);
    if (this.trigger !== null && now - this.trigger.at <= STORE_ATTRIBUTION_MS) {
      addFan(this.data, this.trigger.key, { commits: 1, ms });
    }
  }

  record(id: string, ms: number, mounted: boolean): void {
    const key = this.now() < this.keyboardUntil ? `kb.${id}` : id;
    addCommit(this.data, this.screenName, key, { ms, mounted });
  }

  screenCommit(label: string, phase: string, ms: number): void {
    this.record(`@${label}`, ms, phase === 'mount');
    if (this.fibers === 0 && !label.includes('>')) {
      this.noteCommit(ms, label);
    }
  }

  fiberCommit(report: CommitReport): void {
    const start = this.now();
    this.noteCommit(report.rootMs, report.top);
    this.data.roots += 1;
    this.data.rootMs += report.rootMs;
    report.components.forEach((item) => {
      addComponent(this.data, this.screenName, item);
    });
    this.data.probeMs += this.now() - start;
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
      this.startTrigger(`${kind}:${label}`, now, 0);
    }
  }

  private startTrigger(key: string, now: number, listeners: number): void {
    this.trigger = { key, at: now };
    addFan(this.data, key, { updates: 1, listeners });
  }

  store(previous: object, next: object, listeners: number): void {
    const keys = changedKeys(previous, next).slice(0, 3);
    const label = keys.length === 0 ? 'state' : keys.join('+');
    const now = this.now();
    this.actions.note('store', label, now);
    this.startTrigger(`store:${label}`, now, listeners);
  }

  screen(screen: string): void {
    if (screen === this.screenName) {
      return;
    }
    const from = this.screenName;
    this.screenName = screen === '' ? NO_SCREEN : screen;
    this.lists.seed();
    if (from === NO_SCREEN) {
      return;
    }
    const arrival = this.nav.arrive(this.now(), from);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
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

  listScroll(list: string, offset: number): void {
    this.lists.scroll(list, offset, this.now());
  }

  reset(): void {
    nextEpoch();
    this.data = emptyWindow();
    this.lists.seed();
  }
}
