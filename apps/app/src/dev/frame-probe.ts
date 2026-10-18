import { AppState } from 'react-native';
import { hermesStats } from './gc-probe';
import {
  acquireFrameStats,
  frameStatsAvailable,
  takeFrameCounts,
  type FrameCounts,
} from './native-frames';
import { rawTimers, takeFrameRequests } from './raw-timers';
import { addContributor } from './window-bus';
import { percent, perSecond, round1, type WindowFields } from './window-math';

const FRAME_MS = 16.7;
const JANK_MS = 33;
const FREEZE_MS = 100;
const TICK_MS = 250;
const LONG_TASK_MS = 50;
const MAX_FPS = 60;
const MEGABYTE = 1048576;

function uiFields(ui: FrameCounts, windowMs: number): WindowFields {
  return {
    uiFrames: ui.frames,
    uiFps: Math.round(perSecond(ui.frames, windowMs)),
    uiSlow16: ui.slow16,
    uiSlow33: ui.slow33,
    uiSlow100: ui.slow100,
    uiWorstMs: Math.round(ui.worstMs),
    uiJankPct: percent(ui.slow16, ui.frames),
  };
}

export class FrameTally {
  ticks = 0;
  lateMs = 0;
  slow16 = 0;
  slow33 = 0;
  slow100 = 0;
  worstMs = 0;
  longTasks = 0;
  longTaskMs = 0;
  longTaskWorst = 0;
  commits = 0;
  commitMs = 0;
  notices = 0;

  tick(blockedMs: number): void {
    const late = Math.max(0, blockedMs);
    this.ticks += 1;
    this.lateMs += late;
    this.slow16 += late > FRAME_MS ? 1 : 0;
    this.slow33 += late > JANK_MS ? 1 : 0;
    this.slow100 += late > FREEZE_MS ? 1 : 0;
    this.worstMs = Math.max(this.worstMs, late);
    if (late >= LONG_TASK_MS) {
      this.longTasks += 1;
      this.longTaskMs += late;
      this.longTaskWorst = Math.max(this.longTaskWorst, late);
    }
  }

  commit(ms: number): void {
    this.commits += 1;
    this.commitMs += ms;
  }

  fields(windowMs: number, ui: FrameCounts | null): WindowFields {
    const fields: WindowFields = {
      fps:
        this.ticks === 0
          ? 0
          : Math.round(Math.min(MAX_FPS, 1000 / (FRAME_MS + this.lateMs / this.ticks))),
      slow16: this.slow16,
      slow33: this.slow33,
      slow100: this.slow100,
      worstMs: Math.round(this.worstMs),
      jsJankPct: percent(this.slow33, this.ticks),
      longTaskMs: Math.round(this.longTaskWorst),
      ltN: this.longTasks,
      ltMs: Math.round(this.longTaskMs),
      commits: this.commits,
      commitMs: round1(this.commitMs),
      notices: this.notices,
    };
    return ui === null ? fields : { ...fields, ...uiFields(ui, windowMs) };
  }

  clear(): void {
    Object.assign(this, new FrameTally());
  }
}

const tally = new FrameTally();
let active = false;

export function recordCommit(ms: number): void {
  if (active) {
    tally.commit(ms);
  }
}

export function recordNotice(): void {
  if (active) {
    tally.notices += 1;
  }
}

function heapFields(): WindowFields {
  const stats = hermesStats();
  const heap = stats?.['js_heapSize'];
  return heap === undefined ? {} : { heapMb: round1(heap / MEGABYTE) };
}

function startLoops(): () => void {
  let expected = performance.now() + TICK_MS;
  const timer = rawTimers.setInterval(() => {
    const now = performance.now();
    tally.tick(now - expected);
    expected = now + TICK_MS;
  }, TICK_MS);
  const appState = AppState.addEventListener('change', () => {
    expected = performance.now() + TICK_MS;
  });
  return (): void => {
    rawTimers.clearInterval(timer);
    appState.remove();
  };
}

export function startFrameProbe(): () => void {
  active = true;
  tally.clear();
  takeFrameRequests();
  const releaseFrameStats = acquireFrameStats();
  const stopLoops = startLoops();
  const available = frameStatsAvailable();
  const remove = addContributor('frames', {
    fields: (windowMs) => {
      const fields = tally.fields(windowMs, takeFrameCounts());
      tally.clear();
      return {
        ...fields,
        ...(available ? {} : { ui: 'needs-new-build' }),
        probeFrames: takeFrameRequests(),
        ...heapFields(),
      };
    },
  });
  return (): void => {
    active = false;
    stopLoops();
    releaseFrameStats();
    remove();
  };
}
