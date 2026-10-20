import type { ReactNode } from 'react';
import type { SceneNode, ScenePort } from '../../../model/canvas/contract';

export function ValueChip({ port }: { readonly port: ScenePort }): ReactNode {
  const text = port.value;
  if (text === null || text === '') return null;
  return (
    <span className="sn-chip" data-kind={port.wired ? 'wired' : 'literal'} title={text}>
      <span className="sn-chip-text">{text}</span>
    </span>
  );
}

export function Pill({
  text,
  tone,
}: {
  readonly text: string;
  readonly tone?: 'info' | 'critical' | 'primary' | undefined;
}): ReactNode {
  return (
    <span className="sn-pill" data-tone={tone}>
      {text}
    </span>
  );
}

export function CornerTag({ text }: { readonly text: string }): ReactNode {
  return <span className="sn-corner">{text}</span>;
}

const JOIN_LABELS: ReadonlyMap<string, string> = new Map([
  ['all', 'Wait for all'],
  ['first', 'First to finish wins'],
  ['settled', 'Wait for all and record each result'],
]);

function portOf(scene: SceneNode, name: string): ScenePort | undefined {
  return scene.ports.find((port) => port.name === name);
}

function switchPills(scene: SceneNode): readonly string[] {
  const mode = portOf(scene, 'mode')?.value ?? '';
  return mode === 'all' || /every/i.test(mode) ? ['Every matching case'] : [];
}

function parallelPills(scene: SceneNode): readonly string[] {
  const join = portOf(scene, 'join')?.value ?? 'all';
  return [JOIN_LABELS.get(join) ?? join];
}

function eachPills(scene: SceneNode): readonly string[] {
  const count = portOf(scene, 'concurrency')?.value ?? '1';
  return count === '1' ? [] : ['At the same time'];
}

const PILLS: ReadonlyMap<string, (scene: SceneNode) => readonly string[]> = new Map([
  ['flow.switch', switchPills],
  ['flow.parallel', parallelPills],
  ['flow.for_each', eachPills],
]);

export function headerPills(scene: SceneNode): readonly string[] {
  const make = scene.kind === null ? undefined : PILLS.get(scene.kind);
  return make === undefined ? [] : make(scene);
}

export interface LimitBadge {
  readonly name: string;
  readonly text: string;
}

const LIMIT_PORTS = ['gap', 'limit'] as const;

export function limitBadges(scene: SceneNode): readonly LimitBadge[] {
  return LIMIT_PORTS.flatMap((name) => {
    const port = portOf(scene, name);
    if (port?.value === undefined || port.value === null || port.value === '') return [];
    return [{ name, text: `${port.label} ${port.value}` }];
  });
}

export function Badges({ scene }: { readonly scene: SceneNode }): ReactNode {
  const pills = headerPills(scene);
  const limits = limitBadges(scene);
  if (pills.length === 0 && limits.length === 0) return null;
  return (
    <div className="sn-badges">
      {pills.map((text) => (
        <Pill key={text} text={text} tone="primary" />
      ))}
      {limits.map((badge) => (
        <Pill key={badge.name} text={badge.text} />
      ))}
    </div>
  );
}
