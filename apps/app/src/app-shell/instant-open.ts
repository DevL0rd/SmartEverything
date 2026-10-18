import { Logger } from '@smarteverything/logging';
import { router, type Href } from 'expo-router';

const log = new Logger('app.nav');

interface PendingOpen {
  readonly name: string;
  readonly params: Readonly<Record<string, string>>;
}

interface StackRoute {
  readonly key: string;
  readonly name: string;
  readonly params?: object | undefined;
}

let pending: PendingOpen | null = null;

const armed: PendingOpen[] = [];

const decided = new Map<string, boolean>();

function matches(open: PendingOpen, route: StackRoute): boolean {
  const params = route.params;
  return (
    open.name === route.name &&
    Object.entries(open.params).every(([key, value]) =>
      params === undefined ? false : Reflect.get(params, key) === value,
    )
  );
}

function sameOpen(left: PendingOpen, right: PendingOpen): boolean {
  return (
    left.name === right.name &&
    Object.keys(right.params).length === Object.keys(left.params).length &&
    Object.entries(right.params).every(([key, value]) => left.params[key] === value)
  );
}

export function openInstantly(href: Href, open: PendingOpen): void {
  if (pending !== null && sameOpen(pending, open)) {
    log.debug('open.instant_skipped', { name: open.name, reason: 'already opening' });
    return;
  }
  pending = open;
  log.debug('open.instant', () => ({ name: open.name, params: Object.keys(open.params).length }));
  router.push(href);
}

export function preloadInstantly(open: PendingOpen, preload: () => void): void {
  armed.push(open);
  preload();
}

export function isInstantRoute(route: StackRoute): boolean {
  const known = decided.get(route.key);
  if (known !== undefined) {
    if (known && pending !== null && matches(pending, route)) {
      pending = null;
    }
    return known;
  }
  const armedAt = armed.findIndex((open) => matches(open, route));
  if (armedAt >= 0) {
    armed.splice(armedAt, 1);
  }
  const instant = armedAt >= 0 || (pending !== null && matches(pending, route));
  if (instant) {
    pending = null;
  }
  log.debug('open.decided', { name: route.name, routeKey: route.key, instant });
  decided.set(route.key, instant);
  return instant;
}

export function forgetRoute(key: string | undefined): void {
  if (key !== undefined) {
    decided.delete(key);
  }
}
