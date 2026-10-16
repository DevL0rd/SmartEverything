import type { Context } from '@deepseek-ai/cordis';
import { AsyncLocalStorage } from 'node:async_hooks';
import { approveEscalation, canonicalPath, writableRoots } from '@deepseek-ai/dsh-sandbox';
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox';
import type { SandboxPolicyRequest } from '@deepseek-ai/dsh-sandbox-policy';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { HarnessRuntimeError } from '../host/errors';

const INPUT = z.object({ project_path: z.string().optional() });

export class IndexerPermission {
  private readonly calls = new AsyncLocalStorage<SandboxExecutionPolicy>();
  constructor(private readonly ctx: Context) {}

  async context(): Promise<Context> {
    const isolated = this.ctx.isolate('sandboxPolicy').isolate('tools');
    const owner = await isolated.plugin((active: Context): void => {
      this.provide(active);
    });
    return owner.ctx;
  }

  private provide(scoped: Context): void {
    const calls = this.calls;
    const policy = this.ctx.sandboxPolicy;
    const resolvePolicy = (request: SandboxPolicyRequest = {}): SandboxExecutionPolicy => {
      const approved = calls.getStore();
      return approved !== undefined && approved.sessionId === request.session?.id
        ? approved
        : policy.resolve(request);
    };
    scoped.provide(
      'sandboxPolicy',
      new Proxy(policy, {
        getOwnPropertyDescriptor: (target, key): PropertyDescriptor | undefined =>
          key === 'resolve'
            ? { configurable: true, value: resolvePolicy }
            : Reflect.getOwnPropertyDescriptor(target, key),
      }),
    );
    const tools = this.ctx.tools;
    const definition = (original: ToolDefinition): ToolDefinition => this.definition(original);
    function register(this: Context['tools'], original: ToolDefinition): () => void {
      return tools.register.call(this, definition(original));
    }
    scoped.provide(
      'tools',
      new Proxy(tools, {
        getOwnPropertyDescriptor: (target, key): PropertyDescriptor | undefined =>
          key === 'register'
            ? { configurable: true, value: register }
            : Reflect.getOwnPropertyDescriptor(target, key),
      }),
    );
  }

  private definition(original: ToolDefinition): ToolDefinition {
    if (original.name !== 'codegraph_index') return original;
    return {
      ...original,
      execute: async (raw, execution): Promise<unknown> => {
        const policy = await this.authorize(raw, execution);
        execution.signal.throwIfAborted();
        this.ctx.nativeExecutionGuard(execution);
        return this.calls.run(policy, () => original.execute(raw, execution));
      },
    };
  }

  private async authorize(
    raw: unknown,
    execution: ToolRunContext,
  ): Promise<SandboxExecutionPolicy> {
    const agent = execution.agent;
    if (agent === undefined)
      throw new HarnessRuntimeError('ownership_lost', 'Indexing requires its owned native chat.');
    const policy = this.ctx.sandboxPolicy.resolve({ session: agent.session });
    const input = INPUT.parse(raw);
    const directory = this.ctx.workingDirectory.get(agent.session);
    const path = canonicalPath(resolve(directory, input.project_path ?? '.'));
    if (
      policy.mode === 'danger-full-access' ||
      writableRoots(policy).some((root) => contained(root, path))
    )
      return policy;
    const mode = await approveEscalation(
      {
        requestedMode: writableRoots({ ...policy, mode: 'workspace-write' }).some((root) =>
          contained(root, path),
        )
          ? 'workspace-write'
          : 'danger-full-access',
        effectiveMode: policy.mode,
        justification: `Read the project in ${JSON.stringify(path)} and write its .codegraph cache for this requested index.`,
        subject: 'operation',
      },
      {
        approver: this.ctx.get('approval'),
        agent,
        callId: execution.callId,
        toolName: 'codegraph_index',
        signal: execution.signal,
      },
    );
    execution.signal.throwIfAborted();
    if (
      this.ctx.workingDirectory.get(agent.session) !== directory ||
      canonicalPath(resolve(directory, input.project_path ?? '.')) !== path ||
      JSON.stringify(this.ctx.sandboxPolicy.resolve({ session: agent.session })) !==
        JSON.stringify(policy)
    )
      throw new HarnessRuntimeError(
        'operation_failed',
        'The indexing folder or permission changed during approval.',
      );
    return { ...policy, mode };
  }
}

function contained(root: string, path: string): boolean {
  const child = relative(root, path);
  return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}
