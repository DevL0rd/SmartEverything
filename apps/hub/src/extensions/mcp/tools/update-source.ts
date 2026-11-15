import { updateSourceProblem } from '@smarteverything/domain';
import { ToolError } from './registry';

export function requireSourceFields(input: Parameters<typeof updateSourceProblem>[0]): void {
  const problem = updateSourceProblem(input);
  if (problem !== null) throw new ToolError(problem);
}
