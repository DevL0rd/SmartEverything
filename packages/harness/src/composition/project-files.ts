import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context } from '@deepseek-ai/cordis';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type {
  AiHarnessStorageBinding,
  AiProjectRequest,
  AiProjectResult,
} from '@smarteverything/domain';
import { FsError } from '@deepseek-ai/dsh-fs';

export type ProjectFilePort = (
  execution: Readonly<ToolExecution>,
  request: AiProjectRequest,
) => Promise<AiProjectResult>;
export const MANAGED_FILE_TOOLS = ['read', 'read_image', 'write', 'edit'] as const;
interface FileScope {
  readonly execution: Readonly<ToolExecution>;
  readonly binding: AiHarnessStorageBinding;
}
export class ProjectFileScopes {
  private readonly sessions = new Map<string, AiHarnessStorageBinding>();
  private readonly calls = new AsyncLocalStorage<FileScope>();
  constructor(ctx: Context) {
    ctx.on('tools/execute', (execution, next) => {
      const binding =
        execution.agent === undefined ? undefined : this.sessions.get(execution.agent.id);
      if (binding === undefined) return next();
      return this.calls.run(
        { execution: Object.freeze({ ...execution }), binding: Object.freeze({ ...binding }) },
        next,
      );
    });
    ctx.effect(() => (): void => {
      this.sessions.clear();
    });
  }
  bind(id: string, binding: AiHarnessStorageBinding | undefined): void {
    if (binding === undefined) this.sessions.delete(id);
    else this.sessions.set(id, binding);
  }
  binding(id: string): AiHarnessStorageBinding | undefined {
    return this.sessions.get(id);
  }
  current(): FileScope | undefined {
    return this.calls.getStore();
  }
  sessionId(): string {
    const agent = this.managed().execution.agent;
    if (agent === undefined)
      throw new FsError('Managed files require an owned conversation.', 'FS_PERMISSION_DENIED');
    return agent.id;
  }
  managed(): FileScope {
    const scope = this.current();
    if (
      scope?.binding.kind !== 'managed' ||
      !MANAGED_FILE_TOOLS.some((name) => name === scope.execution.name)
    )
      throw new FsError(
        'Managed files require an admitted native file tool call.',
        'FS_PERMISSION_DENIED',
      );
    return scope;
  }
}
