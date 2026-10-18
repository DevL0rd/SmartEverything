import { Logger } from '@smarteverything/logging';
import { rawTimers } from './raw-timers';
import { RouteVisits } from './route-visits';
import type { WindowFields } from './window-math';

const WINDOW_MS = 5000;
const MIN_SPLIT_MS = 500;

interface WindowDetail {
  readonly kind: string;
  readonly top: string;
}

export interface WindowContributor {
  readonly fields: (windowMs: number) => WindowFields;
  readonly details?: () => readonly WindowDetail[];
}

const log = new Logger('app.perf');
const contributors = new Map<string, WindowContributor>();

let screen = 'start';
let windowStart = performance.now();
const visits = new RouteVisits(screen, windowStart);
let seq = 0;
let clock: ReturnType<typeof rawTimers.setInterval> | null = null;

export function currentScreen(): string {
  return screen;
}

function collect(windowMs: number): { fields: WindowFields; details: WindowDetail[] } {
  const fields: WindowFields = {
    screen,
    visited: visits.take(performance.now()),
    seq,
    windowMs: Math.round(windowMs),
  };
  const details: WindowDetail[] = [];
  contributors.forEach((contributor) => {
    Object.assign(fields, contributor.fields(windowMs));
    details.push(...(contributor.details?.() ?? []));
  });
  return { fields, details };
}

function flushWindow(): void {
  const now = performance.now();
  const { fields, details } = collect(now - windowStart);
  windowStart = now;
  seq += 1;
  log.info('perf.window', fields);
  details
    .filter((detail) => detail.top !== '')
    .forEach((detail) => {
      log.info('perf.detail', { screen, kind: detail.kind, top: detail.top });
    });
}

export function setScreen(next: string): void {
  if (next === screen) {
    return;
  }
  if (clock !== null && performance.now() - windowStart >= MIN_SPLIT_MS) {
    flushWindow();
    rawTimers.clearInterval(clock);
    clock = rawTimers.setInterval(flushWindow, WINDOW_MS);
  }
  screen = next;
  visits.enter(next, performance.now());
}

function syncClock(): void {
  if (contributors.size > 0 && clock === null) {
    windowStart = performance.now();
    visits.take(windowStart);
    clock = rawTimers.setInterval(flushWindow, WINDOW_MS);
    return;
  }
  if (contributors.size === 0 && clock !== null) {
    rawTimers.clearInterval(clock);
    clock = null;
  }
}

export function addContributor(name: string, contributor: WindowContributor): () => void {
  contributors.set(name, contributor);
  syncClock();
  return (): void => {
    if (contributors.get(name) === contributor) {
      contributors.delete(name);
      syncClock();
    }
  };
}

export function logEvent(event: string, payload: Readonly<Record<string, unknown>>): void {
  log.info(event, { screen, ...payload });
}
