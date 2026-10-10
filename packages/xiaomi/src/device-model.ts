import {
  catalogueEntryOf,
  type AccessMode,
  type CapabilityKey,
  type DeviceCapability,
  type DeviceKind,
  type StandardCapability,
  type ValueDescriptor,
} from '@smarteverything/domain';
import { ACTION_RULES, PROPERTY_RULES, candidateKeys } from './catalogue-rules';
import { MiotSpecError } from './errors';
import {
  describeColor,
  describeProperty,
  type PropertyValue,
  type ValueCodec,
} from './miot-values';
import {
  deviceKindOf,
  parseUrn,
  standardName,
  type MiotAction,
  type MiotProperty,
  type MiotService,
  type MiotSpec,
} from './spec';

export interface PropertyBinding {
  readonly kind: 'property';
  readonly siid: number;
  readonly piid: number;
  readonly name: string;
  readonly readable: boolean;
  readonly codec: ValueCodec;
  readonly descriptor: ValueDescriptor;
}

export interface ActionInput {
  readonly name: string;
  readonly piid: number;
  readonly codec: ValueCodec;
  readonly descriptor: ValueDescriptor;
}

export interface ActionBinding {
  readonly kind: 'action';
  readonly siid: number;
  readonly aiid: number;
  readonly name: string;
  readonly inputs: readonly ActionInput[];
}

export type Binding = PropertyBinding | ActionBinding;

export interface DeviceModel {
  readonly kind: DeviceKind;
  readonly capabilities: readonly DeviceCapability[];
  readonly bindings: ReadonlyMap<CapabilityKey, Binding>;
  readonly propertyKeys: ReadonlyMap<string, CapabilityKey>;
  readonly problems: readonly string[];
}

interface Builder {
  readonly capabilities: DeviceCapability[];
  readonly bindings: Map<CapabilityKey, Binding>;
  readonly propertyKeys: Map<string, CapabilityKey>;
  readonly problems: string[];
}

function addressOf(siid: number, piid: number): string {
  return `${String(siid)}.${String(piid)}`;
}

function accessOf(access: readonly string[]): AccessMode | null {
  const readable = access.includes('read') || access.includes('notify');
  const writable = access.includes('write');
  if (readable && writable) {
    return 'read_write';
  }
  if (writable) {
    return 'write';
  }
  return readable ? 'read' : null;
}

function nameOf(type: string): string {
  return parseUrn(type).name;
}

function labelOf(
  service: MiotService,
  entry: { readonly type: string; readonly description: string },
): string {
  const serviceLabel = service.description.trim() || nameOf(service.type);
  return `${serviceLabel}: ${entry.description.trim() || nameOf(entry.type)}`;
}

const INVERTED_KEYS: ReadonlySet<StandardCapability> = new Set(['contact']);

function valueFor(property: MiotProperty, key: StandardCapability): PropertyValue {
  if (INVERTED_KEYS.has(key) && property.format === 'bool') {
    return { descriptor: { kind: 'boolean' }, codec: { kind: 'inverted-boolean' } };
  }
  return key === 'color' && property.format !== 'bool' && property.format !== 'string'
    ? describeColor()
    : describeProperty(property);
}

function chooseKey(
  builder: Builder,
  candidates: readonly StandardCapability[],
  valueOf: (key: StandardCapability) => PropertyValue,
): { readonly key: StandardCapability; readonly value: PropertyValue } | null {
  for (const key of candidates) {
    const value = valueOf(key);
    if (!builder.bindings.has(key) && catalogueEntryOf(key).kind === value.descriptor.kind) {
      return { key, value };
    }
  }
  return null;
}

function addProperty(builder: Builder, service: MiotService, property: MiotProperty): void {
  const access = accessOf(property.access);
  if (access === null) {
    builder.problems.push(`${property.type} is neither readable nor writable`);
    return;
  }
  const candidates = candidateKeys(
    PROPERTY_RULES,
    standardName(service.type),
    standardName(property.type),
  );
  const chosen = chooseKey(builder, candidates, (key) => valueFor(property, key));
  const value = chosen === null ? describeProperty(property) : chosen.value;
  const key: CapabilityKey =
    chosen === null ? `raw:${String(service.iid)}.${String(property.iid)}` : chosen.key;
  const label = chosen === null ? labelOf(service, property) : catalogueEntryOf(chosen.key).label;
  builder.capabilities.push({ key, label, access, value: value.descriptor });
  builder.propertyKeys.set(addressOf(service.iid, property.iid), key);
  builder.bindings.set(key, {
    kind: 'property',
    siid: service.iid,
    piid: property.iid,
    name: nameOf(property.type),
    readable: property.access.includes('read'),
    codec: value.codec,
    descriptor: value.descriptor,
  });
}

function actionInputs(service: MiotService, action: MiotAction): ActionInput[] {
  const inputs = action.in.map((piid) => {
    const property = service.properties.find((candidate) => candidate.iid === piid);
    if (property === undefined) {
      throw new MiotSpecError(
        action.type,
        `input property ${String(piid)} in service ${String(service.iid)}`,
        'none',
      );
    }
    return { name: nameOf(property.type), piid, ...describeProperty(property) };
  });
  return inputs.map((input, index) =>
    inputs.findIndex((other) => other.name === input.name) === index
      ? input
      : { ...input, name: `${input.name}-${String(input.piid)}` },
  );
}

function addAction(builder: Builder, service: MiotService, action: MiotAction): void {
  const inputs = actionInputs(service, action);
  const candidates = candidateKeys(
    ACTION_RULES,
    standardName(service.type),
    standardName(action.type),
  );
  const chosen = candidates.find((key) => !builder.bindings.has(key));
  const key: CapabilityKey = chosen ?? `raw:action.${String(service.iid)}.${String(action.iid)}`;
  const label = chosen === undefined ? labelOf(service, action) : catalogueEntryOf(chosen).label;
  const value: ValueDescriptor =
    inputs.length === 0
      ? { kind: 'action' }
      : { kind: 'action', arguments: inputs.map(({ name }) => name) };
  builder.capabilities.push({ key, label, access: 'write', value });
  builder.bindings.set(key, {
    kind: 'action',
    siid: service.iid,
    aiid: action.iid,
    name: nameOf(action.type),
    inputs,
  });
}

function attempt(builder: Builder, subject: string, add: () => void): void {
  try {
    add();
  } catch (cause) {
    if (!(cause instanceof MiotSpecError)) {
      throw cause;
    }
    builder.problems.push(`${subject}: ${cause.message}`);
  }
}

export function modelFromSpec(spec: MiotSpec): DeviceModel {
  const builder: Builder = {
    capabilities: [],
    bindings: new Map(),
    propertyKeys: new Map(),
    problems: [],
  };
  for (const service of spec.services) {
    for (const property of service.properties) {
      attempt(builder, property.type, () => {
        addProperty(builder, service, property);
      });
    }
    for (const action of service.actions) {
      attempt(builder, action.type, () => {
        addAction(builder, service, action);
      });
    }
  }
  return { kind: deviceKindOf(spec.type), ...builder };
}

export function propertyKeyOf(
  model: DeviceModel,
  siid: number,
  piid: number,
): CapabilityKey | null {
  return model.propertyKeys.get(addressOf(siid, piid)) ?? null;
}
