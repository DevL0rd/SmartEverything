import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { CanvasNode } from '../canvas-types';
import { CardShell, useCardRun } from './card-parts';
import { Glyph } from './icons';

function CommentCardView({ id, data, selected }: NodeProps<CanvasNode>): ReactNode {
  const { scene } = data;
  const run = useCardRun(id, scene);
  return (
    <CardShell scene={scene} run={run} selected={selected} look="comment" pins={null}>
      <div className="sn-note">
        <Glyph name="sticky-note" className="sn-glyph" />
        <span className="sn-note-text">{scene.title}</span>
      </div>
    </CardShell>
  );
}

export const CommentCard = memo(CommentCardView);
