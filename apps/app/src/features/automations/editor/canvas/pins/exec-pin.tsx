import { Handle, Position } from '@xyflow/react';
import type { ReactNode } from 'react';
import type { ExecRole, SceneCondition, SceneExecRow } from '../../../model/graph/scene-contract';
import { ConditionPin } from './value-pin';

export function ArrowHead(): ReactNode {
  return (
    <svg className="gc-arrow" viewBox="0 0 12 12" aria-hidden>
      <path d="M1.5 1.5L10.5 6L1.5 10.5Z" />
    </svg>
  );
}

export function ExecIn({
  handle,
  merged,
}: {
  readonly handle: string;
  readonly merged: number | null;
}): ReactNode {
  return (
    <>
      <Handle
        id={handle}
        type="target"
        position={Position.Left}
        className="gc-handle gc-exec gc-exec-in"
        aria-hidden
        data-merged={merged !== null}
      >
        <ArrowHead />
      </Handle>
      {merged === null ? null : (
        <span className="gc-merge" aria-hidden>
          {merged}
        </span>
      )}
    </>
  );
}

export function ExecOut({
  handle,
  role,
  wired,
}: {
  readonly handle: string;
  readonly role: ExecRole;
  readonly wired: boolean;
}): ReactNode {
  return (
    <Handle
      id={handle}
      type="source"
      position={Position.Right}
      className="gc-handle gc-exec gc-exec-out"
      aria-hidden
      data-role={role}
      data-wired={wired}
    >
      <ArrowHead />
    </Handle>
  );
}

function ConditionText({ condition }: { readonly condition: SceneCondition }): ReactNode {
  return (
    <span className="gc-cond" data-wired={condition.wired}>
      {condition.text}
    </span>
  );
}

export function ExecRow({
  row,
  caption,
}: {
  readonly row: SceneExecRow;
  readonly caption: string;
}): ReactNode {
  const { condition } = row;
  return (
    <div className="gc-row gc-exec-row" data-role={row.role}>
      {condition === null ? null : <ConditionPin condition={condition} />}
      {condition === null ? (
        <span className="gc-caption">{caption}</span>
      ) : (
        <ConditionText condition={condition} />
      )}
      <span className="gc-label">{row.label}</span>
      <ExecOut handle={row.handle} role={row.role} wired={row.wired} />
    </div>
  );
}
