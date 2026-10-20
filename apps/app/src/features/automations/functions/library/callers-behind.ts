import type { AutomationFunctionSummary, AutomationV3 } from '@smarteverything/domain';
import { callsOf } from '@smarteverything/flow/functions/calls';

export function callersBehind(
  programs: readonly AutomationV3[],
  functions: readonly Pick<AutomationFunctionSummary, 'id' | 'revision'>[],
): ReadonlySet<string> {
  const latest = new Map(functions.map((entry) => [entry.id, entry.revision]));
  const behind = new Set<string>();
  for (const program of programs) {
    for (const call of callsOf(program)) {
      const current = latest.get(call.functionId);
      if (call.pin !== undefined && current !== undefined && call.pin < current) {
        behind.add(call.functionId);
      }
    }
  }
  return behind;
}
