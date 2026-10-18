import type { Context } from '@deepseek-ai/cordis';
import { AsyncLocalStorage } from 'node:async_hooks';
import { canonicalPath, writableRoots } from '@deepseek-ai/dsh-sandbox';
import type { SandboxExecutionPolicy, SandboxMode } from '@deepseek-ai/dsh-sandbox';
import type { SandboxPolicyRequest } from '@deepseek-ai/dsh-sandbox-policy';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';

const INDEX_TOOL = 'codegraph_index';
const INPUT = z.object({ project_path: z.string().optional() });

export class IndexerPermission {
  private readonly approved = new AsyncLocalStorage<SandboxExecutionPolicy>();
  constructor(private readonly ctx: Context) {}

  async context(): Promise<Context> {
    this.ctx.on('tools/pre-execute', async (execution, next) => {
      const decision = await next();
      const escalation = decision.kind === 'allow' ? this.escalation(execution) : undefined;
      if (escalation === undefined) return decision;
      const reason = `Read the project in ${JSON.stringify(escalation.path)} and write its .codegraph cache for this requested index.`;
      return { kind: 'ask', reason, displayReason: { en: reason } };
    });
    this.ctx.on('tools/execute', (execution, next) => {
      const escalation = this.escalation(execution);
      return escalation === undefined ? next() : this.approved.run(escalation.policy, next);
    });
    const isolated = this.ctx.isolate('sandboxPolicy');
    const owner = await isolated.plugin((active: Context): void => {
      active.provide('sandboxPolicy', this.approvedPolicy());
    });
    return owner.ctx;
  }

  private approvedPolicy(): Context['sandboxPolicy'] {
    const approved = this.approved;
    const policy = this.ctx.sandboxPolicy;
    const resolvePolicy = (request: SandboxPolicyRequest = {}): SandboxExecutionPolicy => {
      const granted = approved.getStore();
      return granted !== undefined && granted.sessionId === request.session?.id
        ? granted
        : policy.resolve(request);
    };
    return new Proxy(policy, {
      getOwnPropertyDescriptor: (target, key): PropertyDescriptor | undefined =>
        key === 'resolve'
          ? { configurable: true, value: resolvePolicy }
          : Reflect.getOwnPropertyDescriptor(target, key),
    });
  }

  private escalation(
    execution: Readonly<Pick<ToolExecution, 'name' | 'agent' | 'arguments'>>,
  ): { readonly policy: SandboxExecutionPolicy; readonly path: string } | undefined {
    const agent = execution.agent;
    if (execution.name !== INDEX_TOOL || agent === undefined) return undefined;
    const policy = this.ctx.sandboxPolicy.resolve({ session: agent.session });
    const input = INPUT.parse(execution.arguments);
    const path = canonicalPath(
      resolve(this.ctx.workingDirectory.get(agent.session), input.project_path ?? '.'),
    );
    if (policy.mode === 'danger-full-access' || writes(policy, path)) return undefined;
    const mode: SandboxMode = writes({ ...policy, mode: 'workspace-write' }, path)
      ? 'workspace-write'
      : 'danger-full-access';
    return { policy: { ...policy, mode }, path };
  }
}

function writes(policy: SandboxExecutionPolicy, path: string): boolean {
  return writableRoots(policy).some((root) => contained(root, path));
}

function contained(root: string, path: string): boolean {
  const child = relative(root, path);
  return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}
