import { ComputerRunner, type ComputerRunnerDeps } from '../computer/runner';
export class CodexRunner extends ComputerRunner {
  constructor(deps: Omit<ComputerRunnerDeps, 'runtime'>) {
    super({ ...deps, runtime: 'codex' });
  }
}
