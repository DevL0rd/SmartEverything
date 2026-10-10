import type { DataPoint, DataPointShape } from '../src';

export const BOOL: DataPointShape = { type: 'Boolean' };

export function int(min = 0, max = 1000, scale = 0, unit: string | null = null): DataPointShape {
  return { type: 'Integer', min, max, step: 1, scale, unit };
}

export function options(...range: string[]): DataPointShape {
  return { type: 'Enum', range };
}

export const JSON_SHAPE: DataPointShape = { type: 'Json', definition: '{}' };

export function point(
  code: string,
  dpId: number,
  shape: DataPointShape,
  access: { readable?: boolean; writable?: boolean; name?: string } = {},
): DataPoint {
  return {
    code,
    dpId,
    name: access.name ?? null,
    readable: access.readable ?? true,
    writable: access.writable ?? true,
    shape,
  };
}
