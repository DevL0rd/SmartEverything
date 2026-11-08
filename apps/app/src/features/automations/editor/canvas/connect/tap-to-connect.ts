import { parseHandle } from '../../../model/graph/handle-ids';
import type { EdgeEnd } from '../../../model/graph/scene-contract';
import {
  VALUE_PIN_ZOOM,
  pinOf,
  sourceKind,
  targetOnCard,
  type Card,
  type ConnectAction,
} from './connect-controller';

export type TapTarget =
  | { readonly kind: 'handle'; readonly end: EdgeEnd; readonly side: 'source' | 'target' }
  | { readonly kind: 'card'; readonly nodeId: string }
  | { readonly kind: 'pane' }
  | { readonly kind: 'other' };

export interface ElementLike {
  closest(selector: string): ElementLike | null;
  getAttribute(name: string): string | null;
}

export interface TapContext {
  readonly zoom: number;
  readonly cards: readonly Card[];
}

export interface TapResult {
  readonly armed: EdgeEnd | null;
  readonly action: ConnectAction;
}

export const EXEC_HINT = 'Tap the step that runs next';
export const VALUE_HINT = 'Tap the input that takes this value';

const NOTHING: ConnectAction = { kind: 'none' };

export function hintFor(armed: EdgeEnd): string {
  return sourceKind(armed.handle) === 'value' ? VALUE_HINT : EXEC_HINT;
}

export interface NamedNode {
  readonly id: string;
  readonly title: string;
  readonly rows: readonly { readonly handle: string; readonly label: string }[];
  readonly outputs: readonly { readonly handle: string; readonly label: string }[];
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export function armedHint(nodes: readonly NamedNode[], armed: EdgeEnd): string {
  const node = nodes.find((candidate) => candidate.id === armed.nodeId);
  const pin = [...(node?.rows ?? []), ...(node?.outputs ?? [])].find(
    (candidate) => candidate.handle === armed.handle,
  );
  if (node === undefined || pin === undefined) return hintFor(armed);
  return `${pin.label} of ${node.title}: ${lowerFirst(hintFor(armed))}`;
}

function handleTarget(element: ElementLike): TapTarget | null {
  const side = element.closest('.react-flow__handle.source') === null ? 'target' : 'source';
  const nodeId = element.getAttribute('data-nodeid');
  const handle = element.getAttribute('data-handleid');
  if (nodeId === null || handle === null) return null;
  return { kind: 'handle', end: { nodeId, handle }, side };
}

export function tapTargetOf(element: ElementLike | null): TapTarget {
  if (element === null) return { kind: 'other' };
  const handle = element.closest('.react-flow__handle');
  const found = handle === null ? null : handleTarget(handle);
  if (found !== null) return found;
  const nodeId = element.closest('.react-flow__node')?.getAttribute('data-id') ?? null;
  if (nodeId !== null) return { kind: 'card', nodeId };
  return element.closest('.react-flow__pane') === null ? { kind: 'other' } : { kind: 'pane' };
}

function canArm(end: EdgeEnd, zoom: number): boolean {
  const kind = sourceKind(end.handle);
  return kind === 'exec' || (kind === 'value' && zoom >= VALUE_PIN_ZOOM);
}

function sameEnd(left: EdgeEnd, right: EdgeEnd): boolean {
  return left.nodeId === right.nodeId && left.handle === right.handle;
}

function arm(armed: EdgeEnd | null, end: EdgeEnd, zoom: number): TapResult {
  if (!canArm(end, zoom)) return { armed, action: NOTHING };
  if (armed !== null && sameEnd(armed, end)) return { armed: null, action: NOTHING };
  return { armed: end, action: NOTHING };
}

function tappedValueInput(armed: EdgeEnd, tap: TapTarget): ConnectAction | null {
  if (tap.kind !== 'handle' || tap.side !== 'target') return null;
  const ref = parseHandle(tap.end.handle)?.kind;
  return ref === 'valueIn' || ref === 'condition'
    ? { kind: 'connect', from: armed, to: tap.end }
    : null;
}

function tappedCard(tap: TapTarget): string | null {
  if (tap.kind === 'handle') return tap.end.nodeId;
  return tap.kind === 'card' ? tap.nodeId : null;
}

function land(armed: EdgeEnd, tap: TapTarget, context: TapContext): ConnectAction {
  const kind = sourceKind(armed.handle);
  if (kind === null) return NOTHING;
  const pin = tappedValueInput(armed, tap);
  if (pin !== null && kind === 'value') return pin;
  const nodeId = tappedCard(tap);
  const card = context.cards.find((candidate) => candidate.id === nodeId);
  if (card === undefined) return NOTHING;
  const to = targetOnCard(kind, card, { zoom: context.zoom, pin: pinOf(context.cards, armed) });
  return { kind: 'connect', from: armed, to };
}

export function reduceTap(armed: EdgeEnd | null, tap: TapTarget, context: TapContext): TapResult {
  if (tap.kind === 'other') return { armed, action: NOTHING };
  if (tap.kind === 'handle' && tap.side === 'source') return arm(armed, tap.end, context.zoom);
  if (armed === null) return { armed: null, action: NOTHING };
  if (tap.kind === 'pane') return { armed: null, action: NOTHING };
  return { armed: null, action: land(armed, tap, context) };
}

export function tapConsumed(armed: EdgeEnd | null, tap: TapTarget, result: TapResult): boolean {
  if (tap.kind === 'other' || tap.kind === 'pane') return false;
  if (armed !== null) return true;
  return tap.kind === 'handle' && tap.side === 'source' && result.armed !== null;
}
