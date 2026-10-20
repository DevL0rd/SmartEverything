import { indexProgram, siblings } from '@smarteverything/flow/program/lookup';
import type { Entry, NodeEntry, ProgramIndex } from '@smarteverything/flow/program/lookup';
import { formatScopePath } from '@smarteverything/flow/program/paths';
import type { EdgeEnd, SceneNode } from '../../model/canvas/contract';
import type { IntentEnv } from './intent-env';

export const INPUTS_KEY = 'inputs';

export const REFUSED_BACKWARD = 'Steps run top to bottom. Use a loop to repeat.';

export const REFUSED_ACROSS = 'A step can only follow a step in the same lane.';

export const REFUSED_GONE = 'That step is no longer on the canvas.';

export const REFUSED_EXEC_END = 'A step can only follow another step.';

export interface Connection {
  readonly from: EdgeEnd;
  readonly to: EdgeEnd;
}

function isValueWire(source: SceneNode, from: EdgeEnd): boolean {
  return source.outputs.some((output) => output.name === from.port);
}

function producerKey(source: SceneNode, entry: Entry | undefined): string | undefined {
  return source.role === 'inputs' ? INPUTS_KEY : entry?.node.key;
}

function connectValue(env: IntentEnv, source: SceneNode, connection: Connection): void {
  const index = indexProgram(env.store.state.get().program);
  const producer = producerKey(source, index.byId.get(source.id));
  const consumer = index.byId.get(connection.to.nodeId)?.node.key;
  if (producer === undefined || consumer === undefined) {
    env.actions.refused(REFUSED_GONE);
    return;
  }
  env.store.apply([
    {
      op: 'set',
      key: consumer,
      ports: { [connection.to.port]: { wire: { from: producer, port: connection.from.port } } },
    },
  ]);
}

function refusalFor(index: ProgramIndex, from: NodeEntry, to: NodeEntry): string | null {
  if (formatScopePath(from.scope) !== formatScopePath(to.scope)) return REFUSED_ACROSS;
  const order = siblings(index, from.node.key).map((node) => node.key);
  return order.indexOf(to.node.key) < order.indexOf(from.node.key) ? REFUSED_BACKWARD : null;
}

function connectSteps(env: IntentEnv, connection: Connection): void {
  const index = indexProgram(env.store.state.get().program);
  const from = index.byId.get(connection.from.nodeId);
  const to = index.byId.get(connection.to.nodeId);
  if (from?.kind !== 'node' || to?.kind !== 'node') {
    env.actions.refused(REFUSED_EXEC_END);
    return;
  }
  const refusal = refusalFor(index, from, to);
  if (refusal !== null) {
    env.actions.refused(refusal);
    return;
  }
  env.store.apply([
    { op: 'move', key: to.node.key, in: formatScopePath(from.scope), after: from.node.key },
  ]);
}

export function connectNodes(env: IntentEnv, connection: Connection): void {
  const source = env.scene().nodes.find((node) => node.id === connection.from.nodeId);
  if (source === undefined) {
    env.actions.refused(REFUSED_GONE);
    return;
  }
  if (isValueWire(source, connection.from)) connectValue(env, source, connection);
  else connectSteps(env, connection);
}
