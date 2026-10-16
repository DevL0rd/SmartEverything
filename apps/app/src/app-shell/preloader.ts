import type { Href } from 'expo-router';
import type { QueryClient } from '@tanstack/react-query';
import { Logger } from '@smarteverything/logging';
import { isNative } from '../design/platform';
import type { RouteDefinition } from './route-types';

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
  private settle: ReturnType<typeof setTimeout> | null = null;

  start(routes: readonly RouteDefinition[], client: QueryClient): void {
    this.client = client;
    this.queue = routes.filter(
      (route) =>
        route.preload !== undefined && !this.done.has(route.key) && route.key !== this.running,
    );
    this.schedule();
  }

  boost(target: Href): void {
    const key = hrefKey(target);
    const index = this.queue.findIndex((route) => hrefKey(route.href) === key);
    const route = this.queue[index];
    if (route === undefined) {
      return;
    }
    this.queue.splice(index, 1);
    this.queue.unshift(route);
    if (this.running === null && this.paused === 0) {
      void this.next();
    }
  }

  interacted(): void {
    if (!isNative()) {
      return;
    }
    if (this.settle !== null) {
      clearTimeout(this.settle);
    }
    this.settle = setTimeout(() => {
      this.settle = null;
      this.schedule();
    }, SETTLE_MS);
  }

  pause(): () => void {
    this.paused += 1;
    return (): void => {
      this.paused -= 1;
      this.schedule();
    };
  }

  private schedule(): void {
    if (this.scheduled || this.running !== null || this.paused > 0 || this.queue.length === 0) {
      return;
    }
    this.scheduled = true;
    requestIdleCallback(() => {
      this.scheduled = false;
      if (this.settle === null) {
        void this.next();
      }
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
    try {
      await route.preload?.({ queryClient: client });
      this.done.add(route.key);
    } catch (error) {
      log.warn('preload.failed', { route: route.key, reason: String(error) });
    } finally {
      this.running = null;
      this.schedule();
    }
  }
}

export const preloader = new Preloader();
