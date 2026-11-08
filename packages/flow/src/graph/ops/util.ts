export function compact<T extends Partial<Record<keyof T, unknown>>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (Reflect.get(value, key) === undefined) Reflect.deleteProperty(value, key);
  }
  return value;
}

export function change<T extends Partial<Record<keyof T, unknown>>>(
  target: T,
  changes: Partial<T>,
): void {
  Object.assign(target, changes);
}
