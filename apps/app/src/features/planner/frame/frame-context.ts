import { createContext, use } from 'react';
import type { PlannerPerson } from '../data';

export interface PlannerFrameValue {
  readonly person: PlannerPerson;
  readonly offline: boolean;
  readonly focusQuickAdd: () => void;
}

export const PlannerFrameContext = createContext<PlannerFrameValue | null>(null);

class OutsidePlannerFrame extends Error {
  constructor() {
    super('This part of the Planner only works inside the Planner frame.');
  }
}

export function usePlannerFrame(): PlannerFrameValue {
  const value = use(PlannerFrameContext);
  if (value === null) throw new OutsidePlannerFrame();
  return value;
}
