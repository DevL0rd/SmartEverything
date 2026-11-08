import { Handle, Position } from '@xyflow/react';
import type { ReactNode } from 'react';
import type { PortShape, SceneCondition, ScenePin } from '../../../model/graph/scene-contract';

const BY_SHAPE: ReadonlyMap<PortShape, string> = new Map([
  ['triangle', 'error'],
  ['diamond', 'list'],
  ['square', 'record'],
  ['hexagon', 'reference'],
]);

const BY_PHRASE: ReadonlyMap<string, string> = new Map([
  ['on/off', 'boolean'],
  ['text', 'text'],
  ['color', 'color'],
  ['any value', 'any'],
]);

const BY_PREFIX: readonly (readonly [RegExp, string])[] = [
  [/^choice/, 'choice'],
  [/^(duration|date|time of day)/, 'time'],
];

export function typeToken(type: string, shape: PortShape): string {
  const shaped = BY_SHAPE.get(shape);
  if (shaped !== undefined) return shaped;
  const text = type.toLowerCase().replace(/^optional /, '');
  const named = BY_PHRASE.get(text);
  if (named !== undefined) return named;
  return BY_PREFIX.find(([pattern]) => pattern.test(text))?.[1] ?? 'number';
}

export function isOptionalType(type: string): boolean {
  return type.toLowerCase().startsWith('optional ');
}

export function ConditionPin({ condition }: { readonly condition: SceneCondition }): ReactNode {
  return (
    <Handle
      id={condition.handle}
      type="target"
      position={Position.Left}
      className="gc-handle gc-value gc-value-in"
      aria-hidden
      data-type="boolean"
      data-shape="circle"
      data-wired={condition.wired}
    />
  );
}

export function ValuePin({
  pin,
  side,
}: {
  readonly pin: ScenePin;
  readonly side: 'in' | 'out';
}): ReactNode {
  return (
    <Handle
      id={pin.handle}
      type={side === 'in' ? 'target' : 'source'}
      position={side === 'in' ? Position.Left : Position.Right}
      className={`gc-handle gc-value gc-value-${side}`}
      aria-hidden
      data-type={typeToken(pin.type, pin.shape)}
      data-shape={pin.shape}
      data-wired={pin.wired}
      data-optional={isOptionalType(pin.type)}
    />
  );
}

export function ValueInRow({ pin }: { readonly pin: ScenePin }): ReactNode {
  return (
    <div className="gc-row gc-value-row" data-side="in">
      <ValuePin pin={pin} side="in" />
      <span className="gc-caption">{pin.label}</span>
      <span className="gc-label gc-label-plain" data-wired={pin.wired}>
        {pin.value ?? ''}
      </span>
    </div>
  );
}

export function ValueOutRow({ pin }: { readonly pin: ScenePin }): ReactNode {
  return (
    <div className="gc-row gc-value-row" data-side="out">
      <span className="gc-caption">{pin.label}</span>
      <span className="gc-label gc-label-plain">{pin.type}</span>
      <ValuePin pin={pin} side="out" />
    </div>
  );
}
