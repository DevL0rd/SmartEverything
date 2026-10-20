import type { FlowType } from '@smarteverything/domain';
import { canonicalType } from '../functions/interface-hash';
import type { Program } from '../program/walk';
import { optionalIf, own } from './scope-types';
import type { PortTypes, RootTypes } from './shapes';

const TEXT: FlowType = { t: 'text' };
const NUMBER: FlowType = { t: 'number' };
const INSTANT: FlowType = { t: 'instant' };

const HOME: FlowType = {
  t: 'record',
  fields: {
    timeZone: TEXT,
    name: TEXT,
    latitude: { t: 'optional', of: NUMBER },
    longitude: { t: 'optional', of: NUMBER },
  },
};

const RUN: FlowType = {
  t: 'record',
  fields: {
    id: TEXT,
    startedAt: INSTANT,
    automation: { t: 'ref', of: 'automation' },
    attempt: { t: 'optional', of: NUMBER },
  },
};

function commonFields(lists: readonly PortTypes[]): PortTypes {
  const [first, ...rest] = lists;
  if (first === undefined) return {};
  return Object.fromEntries(
    Object.entries(first).filter(([name, type]) =>
      rest.every((other) => {
        const held = own(other, name);
        return held !== undefined && canonicalType(held) === canonicalType(type);
      }),
    ),
  );
}

export function programRoots(program: Program, triggers: readonly PortTypes[]): RootTypes {
  const base: RootTypes = {
    inputs: {
      t: 'record',
      fields: Object.fromEntries(
        program.inputs.map((port) => [
          port.name,
          optionalIf(!port.required && port.default === undefined, port.type),
        ]),
      ),
    },
    vars: {
      t: 'record',
      fields: Object.fromEntries(
        program.variables.map((variable) => [variable.name, variable.type]),
      ),
    },
    home: HOME,
    run: RUN,
  };
  if (program.kind !== 'automation') return base;
  const fields = { ...commonFields(triggers), key: TEXT, at: INSTANT };
  return { ...base, trigger: { t: 'record', fields } };
}
