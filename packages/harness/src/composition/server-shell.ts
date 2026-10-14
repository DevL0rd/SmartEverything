import ShellExecutor from '@deepseek-ai/dsh-shell';
import type { ShellExecRequest, ShellExecSpec, ShellExecution } from '@deepseek-ai/dsh-shell';
import type { SandboxMode } from '@deepseek-ai/dsh-sandbox';
import { HarnessRuntimeError } from '../host/errors';

export class ServerShellExecutor extends ShellExecutor {
  override get sandboxMode(): SandboxMode {
    return 'read-only';
  }

  override resolve(_request: ShellExecRequest): ShellExecSpec {
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'The central conversation host cannot resolve local shell commands.',
    );
  }

  override execute(_spec: ShellExecSpec): Promise<ShellExecution> {
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'The central conversation host cannot execute local shell commands.',
    );
  }
}
