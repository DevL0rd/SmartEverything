import type { StandardCapability, ValueDescriptor } from '@smarteverything/domain';
import {
  attributeUnit,
  attributeValue,
  booleanOf,
  call,
  numberOf,
  readEquals,
  readNumber,
  readString,
  stringList,
  stringOf,
  type CapabilityMapper,
  type CommandCall,
  type ComponentView,
} from './mapper-kit';

export interface NumberRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

interface NumberOptions {
  readonly capability: string;
  readonly attribute: string;
  readonly key: StandardCapability;
  readonly range: NumberRange;
  readonly unit: string | null;
}

function unitOf(
  view: ComponentView,
  options: Pick<NumberOptions, 'capability' | 'attribute' | 'unit'>,
): string | null {
  return attributeUnit(view.status, options.capability, options.attribute) ?? options.unit;
}

export function numberDescriptor(
  view: ComponentView,
  options: Pick<NumberOptions, 'capability' | 'attribute' | 'range' | 'unit'>,
): ValueDescriptor {
  const unit = unitOf(view, options);
  return unit === null
    ? { kind: 'number', ...options.range }
    : { kind: 'number', ...options.range, unit };
}

export function numberSensor(options: NumberOptions): CapabilityMapper {
  const { capability, attribute, key } = options;
  return {
    capability,
    attributes: [attribute],
    commands: [],
    map: (view) => [
      {
        key,
        access: 'read',
        value: numberDescriptor(view, options),
        sources: [{ capability, attribute }],
        read: readNumber(capability, attribute),
        write: null,
      },
    ],
  };
}

export function levelControl(
  options: NumberOptions & { readonly command: string },
): CapabilityMapper {
  const { capability, attribute, key, command } = options;
  return {
    capability,
    attributes: [attribute],
    commands: [command],
    map: (view) => [
      {
        key,
        access: 'read_write',
        value: numberDescriptor(view, options),
        sources: [{ capability, attribute }],
        read: readNumber(capability, attribute),
        write: (value) => [call(capability, command, [numberOf(capability, value)])],
      },
    ],
  };
}

export function booleanSensor(
  capability: string,
  attribute: string,
  key: StandardCapability,
  truthy: readonly string[],
): CapabilityMapper {
  return {
    capability,
    attributes: [attribute],
    commands: [],
    map: () => [
      {
        key,
        access: 'read',
        value: { kind: 'boolean' },
        sources: [{ capability, attribute }],
        read: readEquals(capability, attribute, truthy),
        write: null,
      },
    ],
  };
}

interface ToggleOptions {
  readonly capability: string;
  readonly attribute: string;
  readonly key: StandardCapability;
  readonly onValue: string;
  readonly onCommand: string;
  readonly offCommand: string;
  readonly alsoCovers: readonly string[];
}

export function toggle(options: ToggleOptions): CapabilityMapper {
  const { capability, attribute, key, onValue, onCommand, offCommand } = options;
  return {
    capability,
    attributes: [attribute],
    commands: [onCommand, offCommand, ...options.alsoCovers],
    map: () => [
      {
        key,
        access: 'read_write',
        value: { kind: 'boolean' },
        sources: [{ capability, attribute }],
        read: readEquals(capability, attribute, [onValue]),
        write: (value) => [call(capability, booleanOf(capability, value) ? onCommand : offCommand)],
      },
    ],
  };
}

type Choices =
  | { readonly fixed: readonly string[] }
  | { readonly reportedBy: string; readonly otherwise: readonly string[] };

interface EnumOptions {
  readonly capability: string;
  readonly attribute: string;
  readonly key: StandardCapability;
  readonly choices: Choices;
  readonly command: string | null;
}

function optionsOf(view: ComponentView, capability: string, choices: Choices): readonly string[] {
  if ('fixed' in choices) {
    return choices.fixed;
  }
  const reported = stringList(attributeValue(view.status, capability, choices.reportedBy));
  return reported.length > 0 ? reported : choices.otherwise;
}

export function enumControl(options: EnumOptions): CapabilityMapper {
  const { capability, attribute, key, command, choices } = options;
  return {
    capability,
    attributes: 'fixed' in choices ? [attribute] : [attribute, choices.reportedBy],
    commands: command === null ? [] : [command],
    map: (view) => [
      {
        key,
        access: command === null ? 'read' : 'read_write',
        value: { kind: 'enum', options: [...optionsOf(view, capability, choices)] },
        sources: [{ capability, attribute }],
        read: readString(capability, attribute),
        write:
          command === null
            ? null
            : (value): readonly CommandCall[] => [
                call(capability, command, [stringOf(capability, value)]),
              ],
      },
    ],
  };
}
