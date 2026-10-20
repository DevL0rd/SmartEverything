'use dom';

import 'd3-transition';
import '@xyflow/react/dist/base.css';
import './canvas-frame.css';
import './nodes/nodes.css';
import './canvas.css';
import type { ReactNode } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { CanvasRoot } from './canvas-root';
import type { FlowCanvasProps } from './canvas-types';

export default function FlowCanvas(props: FlowCanvasProps): ReactNode {
  return (
    <ReactFlowProvider>
      <CanvasRoot {...props} />
    </ReactFlowProvider>
  );
}
