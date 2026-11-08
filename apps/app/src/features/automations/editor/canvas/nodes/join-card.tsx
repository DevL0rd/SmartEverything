import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useGraphRun } from '../graph-context';
import type { GraphFlowNode } from '../graph-canvas-types';
import { ArrowHead, ExecOut } from '../pins/exec-pin';
import { CardShell, InputRows, OutputGroup, PairGlyph, pinsOf } from './card-shell';

function JoinCardView({ id, data, selected }: NodeProps<GraphFlowNode>): ReactNode {
  const { scene, incoming } = data;
  const run = useGraphRun(id);
  const then = scene.rows.find((row) => row.role === 'next');
  return (
    <CardShell scene={scene} run={run} selected={selected}>
      <div className="gc-join">
        <div className="gc-join-in">
          {incoming.map((label, index) => (
            <div key={`${String(index)}:${label}`} className="gc-join-path">
              <ArrowHead />
              <span className="gc-join-label">{label}</span>
            </div>
          ))}
          <div className="gc-join-path gc-spare" aria-hidden />
        </div>
        <div className="gc-join-main">
          {scene.pairIndex === null ? null : <PairGlyph index={scene.pairIndex} />}
          <div className="gc-text">
            <div className="gc-title">{scene.title}</div>
            {scene.summary === '' ? null : <div className="gc-summary">{scene.summary}</div>}
          </div>
          {then === undefined ? null : (
            <ExecOut handle={then.handle} role={then.role} wired={then.wired} />
          )}
        </div>
      </div>
      <InputRows pins={scene.inputs} />
      <OutputGroup pins={pinsOf(scene.outputs, 'output')} heading={null} />
    </CardShell>
  );
}

export const JoinCard = memo(JoinCardView);
