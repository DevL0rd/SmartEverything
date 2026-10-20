import type { PortValue } from '@smarteverything/domain';

export interface Reference {
  readonly key: string;
  readonly output: string;
}

export function referencesOf(value: PortValue, keys: ReadonlySet<string>): readonly Reference[] {
  if (!('wire' in value) || !keys.has(value.wire.from)) return [];
  return [{ key: value.wire.from, output: value.wire.port }];
}
