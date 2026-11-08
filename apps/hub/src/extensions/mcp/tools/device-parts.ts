import type {
  DeviceFamily,
  DeviceKind,
  DeviceScope,
  PresentedCapability,
  StateRow,
} from '@smarteverything/domain';
import type { Clock } from '../../../clock';
import type { Store } from '../../../store/store';
import type { OperatingContext } from './acting';
import type { Placed } from './targets';

export interface PartSource {
  readonly store: Store;
  readonly scope: DeviceScope | null;
  readonly placed: Placed;
  readonly states: ReadonlyMap<string, StateRow>;
  readonly presented: readonly PresentedCapability[];
}

export type PartContext = OperatingContext & { readonly clock: Pick<Clock, 'now'> };

export type PartRead = (source: PartSource) => Record<string, unknown>;

export interface DevicePart {
  readonly part: string;
  readonly kinds: readonly DeviceKind[];
  readonly families: readonly DeviceFamily[];
  readonly prepare: (context: PartContext, placed: Placed) => Promise<PartRead>;
  readonly read: PartRead;
}

export type PreparedParts = ReadonlyMap<string, PartRead>;

export const NO_PREPARED_PARTS: PreparedParts = new Map();

interface PartDefinition<Loaded> {
  readonly part: string;
  readonly kinds?: readonly DeviceKind[];
  readonly families?: readonly DeviceFamily[];
  readonly unloaded: Loaded;
  readonly load?: (context: PartContext, placed: Placed) => Promise<Loaded>;
  readonly read: (source: PartSource, loaded: Loaded) => Record<string, unknown>;
}

export function definePart<Loaded>(definition: PartDefinition<Loaded>): DevicePart {
  const { load, read, unloaded } = definition;
  return {
    part: definition.part,
    kinds: definition.kinds ?? [],
    families: definition.families ?? [],
    prepare: async (context, placed) => {
      const loaded = load === undefined ? unloaded : await load(context, placed);
      return (source) => read(source, loaded);
    },
    read: (source) => read(source, unloaded),
  };
}

export function partApplies(part: DevicePart, { device, family }: Placed): boolean {
  return part.kinds.includes(device.kind) || part.families.includes(family);
}

export function partsOf(
  parts: readonly DevicePart[],
  source: PartSource,
  prepared: PreparedParts,
): Record<string, unknown> {
  return Object.fromEntries(
    parts
      .filter((part) => partApplies(part, source.placed))
      .map((part) => [part.part, (prepared.get(part.part) ?? part.read)(source)]),
  );
}

export async function preparedPartsOf(
  parts: readonly DevicePart[],
  context: PartContext,
  placed: Placed,
): Promise<PreparedParts> {
  const entries = await Promise.all(
    parts
      .filter((part) => partApplies(part, placed))
      .map(async (part): Promise<[string, PartRead]> => [
        part.part,
        await part.prepare(context, placed),
      ]),
  );
  return new Map(entries);
}
