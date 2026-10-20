import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import { HEADER_H, LANE_TITLE_H } from '../../../model/canvas/metrics';
import type { CanvasNode } from '../canvas-types';
import { CardShell, TextBlock, useCardRun } from './card-parts';
import { Badges, Pill } from './chips';
import { IconWell } from './icons';
import { ExecHandles, InputHandles, OutputPins, zoneLayout } from './ports';
import { StatusSlot } from './status-slot';

const HEADER_ZONE = zoneLayout(HEADER_H);
const LANE_ZONE = zoneLayout(LANE_TITLE_H);

function ContainerFrameView({ id, data, selected }: NodeProps<CanvasNode>): ReactNode {
  const { scene } = data;
  const run = useCardRun(id, scene);
  return (
    <CardShell
      scene={scene}
      run={run}
      selected={selected}
      pins={
        <>
          <ExecHandles />
          <InputHandles ports={scene.ports} layout={HEADER_ZONE} />
          <OutputPins ports={scene.outputs} layout={HEADER_ZONE} labels={false} />
        </>
      }
    >
      <div className="sn-frame-head">
        <IconWell icon={scene.icon} title={scene.title} />
        <TextBlock scene={scene} overline={null} />
        <Badges scene={scene} />
        {scene.collapsed ? <Pill text={`${String(scene.hiddenCount)} hidden`} /> : null}
        {scene.pills.map((name) => (
          <Pill key={name} text={name} tone="info" />
        ))}
        <StatusSlot scene={scene} run={run} />
      </div>
    </CardShell>
  );
}

export const ContainerFrame = memo(ContainerFrameView);

function LaneFrameView({ id, data, selected }: NodeProps<CanvasNode>): ReactNode {
  const { scene } = data;
  const run = useCardRun(id, scene);
  return (
    <CardShell
      scene={scene}
      run={run}
      selected={selected}
      pins={
        <>
          <ExecHandles lane />
          <OutputPins ports={scene.outputs} layout={LANE_ZONE} labels={false} />
        </>
      }
    >
      <div className="sn-lane-head">
        <TextBlock scene={scene} overline={null} />
        {scene.chip === null ? null : <Pill text={scene.chip} />}
        {scene.collapsed ? <Pill text={`${String(scene.hiddenCount)} hidden`} /> : null}
        {scene.pills.map((name) => (
          <Pill key={name} text={name} tone="info" />
        ))}
      </div>
    </CardShell>
  );
}

export const LaneFrame = memo(LaneFrameView);

function TriggerGroupFrameView({ id, data, selected }: NodeProps<CanvasNode>): ReactNode {
  const { scene } = data;
  const run = useCardRun(id, scene);
  return (
    <CardShell scene={scene} run={run} selected={selected} pins={<ExecHandles lane />}>
      <div className="sn-lane-head">
        <IconWell icon={scene.icon} title={scene.title} />
        <TextBlock scene={scene} overline={null} />
      </div>
    </CardShell>
  );
}

export const TriggerGroupFrame = memo(TriggerGroupFrameView);
