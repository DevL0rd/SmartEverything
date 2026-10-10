import type { JsonValue } from '@smarteverything/domain';
import { inComponent, type Binding, type RawBinding, type SmartThingsCommand } from './bindings';
import type { CapabilityDefinition, DefinitionArgument } from './definition-schema';
import { descriptorFromSchema, descriptorFromValue } from './descriptors';
import { SmartThingsCommandError } from './errors';
import { humanize, rawAttributeKey, rawCommandKey } from './keys';
import { attributeUnit, attributeValue, call, isJsonRecord } from './mapper-kit';
import type { ComponentStatus } from './rest-schemas';

export interface RawContext {
  readonly component: string;
  readonly capability: string;
  readonly status: ComponentStatus;
  readonly coveredAttributes: ReadonlySet<string>;
  readonly coveredCommands: ReadonlySet<string>;
}

function rawRead(capability: string, attribute: string): Binding['read'] {
  return (status) => attributeValue(status, capability, attribute);
}

function attributeBinding(
  context: RawContext,
  attribute: string,
  value: Binding['capability']['value'],
  setter: string | null,
): RawBinding {
  const { component, capability } = context;
  return {
    capability: {
      key: rawAttributeKey(component, capability, attribute),
      label: `${humanize(capability)} ${humanize(attribute).toLowerCase()}`,
      access: setter === null ? 'read' : 'read_write',
      value,
    },
    component,
    sources: [{ capability, attribute }],
    read: rawRead(capability, attribute),
    write:
      setter === null
        ? null
        : (written): readonly SmartThingsCommand[] =>
            inComponent(component, [call(capability, setter, [written])]),
  };
}

function argumentsFrom(
  capability: string,
  parameters: readonly DefinitionArgument[],
  value: JsonValue,
): readonly JsonValue[] {
  const given = isJsonRecord(value) ? value : {};
  const result: JsonValue[] = [];
  let skipped: string | null = null;
  for (const parameter of parameters) {
    const entry = given[parameter.name];
    if (entry === undefined && parameter.optional !== true) {
      throw new SmartThingsCommandError(
        capability,
        value,
        `the argument ${parameter.name} is missing`,
      );
    }
    if (entry === undefined) {
      skipped = skipped ?? parameter.name;
    } else if (skipped !== null) {
      throw new SmartThingsCommandError(capability, value, `the argument ${skipped} is missing`);
    } else {
      result.push(entry);
    }
  }
  return result;
}

function commandBinding(
  context: RawContext,
  command: string,
  parameters: readonly DefinitionArgument[],
): RawBinding {
  const { component, capability } = context;
  const names = parameters.map((parameter) => parameter.name);
  return {
    capability: {
      key: rawCommandKey(component, capability, command),
      label: `${humanize(capability)}: ${humanize(command).toLowerCase()}`,
      access: 'write',
      value: names.length === 0 ? { kind: 'action' } : { kind: 'action', arguments: names },
    },
    component,
    sources: [],
    read: () => undefined,
    write: (value) =>
      inComponent(component, [
        names.length === 0
          ? call(capability, command)
          : call(capability, command, argumentsFrom(capability, parameters, value)),
      ]),
  };
}

function setterOf(
  definition: CapabilityDefinition,
  setter: string | undefined,
  context: RawContext,
): string | null {
  const command = Object.keys(definition.commands ?? {}).find((name) => name === setter);
  return command === undefined || context.coveredCommands.has(command) ? null : command;
}

export function rawFromDefinition(
  context: RawContext,
  definition: CapabilityDefinition,
): readonly RawBinding[] {
  const setters: ReadonlySet<string | undefined> = new Set(
    Object.values(definition.attributes ?? {}).map((spec) => spec.setter),
  );
  const attributes = Object.entries(definition.attributes ?? {})
    .filter(([attribute]) => !context.coveredAttributes.has(attribute))
    .map(([attribute, spec]) => {
      const setter = setterOf(definition, spec.setter, context);
      const unit = attributeUnit(context.status, context.capability, attribute);
      return attributeBinding(
        context,
        attribute,
        descriptorFromSchema(spec.schema.properties.value, unit),
        setter,
      );
    });
  const commands = Object.entries(definition.commands ?? {})
    .filter(([command]) => !context.coveredCommands.has(command) && !setters.has(command))
    .map(([command, spec]) => commandBinding(context, command, spec.arguments ?? []));
  return [...attributes, ...commands];
}

export function rawFromStatus(context: RawContext): readonly RawBinding[] {
  return Object.entries(context.status[context.capability] ?? {})
    .filter(([attribute]) => !context.coveredAttributes.has(attribute))
    .map(([attribute, state]) => {
      const descriptor = descriptorFromValue(state.value ?? null, state.unit ?? null);
      return attributeBinding(context, attribute, descriptor, null);
    });
}
