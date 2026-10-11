function sameArray(left: readonly unknown[], right: unknown): boolean {
  return (
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((item, index) => sameJson(item, right[index]))
  );
}

function sameObject(left: object, right: object): boolean {
  const leftKeys = Object.keys(left);
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) && sameJson(Reflect.get(left, key), Reflect.get(right, key)),
    )
  );
}

export function sameJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left)) {
    return sameArray(left, right);
  }
  return !Array.isArray(right) && sameObject(left, right);
}
