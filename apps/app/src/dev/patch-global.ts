export type AnyFunction = (this: unknown, ...args: unknown[]) => unknown;

export function patchMember(
  owner: object,
  name: string,
  wrap: (original: AnyFunction) => AnyFunction,
): (() => void) | null {
  const current: unknown = Reflect.get(owner, name);
  if (typeof current !== 'function') {
    return null;
  }
  const original: AnyFunction = function (this: unknown, ...args: unknown[]): unknown {
    return Reflect.apply(current, this, args);
  };
  const wrapped = wrap(original);
  if (!Reflect.set(owner, name, wrapped)) {
    return null;
  }
  return (): void => {
    if (Reflect.get(owner, name) === wrapped) {
      Reflect.set(owner, name, current);
    }
  };
}

export function patchAll(patches: readonly ((() => void) | null)[]): {
  readonly stop: () => void;
  readonly failed: number;
} {
  const done = patches.filter((patch): patch is () => void => patch !== null);
  return {
    failed: patches.length - done.length,
    stop: (): void => {
      [...done].reverse().forEach((restore) => {
        restore();
      });
    },
  };
}
