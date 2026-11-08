export type ConditionGroup = 'row' | 'case';

export type HandleRef =
  | { readonly kind: 'execIn' }
  | { readonly kind: 'execOut'; readonly port: string }
  | { readonly kind: 'valueIn'; readonly port: string }
  | { readonly kind: 'condition'; readonly group: ConditionGroup; readonly id: string }
  | { readonly kind: 'valueOut'; readonly name: string };

const EXEC_PREFIX = 'x:';
const VALUE_IN_PREFIX = 'v:';
const VALUE_OUT_PREFIX = 'o:';
const EXEC_IN = `${EXEC_PREFIX}in`;

export function execInHandle(): string {
  return EXEC_IN;
}

export function execOutHandle(port: string): string {
  return `${EXEC_PREFIX}${port}`;
}

export function valueInHandle(port: string): string {
  return `${VALUE_IN_PREFIX}${port}`;
}

export function conditionHandle(group: ConditionGroup, id: string): string {
  return `${VALUE_IN_PREFIX}${group}:${id}:when`;
}

export function valueOutHandle(name: string): string {
  return `${VALUE_OUT_PREFIX}${name}`;
}

export function formatHandle(ref: HandleRef): string {
  switch (ref.kind) {
    case 'execIn':
      return execInHandle();
    case 'execOut':
      return execOutHandle(ref.port);
    case 'valueIn':
      return valueInHandle(ref.port);
    case 'condition':
      return conditionHandle(ref.group, ref.id);
    case 'valueOut':
      return valueOutHandle(ref.name);
  }
}

function parseExec(rest: string): HandleRef | undefined {
  if (rest === 'in') return { kind: 'execIn' };
  return rest === '' ? undefined : { kind: 'execOut', port: rest };
}

function parseCondition(rest: string): HandleRef | undefined {
  const [group, id, tail, ...extra] = rest.split(':');
  const valid = (group === 'row' || group === 'case') && id !== undefined && id !== '';
  return valid && tail === 'when' && extra.length === 0
    ? { kind: 'condition', group, id }
    : undefined;
}

function parseValueIn(rest: string): HandleRef | undefined {
  if (rest.includes(':')) return parseCondition(rest);
  return rest === '' ? undefined : { kind: 'valueIn', port: rest };
}

function parseValueOut(rest: string): HandleRef | undefined {
  return rest === '' || rest.includes(':') ? undefined : { kind: 'valueOut', name: rest };
}

export function parseHandle(handle: string): HandleRef | undefined {
  if (handle.startsWith(EXEC_PREFIX)) return parseExec(handle.slice(EXEC_PREFIX.length));
  if (handle.startsWith(VALUE_IN_PREFIX)) return parseValueIn(handle.slice(VALUE_IN_PREFIX.length));
  if (handle.startsWith(VALUE_OUT_PREFIX)) {
    return parseValueOut(handle.slice(VALUE_OUT_PREFIX.length));
  }
  return undefined;
}
