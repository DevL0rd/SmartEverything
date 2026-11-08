import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { SceneExecRow } from '../../../model/graph/scene-contract';
import { useGraphRun } from '../graph-context';
import type { GraphFlowNode } from '../graph-canvas-types';
import { CardHeader, CardShell, InputRows, OutputGroup, pinsOf } from './card-shell';
import { CappedRows } from './end-cap';

const CATCH_PREFIX = 'catch:';

const TRY_CAPTION: Readonly<Record<string, string>> = {
  try: 'Runs first',
  finally: 'Always runs',
};

export function tryCaption(row: SceneExecRow): string {
  if (row.port.startsWith(CATCH_PREFIX)) return 'Handles the failure';
  return TRY_CAPTION[row.port] ?? '';
}

function byPort(rows: readonly SceneExecRow[], port: string): readonly SceneExecRow[] {
  return rows.filter((row) => row.port === port);
}

function TryCardView({ id, data, selected }: NodeProps<GraphFlowNode>): ReactNode {
  const { scene } = data;
  const run = useGraphRun(id);
  const { rows } = scene;
  const catches = rows.filter((row) => row.port.startsWith(CATCH_PREFIX));
  return (
    <CardShell scene={scene} run={run} selected={selected}>
      <CardHeader scene={scene} run={run} />
      <CappedRows rows={byPort(rows, 'try')} captionOf={tryCaption} />
      <CappedRows rows={catches} captionOf={tryCaption} />
      <OutputGroup pins={pinsOf(scene.outputs, 'inside')} heading="in the catch" />
      <CappedRows rows={byPort(rows, 'finally')} captionOf={tryCaption} />
      <CappedRows rows={rows.filter((row) => row.role === 'next')} captionOf={tryCaption} />
      <InputRows pins={scene.inputs} />
      <OutputGroup pins={pinsOf(scene.outputs, 'output')} heading={null} />
      <OutputGroup pins={pinsOf(scene.outputs, 'after')} heading="after the Try" />
    </CardShell>
  );
}

export const TryCard = memo(TryCardView);
