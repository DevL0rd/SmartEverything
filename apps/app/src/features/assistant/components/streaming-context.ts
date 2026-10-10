import { createContext, use, type ReactNode } from 'react';
import type { AssistantMessageRow } from '@smarteverything/domain';

export type WorkingRenderer = (row: AssistantMessageRow) => ReactNode;

const StreamingContext = createContext<WorkingRenderer | null>(null);

export const StreamingProvider = StreamingContext.Provider;

export function useWorkingRenderer(): WorkingRenderer | null {
  return use(StreamingContext);
}
