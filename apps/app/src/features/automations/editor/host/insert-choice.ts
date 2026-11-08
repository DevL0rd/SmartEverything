import {
  TRIGGER_KIND_PREFIX,
  type FlowNode,
  type NodeKindLookup,
  type PortValue,
} from '@smarteverything/domain';
import { lit } from '../../model/templates/build';
import { linkRequest, pinInsertion, type PinLink } from '../palette/pin-filter';
import type { Insertion } from '../palette/armed-insert';
import type { PaletteChoice } from '../palette/palette-categories';
import { planConnect } from './connect-intent';
import { planInsert, type InsertRequest } from './insert-intent';
import {
  commit,
  failed,
  shownDocument,
  type CanvasPoint,
  type GraphDocument,
  type IntentEnv,
  type IntentOutcome,
} from './intent-env';
import { planSnippet } from './snippet-intent';

export const DEVICE_SET_KIND = 'device.set';
export const FUNCTION_CALL_KIND = 'fn.call';

export const REFUSED_SNIPPET_PIN = 'A snippet goes on a wire between steps.';
export const REFUSED_NO_KIND = 'That choice cannot be added to the canvas.';

export interface InsertEnv {
  readonly intent: IntentEnv;
  readonly snippet: (id: string) => readonly FlowNode[] | undefined;
}

export type InsertResult =
  { readonly t: 'done'; readonly outcome: IntentOutcome } | { readonly t: 'reusable' };

interface KindRequest {
  readonly kind: string;
  readonly ports?: Readonly<Record<string, PortValue>>;
}

export function kindRequestOf(choice: PaletteChoice): KindRequest | undefined {
  switch (choice.source) {
    case 'node':
      return { kind: choice.kindId };
    case 'function':
      return { kind: FUNCTION_CALL_KIND, ports: { fn: lit(choice.functionId) } };
    case 'preset':
      return { kind: DEVICE_SET_KIND, ports: { control: lit(choice.control) } };
    case 'kind-preset':
    case 'trigger-preset':
      return {
        kind: choice.kindId,
        ports: Object.fromEntries(
          Object.entries(choice.ports).map(([name, value]) => [name, lit(value)]),
        ),
      };
    case 'snippet':
    case 'new-reusable':
      return undefined;
  }
}

function documentOf(env: IntentEnv): GraphDocument {
  const { program, layout } = env.store.state.get();
  return shownDocument({ program, layout }, env.runtime);
}

function pointOf(point: Insertion['point']): CanvasPoint | undefined {
  return point.at ?? undefined;
}

function snippetOutcome(id: string, point: Insertion['point'], env: InsertEnv): IntentOutcome {
  const nodes = env.snippet(id);
  if (nodes === undefined) return failed(`There is no snippet "${id}".`);
  const { pin } = point;
  if (pin !== null && pin.kind !== 'exec') return failed(REFUSED_SNIPPET_PIN);
  const after = pin === null ? undefined : { nodeId: pin.nodeId, port: pin.port };
  const planned = planSnippet(
    documentOf(env.intent),
    { nodes, after, point: pointOf(point) },
    env.intent.runtime,
  );
  return commit(env.intent.store, planned, env.intent.runtime);
}

interface Built {
  readonly insert: InsertRequest;
  readonly link: PinLink | undefined;
}

function insertRequest(
  request: KindRequest,
  point: Insertion['point'],
  kinds: NodeKindLookup,
): Built | undefined {
  const at = pointOf(point);
  if (point.pin === null) {
    return { insert: { ...request, ...(at === undefined ? {} : { point: at }) }, link: undefined };
  }
  const made = pinInsertion(point.pin, request.kind, kinds, at);
  if (made === undefined) return undefined;
  return {
    insert: { ...made.insert, ...(request.ports === undefined ? {} : { ports: request.ports }) },
    link: made.link,
  };
}

function kindOutcome(
  request: KindRequest,
  point: Insertion['point'],
  env: IntentEnv,
): IntentOutcome {
  const built = insertRequest(request, point, env.runtime.kinds);
  if (built === undefined) return failed(REFUSED_NO_KIND);
  const { store, runtime } = env;
  store.beginGesture();
  try {
    const added = commit(store, planInsert(documentOf(env), built.insert, runtime), runtime);
    const created = added.ok ? added.selection?.[0] : undefined;
    if (built.link === undefined || created === undefined) return added;
    return commit(
      store,
      planConnect(documentOf(env), linkRequest(built.link, created), runtime.kinds),
      runtime,
    );
  } finally {
    store.endGesture();
  }
}

function startsAutomation(choice: PaletteChoice): boolean {
  return (
    choice.source === 'trigger-preset' ||
    (choice.source === 'node' && choice.kindId.startsWith(TRIGGER_KIND_PREFIX))
  );
}

function placeFor(choice: PaletteChoice, point: Insertion['point']): Insertion['point'] {
  return startsAutomation(choice) ? { pin: null, at: point.at, filtered: false } : point;
}

export function runInsertion(insertion: Insertion, env: InsertEnv): InsertResult {
  const { choice } = insertion;
  const point = placeFor(choice, insertion.point);
  if (choice.source === 'new-reusable') return { t: 'reusable' };
  if (choice.source === 'snippet') {
    return { t: 'done', outcome: snippetOutcome(choice.snippetId, point, env) };
  }
  const request = kindRequestOf(choice);
  if (request === undefined) return { t: 'done', outcome: failed(REFUSED_NO_KIND) };
  return { t: 'done', outcome: kindOutcome(request, point, env.intent) };
}
