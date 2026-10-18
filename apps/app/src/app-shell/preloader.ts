import type { Href } from 'expo-router';
import type { QueryClient } from '@tanstack/react-query';
import { Logger, background } from '@smarteverything/logging';
import { errorFields } from '../design/log-tally';
import { touchQuietIn } from '../design/touch-activity';
import type { RouteDefinition, TabKey } from './route-types';

const log = new Logger('app.preloader');

const SETTLE_MS = 1500;

function hrefKey(target: Href): string {
  return typeof target === 'string' ? target : JSON.stringify(target);
}

class Preloader {
  private queue: RouteDefinition[] = [];
  private readonly done = new Set<string>();
  private client: QueryClient | null = null;
  private running: string | null = null;
  private scheduled = false;
  private paused = 0;

  start(routes: readonly RouteDefinition[], client: QueryClient): void {
    this.client = client;
    this.queue = routes.filter(
      (route) =>
        route.preload !== undefined && !this.done.has(route.key) && route.key !== this.running,
    );
    log.info('preload.started', {
      routes: routes.length,
      queued: this.queue.length,
      done: this.done.size,
      paused: this.paused,
    });
    this.schedule();
  }

  boost(target: Href): void {
    const key = hrefKey(target);
    const index = this.queue.findIndex((route) => hrefKey(route.href) === key);
    const route = this.queue[index];
    if (route === undefined) {
      log.trace('preload.boost_skipped', { reason: 'not queued' });
      return;
    }
    log.debug('preload.boosted', { route: route.key, queued: this.queue.length });
    this.queue.splice(index, 1);
    this.queue.unshift(route);
    if (this.running === null && this.paused === 0) {
      background(this.next(), 'preloader.next_failed');
    }
  }

  boostSection(tab: TabKey): void {
    if (!this.queue.some((route) => route.tab === tab)) {
      return;
    }
    log.debug('preload.section_boosted', { tab, queued: this.queue.length });
    this.queue = [
      ...this.queue.filter((route) => route.tab === tab),
      ...this.queue.filter((route) => route.tab !== tab),
    ];
    this.schedule();
  }

  pause(): () => void {
    this.paused += 1;
    log.debug('preload.paused', { holders: this.paused });
    return (): void => {
      this.paused -= 1;
      log.debug('preload.resumed', { holders: this.paused });
      this.schedule();
    };
  }

  private schedule(): void {
    if (this.scheduled || this.running !== null || this.paused > 0 || this.queue.length === 0) {
      return;
    }
    this.scheduled = true;
    requestIdleCallback(() => {
      const wait = touchQuietIn(SETTLE_MS);
      if (wait > 0) {
        log.trace('preload.deferred', { waitMs: wait, queued: this.queue.length });
        setTimeout(() => {
          this.scheduled = false;
          this.schedule();
        }, wait);
        return;
      }
      this.scheduled = false;
      background(this.next(), 'preloader.next_failed');
    });
  }

  private async next(): Promise<void> {
    if (this.running !== null || this.paused > 0) return;
    const route = this.queue.shift();
    const client = this.client;
    if (route === undefined || client === null) {
      return;
    }
    this.running = route.key;
    const begun = Date.now();
    log.debug('preload.route_started', { route: route.key, remaining: this.queue.length });
    try {
      await route.preload?.({ queryClient: client });
      log.debug('preload.route_finished', () => ({
        route: route.key,
        durationMs: Date.now() - begun,
      }));
    } catch (error) {
      log.warn('preload.failed', {
        route: route.key,
        durationMs: Date.now() - begun,
        ...errorFields(error),
      });
    } finally {
      this.done.add(route.key);
      this.running = null;
      this.schedule();
    }
  }
}

export const preloader = new Preloader();
