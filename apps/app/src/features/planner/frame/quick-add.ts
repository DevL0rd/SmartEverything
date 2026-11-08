import { useCallback } from 'react';
import { usePlannerTools, usePlannerWrites, type PlannerPerson, type PlannerTools } from '../data';
import type { PlannerWrites } from '../data';

export interface QuickAddPorts {
  readonly parse: PlannerTools['parse'];
  readonly create: PlannerWrites['createItem'];
}

export async function addPlannerText(text: string, ports: QuickAddPorts): Promise<boolean> {
  const trimmed = text.trim();
  if (trimmed === '') return false;
  const { draft } = await ports.parse({ text: trimmed });
  await ports.create(draft);
  return true;
}

export function usePlannerQuickAdd(person: PlannerPerson): (text: string) => Promise<boolean> {
  const { parse } = usePlannerTools(person);
  const { createItem } = usePlannerWrites(person);
  return useCallback(
    (text) => addPlannerText(text, { parse, create: createItem }),
    [parse, createItem],
  );
}
