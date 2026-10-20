import type { EdgeTypes } from '@xyflow/react';
import { ExecEdge } from './exec-edge';
import { ValueEdge } from './value-edge';

export const EDGE_TYPES: EdgeTypes = { exec: ExecEdge, value: ValueEdge };
