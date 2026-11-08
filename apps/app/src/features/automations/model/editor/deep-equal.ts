export function sameList(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((item, at) => deepEqual(item, right[at]));
}

function sameRecord(left: object, right: object): boolean {
  const mine = Object.entries(left);
  const theirs = new Map(Object.entries(right));
  return (
    mine.length === theirs.size && mine.every(([key, value]) => deepEqual(value, theirs.get(key)))
  );
}

export function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && sameList(left, right);
  }
  return sameRecord(left, right);
}

export function diff<T>(before: T | undefined, after: T | undefined): T | null | undefined {
  return deepEqual(before, after) ? undefined : (after ?? null);
}
