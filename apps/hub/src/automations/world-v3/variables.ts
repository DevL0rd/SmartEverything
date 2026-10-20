import type { JsonValue } from '@smarteverything/domain';
import type { KeptScope } from '@smarteverything/flow/interpret/kept-types';
import { z } from 'zod';
import { parseInputs } from './inputs';
import {
  ReadFailure,
  outputsOf,
  type ReadHandlers,
  type ReadResult,
  type ReadScope,
} from './read-port';
import { VALUE_REF } from './refs';
import { notFound } from './targets';
import type { AutomationOwnedValuesRepository } from '../../store/repositories/automation-owned-values';
import type { WorldReadDeps } from './deps';
import type { KeptData } from './kept-data';

export interface PersistentVariable {
  readonly value: JsonValue;
  readonly revision: number;
}

export interface PersistentVariables {
  readonly read: (
    automationId: string,
    name: string,
    kept?: KeptScope,
  ) => PersistentVariable | undefined;
}

export function withKeptData(
  base: PersistentVariables,
  kept: Pick<KeptData, 'read'>,
): PersistentVariables {
  return {
    read: (automationId, name, scope): PersistentVariable | undefined =>
      scope === undefined
        ? base.read(automationId, name)
        : kept.read({ automationId, name, instance: scope.instance, type: scope.type }),
  };
}

export function persistentFromOwned(
  owned: Pick<AutomationOwnedValuesRepository, 'list'>,
): PersistentVariables {
  return {
    read: (automationId, name): PersistentVariable | undefined => {
      const row = owned.list(automationId).find((entry) => entry.content.name === name);
      return row === undefined ? undefined : { value: row.content.value, revision: row.revision };
    },
  };
}

const VAR_GET = z.discriminatedUnion('source', [
  z.object({ source: z.literal('run'), name: z.string().min(1).optional() }),
  z.object({ source: z.literal('automation'), name: z.string().min(1), asLabel: z.boolean() }),
  z.object({ source: z.literal('home'), value: VALUE_REF, asLabel: z.boolean() }),
]);

type VarGet = z.output<typeof VAR_GET>;

function homeValue(deps: WorldReadDeps, id: string, asLabel: boolean): PersistentVariable {
  const row = notFound(() => deps.store.automationValues.byId(id));
  const { content } = row;
  if (content.kind !== 'choice' || !asLabel) {
    return { value: content.value, revision: row.revision };
  }
  const selected = content.choices.find((choice) => choice.id === content.value);
  if (selected === undefined) {
    throw new ReadFailure('NotFound', 'The selected choice of the Value does not exist');
  }
  return { value: selected.label, revision: row.revision };
}

function ownedVariable(deps: WorldReadDeps, name: string, scope: ReadScope): PersistentVariable {
  const kept = scope.kept?.(name);
  const found = deps.persistent.read(scope.automationId, name, kept);
  if (found !== undefined) return found;
  if (kept !== undefined) return { value: kept.start, revision: 0 };
  throw new ReadFailure('NotFound', `The automation has no variable ${name} yet`);
}

function variableOf(deps: WorldReadDeps, request: VarGet, scope: ReadScope): PersistentVariable {
  switch (request.source) {
    case 'run':
      throw new ReadFailure('Invalid', 'A run variable is read from the run, not from the home');
    case 'home':
      return homeValue(deps, request.value, request.asLabel);
    case 'automation':
      return ownedVariable(deps, request.name, scope);
  }
}

export function variableHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'var.get': (inputs, scope): ReadResult => {
      const request = parseInputs('var.get', VAR_GET, inputs);
      const { value, revision } = variableOf(deps, request, scope);
      return outputsOf({ value, revision });
    },
  };
}
