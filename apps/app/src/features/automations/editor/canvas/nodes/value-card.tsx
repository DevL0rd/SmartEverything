import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { ScenePin } from '../../../model/graph/scene-contract';
import { IconWell } from './icons';
import { useGraphRun } from '../graph-context';
import type { GraphFlowNode } from '../graph-canvas-types';
import { ValuePin } from '../pins/value-pin';
import { CardShell, useShownPins } from './card-shell';

function PinColumn({
  pins,
  side,
}: {
  readonly pins: readonly ScenePin[];
  readonly side: 'in' | 'out';
}): ReactNode {
  const folded = useShownPins(pins);
  const shown = side === 'out' ? folded : pins;
  if (shown.length === 0) return null;
  return (
    <div className="gc-vcol" data-side={side}>
      {shown.map((pin) => (
        <div key={pin.handle} className="gc-vpin" data-side={side}>
          <ValuePin pin={pin} side={side} />
          <span className="gc-vpin-label">{pin.label}</span>
        </div>
      ))}
    </div>
  );
}

function ValueCardView({ id, data, selected }: NodeProps<GraphFlowNode>): ReactNode {
  const { scene } = data;
  const run = useGraphRun(id);
  return (
    <CardShell scene={scene} run={run} selected={selected}>
      <div className="gc-vbody">
        <IconWell icon={scene.icon} title={scene.title} />
        <div className="gc-text">
          <div className="gc-title">{scene.title}</div>
          {scene.summary === '' ? null : <div className="gc-summary">{scene.summary}</div>}
        </div>
      </div>
      <div className="gc-value-card">
        <PinColumn pins={scene.inputs} side="in" />
        <PinColumn pins={scene.outputs} side="out" />
      </div>
    </CardShell>
  );
}

export const ValueCard = memo(ValueCardView);
