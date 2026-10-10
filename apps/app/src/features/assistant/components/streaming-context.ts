import { createContext, use, type ReactNode } from 'react';
import type { AssistantMessageRow } from '@smarteverything/domain';

export type WorkingRenderer = (row: AssistantMessageRow) => ReactNode;

export interface StreamingRenderers {
  readonly working: WorkingRenderer;
}

const StreamingContext = createContext<StreamingRenderers | null>(null);

export const StreamingProvider = StreamingContext.Provider;

export function useStreamingRenderers(): StreamingRenderers | null {
  return use(StreamingContext);
}
