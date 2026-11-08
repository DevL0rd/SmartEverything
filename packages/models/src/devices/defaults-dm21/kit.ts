import type { ModelSpecChannel } from '@smarteverything/domain';

type Table = Readonly<Record<string, number>>;

export function turn(
  id: string,
  [target, axis]: readonly [string, 'x' | 'y' | 'z'],
  [source, table]: readonly [string, Table],
): ModelSpecChannel {
  return {
    id,
    target,
    property: 'rotate',
    axis,
    source,
    map: { type: 'enum', table },
    motion: { type: 'spin' },
    reduced: 'hold',
  };
}
