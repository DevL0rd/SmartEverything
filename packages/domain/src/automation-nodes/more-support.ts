import type { FlowType } from '../automation-v3/types';
import type { InputPortDecl, OutputPortDecl } from './define';

export const FLAG: FlowType = { t: 'boolean' };
export const TEXT: FlowType = { t: 'text' };
export const NUMBER: FlowType = { t: 'number' };
export const INTEGER: FlowType = { t: 'number', integer: true };
export const INSTANT: FlowType = { t: 'instant' };
export const DURATION: FlowType = { t: 'duration' };
export const SIGNED_MS: FlowType = { t: 'number', integer: true, unit: 'ms' };
export const ANY: FlowType = { t: 'any' };
const ITEM: FlowType = { t: 'param', name: 'T' };
export const ITEMS: FlowType = { t: 'list', of: ITEM };

export function choice(options: readonly (readonly [string, string])[]): FlowType {
  return { t: 'choice', options: options.map(([id, label]) => ({ id, label })) };
}

export function option(
  name: string,
  type: FlowType,
  description: string,
  extra: Partial<InputPortDecl> = {},
): InputPortDecl {
  return { name, type, required: false, static: true, description, ...extra };
}

export function input(
  name: string,
  type: FlowType,
  description: string,
  extra: Partial<InputPortDecl> = {},
): InputPortDecl {
  return { name, type, required: true, description, ...extra };
}

export function wired(name: string, of: FlowType, description: string): InputPortDecl {
  return { name, type: { t: 'optional', of }, required: false, description };
}

export function output(
  name: string,
  type: FlowType,
  description: string,
  optional = false,
): OutputPortDecl {
  return { name, type, description, ...(optional ? { optional: true } : {}) };
}

export const WEEKDAY_OPTIONS: readonly (readonly [string, string])[] = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
];
