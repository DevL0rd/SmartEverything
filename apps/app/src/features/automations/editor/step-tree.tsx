import { createContext, useContext, type ReactNode } from 'react';
import type { StepV2 } from '@smarteverything/domain';
import type { Catalog } from '../data/use-automations';

export interface StepTree {
  readonly root: readonly StepV2[];
  readonly catalog: Catalog;
  readonly problems: Readonly<Record<string, readonly string[]>>;
  readonly change: (steps: readonly StepV2[]) => void;
  readonly open: (id: string) => void;
}

const TreeContext = createContext<StepTree | null>(null);

class MissingStepTreeError extends Error {
  override readonly name = 'MissingStepTreeError';
}

export function useStepTree(): StepTree {
  const tree = useContext(TreeContext);
  if (tree === null) throw new MissingStepTreeError('A step list needs its StepTreeProvider.');
  return tree;
}

export function StepTreeProvider({
  tree,
  children,
}: {
  readonly tree: StepTree;
  readonly children: ReactNode;
}): ReactNode {
  return <TreeContext value={tree}>{children}</TreeContext>;
}
