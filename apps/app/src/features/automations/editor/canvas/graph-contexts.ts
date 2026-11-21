import { createContext } from 'react';
import type { GraphCanvasIntent } from './graph-canvas-types';
import type { GraphRunStore } from './graph-context';

export const GraphRunContext = createContext<GraphRunStore | null>(null);

export const GraphEmitContext = createContext<((intent: GraphCanvasIntent) => void) | null>(null);
