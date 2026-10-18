import {
  humanizeKey,
  type CapabilityKey,
  type RawCapability,
  type StandardCapability,
} from '@smarteverything/domain';

export const MAIN_COMPONENT = 'main';

export function snakeOf(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_.]+/g, '_')
    .replace(/^[^a-z0-9]+/, '');
}

function componentPrefix(component: string): string {
  return component === MAIN_COMPONENT ? '' : `${snakeOf(component).replace(/\./g, '_')}-`;
}

export function standardKeyFor(component: string, key: StandardCapability): CapabilityKey {
  return component === MAIN_COMPONENT ? key : `raw:${componentPrefix(component)}${key}`;
}

export function rawAttributeKey(
  component: string,
  capability: string,
  attribute: string,
): RawCapability {
  return `raw:${componentPrefix(component)}${snakeOf(capability)}.${snakeOf(attribute)}`;
}

export function rawCommandKey(
  component: string,
  capability: string,
  command: string,
): RawCapability {
  return `raw:${componentPrefix(component)}${snakeOf(capability)}:${snakeOf(command)}`;
}

export function rawCapabilityKey(component: string, capability: string): RawCapability {
  return `raw:${componentPrefix(component)}${snakeOf(capability)}`;
}

export { humanizeKey as humanize } from '@smarteverything/domain';

export function componentLabel(
  component: string,
  label: string,
  componentName: string | null,
): string {
  return component === MAIN_COMPONENT
    ? label
    : `${componentName ?? humanizeKey(component)}: ${label}`;
}
