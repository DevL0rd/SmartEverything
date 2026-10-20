import { NODE_REGISTRY, type JsonValue } from '@smarteverything/domain';
import { aggregateHandlers } from './aggregate';
import { changedHandlers } from './changed';
import { clockHandlers } from './clock';
import { daylightHandlers } from './daylight';
import { deviceHealthHandlers } from './device-health';
import { deviceReadHandlers } from './device-reads';
import { historyHandlers } from './history';
import { integrationHandlers } from './integration-reads';
import { historyStatsHandlers } from './history-stats';
import { presenceHandlers } from './presence';
import { queryHandlers } from './query';
import { randomHandlers } from './random';
import {
  ReadFailure,
  type ReadHandlers,
  type ReadInputs,
  type ReadResult,
  type ReadScope,
  type WorldReads,
} from './read-port';
import { roomsGroupsHandlers } from './rooms-groups';
import { sunHandlers } from './sun';
import { snapshotHandlers } from './snapshot';
import { variableHandlers } from './variables';
import { weatherHandlers } from './weather';
import type { WorldReadDeps } from './deps';

function handlersOf(deps: WorldReadDeps): ReadHandlers {
  return {
    ...deviceReadHandlers(deps),
    ...deviceHealthHandlers(deps),
    ...aggregateHandlers(deps),
    ...queryHandlers(deps),
    ...roomsGroupsHandlers(deps),
    ...weatherHandlers(deps),
    ...presenceHandlers(deps.presence),
    ...historyHandlers(deps),
    ...historyStatsHandlers(deps),
    ...snapshotHandlers(deps),
    ...variableHandlers(deps),
    ...daylightHandlers(deps),
    ...randomHandlers(deps.random),
    ...clockHandlers(deps),
    ...changedHandlers(),
    ...sunHandlers(deps),
    ...integrationHandlers(deps, deps.signals),
  };
}

function withDefaults(kind: string, inputs: ReadInputs): ReadInputs {
  const declared = NODE_REGISTRY.get(kind)?.inputs ?? [];
  const defaults = declared.flatMap((port): [string, JsonValue][] =>
    port.default === undefined ? [] : [[port.name, port.default]],
  );
  return { ...Object.fromEntries(defaults), ...inputs };
}

export function readKindIds(): readonly string[] {
  return NODE_REGISTRY.kinds.filter((kind) => kind.class === 'read').map((kind) => kind.id);
}

export function createWorldReads(deps: WorldReadDeps): WorldReads {
  const handlers = handlersOf(deps);
  return {
    read: (kind, inputs, scope: ReadScope): ReadResult => {
      const handler = handlers[kind];
      if (handler === undefined) {
        throw new ReadFailure('NotFound', `${kind} is not something the home can be asked`);
      }
      return handler(withDefaults(kind, inputs), scope);
    },
  };
}
