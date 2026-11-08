import { execInHandle, parseHandle } from '../../../model/graph/handle-ids';
import type { EdgeEnd, GraphSceneNode, ScenePin } from '../../../model/graph/scene-contract';
import type { GraphPoint } from '../graph-canvas-types';

export const VALUE_PIN_ZOOM = 0.9;
export const TOUCH_SLOP = 8;
export const POINTER_SLOP = 3;

export type SourceKind = 'exec' | 'value';

export interface Card {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly scene: GraphSceneNode;
}

export type ConnectAction =
  | { readonly kind: 'connect'; readonly from: EdgeEnd; readonly to: EdgeEnd }
  | {
      readonly kind: 'dropEmpty';
      readonly from: EdgeEnd;
      readonly point: GraphPoint;
      readonly screen: GraphPoint;
    }
  | { readonly kind: 'none' };

export interface DropInput {
  readonly source: EdgeEnd;
  readonly point: GraphPoint;
  readonly screen: GraphPoint;
  readonly zoom: number;
  readonly cards: readonly Card[];
  readonly landed: EdgeEnd | null;
}

export interface PointerLike {
  readonly clientX?: number;
  readonly clientY?: number;
  readonly changedTouches?: ArrayLike<{ readonly clientX: number; readonly clientY: number }>;
}

const NONE: ConnectAction = { kind: 'none' };

export function sourceKind(handle: string): SourceKind | null {
  const kind = parseHandle(handle)?.kind;
  if (kind === 'execOut') return 'exec';
  return kind === 'valueOut' ? 'value' : null;
}

function isInputHandle(handle: string): boolean {
  const kind = parseHandle(handle)?.kind;
  return kind === 'execIn' || kind === 'valueIn' || kind === 'condition';
}

export function clientPointOf(event: PointerLike): GraphPoint | null {
  const touch = event.changedTouches?.[0];
  if (touch !== undefined) return { x: touch.clientX, y: touch.clientY };
  if (event.clientX === undefined || event.clientY === undefined) return null;
  return { x: event.clientX, y: event.clientY };
}

export function isTap(from: GraphPoint, to: GraphPoint, slop: number): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) < slop;
}

export function cardAt(cards: readonly Card[], point: GraphPoint): Card | null {
  for (let index = cards.length - 1; index >= 0; index -= 1) {
    const card = cards[index];
    if (
      card !== undefined &&
      point.x >= card.x &&
      point.x <= card.x + card.w &&
      point.y >= card.y &&
      point.y <= card.y + card.h
    ) {
      return card;
    }
  }
  return null;
}

function typeKey(type: string): string {
  return type.toLowerCase().replace(/^optional /, '');
}

export function pinOf(cards: readonly Card[], source: EdgeEnd): ScenePin | undefined {
  const card = cards.find((candidate) => candidate.id === source.nodeId);
  return card?.scene.outputs.find((pin) => pin.handle === source.handle);
}

function freeInput(card: Card, type: string | undefined): ScenePin | undefined {
  const free = card.scene.inputs.filter((pin) => !pin.wired);
  const same =
    type === undefined ? undefined : free.find((pin) => typeKey(pin.type) === typeKey(type));
  return same ?? free[0];
}

export function targetOnCard(
  kind: SourceKind,
  card: Card,
  source: { readonly zoom: number; readonly pin: ScenePin | undefined },
): EdgeEnd {
  if (kind === 'value' && source.zoom < VALUE_PIN_ZOOM) {
    const input = freeInput(card, source.pin?.type);
    if (input !== undefined) return { nodeId: card.id, handle: input.handle };
  }
  return { nodeId: card.id, handle: card.scene.execIn ?? execInHandle() };
}

function landedTarget(kind: SourceKind, landed: EdgeEnd | null): EdgeEnd | null {
  if (landed === null) return null;
  const ref = parseHandle(landed.handle)?.kind;
  if (kind === 'exec') return ref === 'execIn' ? landed : null;
  return ref === 'valueIn' || ref === 'condition' ? landed : null;
}

export function resolveDrop(input: DropInput): ConnectAction {
  const { source, point, screen, zoom, cards, landed } = input;
  const card = cardAt(cards, point);
  const empty: ConnectAction = { kind: 'dropEmpty', from: source, point, screen };
  const kind = sourceKind(source.handle);
  if (kind === null) {
    return isInputHandle(source.handle) && landed === null && card === null ? empty : NONE;
  }
  const direct = landedTarget(kind, landed);
  if (direct !== null) return { kind: 'connect', from: source, to: direct };
  if (card === null) return empty;
  const to = targetOnCard(kind, card, { zoom, pin: pinOf(cards, source) });
  return { kind: 'connect', from: source, to };
}
