import { Handle, Position } from '@xyflow/react';
import type { CSSProperties, ReactNode } from 'react';
import type { PortShape, ScenePort } from '../../../model/canvas/contract';
import { LANE_TITLE_H, PORT_ROW_H, STEP_BASE_H } from '../../../model/canvas/metrics';
import { ValueChip } from './chips';

export type PinLayout =
  { readonly kind: 'rows' } | { readonly kind: 'spread'; readonly zone: number | null };

export const WHOLE_CARD: PinLayout = { kind: 'spread', zone: null };

export function zoneLayout(zone: number): PinLayout {
  return { kind: 'spread', zone };
}

export const STEP_ROWS: PinLayout = { kind: 'rows' };

export function pinTop(layout: PinLayout, index: number, count: number): CSSProperties {
  if (layout.kind === 'rows') return { top: STEP_BASE_H + index * PORT_ROW_H + PORT_ROW_H / 2 };
  const share = (index + 1) / (count + 1);
  return { top: layout.zone === null ? `${String(share * 100)}%` : share * layout.zone };
}

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

function pinData(port: ScenePort): Record<string, string | boolean> {
  return {
    'data-type': typeToken(port.type, port.shape),
    'data-shape': port.shape,
    'data-wired': port.wired,
    'data-optional': isOptionalType(port.type),
    'data-problem': port.problem,
  };
}

export function InputHandles({
  ports,
  layout,
}: {
  readonly ports: readonly ScenePort[];
  readonly layout: PinLayout;
}): ReactNode {
  return ports.map((port, index) => (
    <Handle
      key={port.name}
      id={port.name}
      type="target"
      position={Position.Left}
      className="sn-handle"
      aria-hidden
      style={pinTop(layout, index, ports.length)}
      {...pinData(port)}
    />
  ));
}

export function OutputPins({
  ports,
  layout,
  labels,
}: {
  readonly ports: readonly ScenePort[];
  readonly layout: PinLayout;
  readonly labels: boolean;
}): ReactNode {
  return ports.map((port, index) => {
    const style = pinTop(layout, index, ports.length);
    return (
      <span key={port.name}>
        <Handle
          id={port.name}
          type="source"
          position={Position.Right}
          className="sn-handle"
          aria-hidden
          style={style}
          {...pinData(port)}
        />
        {labels ? (
          <span
            className="sn-out"
            aria-hidden
            style={style}
            data-type={typeToken(port.type, port.shape)}
          >
            {port.label}
          </span>
        ) : null}
      </span>
    );
  });
}

export function ExecHandles({ lane }: { readonly lane?: boolean }): ReactNode {
  return (
    <>
      <Handle
        id="in"
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="sn-exec"
        aria-hidden
      />
      <Handle
        id="next"
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="sn-exec"
        aria-hidden
      />
      <Handle
        id="start"
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="sn-exec"
        aria-hidden
        style={lane === true ? { top: LANE_TITLE_H, bottom: 'auto' } : undefined}
      />
    </>
  );
}

function PortRow({ port }: { readonly port: ScenePort }): ReactNode {
  return (
    <div className="sn-port" data-problem={port.problem}>
      <span className="sn-port-label">{port.label}</span>
      <ValueChip port={port} />
    </div>
  );
}

export function PortRows({ ports }: { readonly ports: readonly ScenePort[] }): ReactNode {
  if (ports.length === 0) return null;
  return (
    <div className="sn-ports">
      {ports.map((port) => (
        <PortRow key={port.name} port={port} />
      ))}
    </div>
  );
}

export function ChipPin({
  port,
  side,
}: {
  readonly port: ScenePort;
  readonly side: 'top' | 'bottom';
}): ReactNode {
  const isTop = side === 'top';
  return (
    <span className="sn-pin" data-type={typeToken(port.type, port.shape)}>
      <span className="sn-pin-label">{port.label}</span>
      <Handle
        id={port.name}
        type={isTop ? 'target' : 'source'}
        position={isTop ? Position.Top : Position.Bottom}
        className="sn-handle"
        aria-hidden
        {...pinData(port)}
      />
    </span>
  );
}
