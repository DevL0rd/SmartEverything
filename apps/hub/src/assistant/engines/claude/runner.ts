import { ComputerRunner, type ComputerRunnerDeps } from '../computer/runner';
export type ClaudeRunnerDeps = Omit<ComputerRunnerDeps, 'runtime'>;
export class ClaudeRunner extends ComputerRunner {
  constructor(deps: ClaudeRunnerDeps) {
    super({ ...deps, runtime: 'claude' });
  }
}
