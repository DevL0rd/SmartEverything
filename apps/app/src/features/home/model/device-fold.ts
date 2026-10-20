import { deviceValuesOf, type DeviceValues, type StoreState } from '../../../store/state';
import { deviceValuesRecord } from '../../../store/subscriptions';
import type { DeviceModel } from '../../devices';

const NO_VALUES: DeviceValues = {};

export interface FoldEntry<C> {
  readonly model: DeviceModel;
  readonly value: C;
}

export interface Fold<C> {
  readonly entries: readonly FoldEntry<C>[];
  readonly changed: ReadonlySet<string> | null;
  readonly valueOf: (deviceId: string) => C | undefined;
}

export interface FoldOptions<C> {
  readonly models: (state: StoreState) => readonly DeviceModel[];
  readonly includes: (model: DeviceModel) => boolean;
  readonly usesValues: (model: DeviceModel) => boolean;
  readonly projected: boolean;
  readonly contribution: (model: DeviceModel, values: DeviceValues) => C | null;
  readonly same?: (left: C, right: C) => boolean;
}

export class DeviceFold<C> {
  private readonly same: (left: C, right: C) => boolean;
  private source: readonly DeviceModel[] | null = null;
  private included: readonly DeviceModel[] = [];
  private valued: readonly number[] = [];
  private seen: DeviceValues[] = [];
  private current: (FoldEntry<C> | null)[] = [];
  private indexOf = new Map<string, number>();
  private last: Fold<C> = { entries: [], changed: null, valueOf: () => undefined };

  constructor(private readonly options: FoldOptions<C>) {
    this.same = options.same ?? Object.is;
  }

  read = (state: StoreState): Fold<C> => {
    const all = this.options.models(state);
    if (all !== this.source) {
      this.restructure(all, state);
      return this.publish(null);
    }
    const changed = new Set<string>();
    for (const index of this.valued) {
      const model = this.included[index];
      if (model === undefined) continue;
      const values = this.valuesOf(state, model.device.id);
      if (values !== this.seen[index] && this.compute(index, values)) changed.add(model.device.id);
    }
    return changed.size === 0 ? this.last : this.publish(changed);
  };

  private valuesOf(state: StoreState, id: string): DeviceValues {
    return this.options.projected
      ? deviceValuesOf(state, id)
      : (deviceValuesRecord(state, id) ?? NO_VALUES);
  }

  private compute(index: number, values: DeviceValues): boolean {
    const model = this.included[index];
    if (model === undefined) return false;
    this.seen[index] = values;
    const value = this.options.contribution(model, values);
    const old = this.current[index] ?? null;
    const entry =
      value === null
        ? null
        : old !== null && old.model === model && this.same(old.value, value)
          ? old
          : { model, value };
    this.current[index] = entry;
    return entry !== old;
  }

  private restructure(all: readonly DeviceModel[], state: StoreState): void {
    const previous = new Map(
      this.current.flatMap((entry) =>
        entry === null ? [] : [[entry.model.device.id, entry] as const],
      ),
    );
    this.source = all;
    this.included = all.filter(this.options.includes);
    this.indexOf = new Map(this.included.map((model, index) => [model.device.id, index]));
    this.valued = this.included.flatMap((model, index) =>
      this.options.usesValues(model) ? [index] : [],
    );
    this.seen = this.included.map(() => NO_VALUES);
    this.current = this.included.map((model) => previous.get(model.device.id) ?? null);
    this.included.forEach((model, index) => {
      const values = this.options.usesValues(model)
        ? this.valuesOf(state, model.device.id)
        : NO_VALUES;
      this.compute(index, values);
    });
  }

  private publish(changed: ReadonlySet<string> | null): Fold<C> {
    const entries = this.current.flatMap((entry) => (entry === null ? [] : [entry]));
    this.last = {
      entries,
      changed,
      valueOf: (id): C | undefined => {
        const index = this.indexOf.get(id);
        return index === undefined ? undefined : this.current[index]?.value;
      },
    };
    return this.last;
  }
}
