import type { ReactNode } from 'react';
import type { RunNode, SceneNode } from '../../../model/canvas/contract';
import { Glyph } from './icons';
import { RunBadges } from './run-badges';

export function StatusSlot({
  scene,
  run,
}: {
  readonly scene: SceneNode;
  readonly run: RunNode | null;
}): ReactNode {
  const severity = scene.problems[0]?.severity ?? null;
  return (
    <div className="sn-status">
      <RunBadges run={run} />
      {scene.enabled ? null : <Glyph name="ban" className="sn-disabled" />}
      {severity === null ? null : <span className="sn-dot" data-severity={severity} />}
    </div>
  );
}
