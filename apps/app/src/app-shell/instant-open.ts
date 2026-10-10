import { router, type Href } from 'expo-router';

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

export function openInstantly(href: Href, open: PendingOpen): void {
  pending = open;
  router.push(href);
}

export function isInstantRoute(route: StackRoute): boolean {
  const known = decided.get(route.key);
  if (known !== undefined) {
    return known;
  }
  const instant = pending !== null && matches(pending, route);
  if (instant) {
    pending = null;
  }
  decided.set(route.key, instant);
  return instant;
}

export function forgetRoute(key: string | undefined): void {
  if (key !== undefined) {
    decided.delete(key);
  }
}
