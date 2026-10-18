import {
  AutomationBindingError,
  GEO_POINT,
  capabilityOf,
  conditionV2Holds,
  resolveInputV2,
  resolveToV2,
  type CapabilityKey,
  type ConditionV2,
  type ContextV2,
  type GeoPoint,
  type InputV2,
  type JsonValue,
  type ToV2,
} from '@smarteverything/domain';
import type { Clock } from '../clock';
import type { CommandExecutor } from '../commands/executor';
import type { Store } from '../store/store';

type ChoiceReading = 'id' | 'label';
type RunInputs = Readonly<Record<string, JsonValue>>;

interface WorldOptions {
  readonly store: Store;
  readonly executor: Pick<CommandExecutor, 'intendedValue'>;
  readonly clock: Pick<Clock, 'now'>;
  readonly observed: (deviceId: string, capability: string) => JsonValue | undefined;
}

function homeLocation(store: Store): GeoPoint | null {
  const settings = store.settings.read();
  const location = GEO_POINT.safeParse({
    latitude: settings.latitude,
    longitude: settings.longitude,
  });
  return location.success ? location.data : null;
}

export class AutomationWorld {
  constructor(private readonly options: WorldOptions) {}

  context(inputs: RunInputs, choice: ChoiceReading = 'id'): ContextV2 {
    const { store, clock } = this.options;
    return {
      read: {
        device: (deviceId, control) => this.device(deviceId, control),
        value: (valueId) => this.value(valueId, choice),
        input: (name) => this.named(inputs, name),
      },
      now: clock.now(),
      timeZone: store.settings.read().time_zone,
      forecast: store.weather.read().forecast,
      location: homeLocation(store),
    };
  }

  holds(condition: ConditionV2, inputs: RunInputs): boolean {
    return conditionV2Holds(condition, this.context(inputs));
  }

  input(input: InputV2, inputs: RunInputs): JsonValue {
    return resolveInputV2(input, this.context(inputs));
  }

  resolve(to: ToV2, inputs: RunInputs, choice: ChoiceReading): JsonValue {
    return resolveToV2(to, this.context(inputs, choice));
  }

  private device(deviceId: string, control: CapabilityKey): JsonValue | undefined {
    const { store, executor, observed } = this.options;
    const device = store.devices.find(deviceId);
    const capability = device === undefined ? undefined : capabilityOf(device, control);
    if (capability === undefined || capability.access === 'write') return undefined;
    if (capability.value.kind === 'action') return undefined;
    const effect = store.deviceEffects.find(deviceId, control);
    if (effect !== undefined) return effect.base;
    const current = observed(deviceId, control);
    if (executor.intendedValue(deviceId, control) === undefined) return current;
    const row = store.state
      .list()
      .find((entry) => entry.device_id === deviceId && entry.capability === control);
    return executor.intendedValue(deviceId, control, row?.observed_at) ?? current;
  }

  private value(valueId: string, choice: ChoiceReading): JsonValue {
    const content = this.options.store.automationValues.byId(valueId).content;
    if (content.kind !== 'choice' || choice === 'id') return content.value;
    const selected = content.choices.find((entry) => entry.id === content.value);
    if (selected === undefined)
      throw new AutomationBindingError('the selected choice of the Value does not exist');
    return selected.label;
  }

  private named(inputs: RunInputs, name: string): JsonValue {
    const value = inputs[name];
    if (value === undefined) throw new AutomationBindingError(`Missing input ${name}`);
    return value;
  }
}
