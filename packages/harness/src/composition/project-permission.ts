import type { Context } from '@deepseek-ai/cordis';
import { ProjectFileSystem } from './project-filesystem';
import { managedImageDefinition } from './project-image';
export function mountProjectGuards(ctx: Context, server: boolean): void {
  const definitions = new Map(
    ['read', 'read_image', 'write', 'edit'].map((name) => [name, ctx.tools.get(name)] as const),
  );
  ctx.tools.guard((execution) => {
    if (!definitions.has(execution.name)) return undefined;
    const managed =
      execution.agent !== undefined &&
      ctx.fs instanceof ProjectFileSystem &&
      ctx.fs.scopes.binding(execution.agent.id)?.kind === 'managed';
    if (server && !managed) return 'Hub files require the admitted managed chat project.';
    const definition = ctx.tools.get(execution.name, execution.agent);
    return managed &&
      !managedImageDefinition(definition) &&
      definition !== definitions.get(execution.name)
      ? 'Managed file tool registration changed.'
      : undefined;
  });
  ctx.tools.guard((execution) => {
    if (
      !(ctx.fs instanceof ProjectFileSystem) ||
      execution.agent === undefined ||
      ctx.fs.scopes.binding(execution.agent.id)?.kind !== 'managed'
    )
      return undefined;
    if (
      ['bash', 'pwsh', 'job_output', 'job_list', 'job_kill'].includes(execution.name) ||
      execution.name.startsWith('codegraph')
    )
      return 'Central files have no device process path. Select a device workspace for shell, jobs or indexing.';
    return undefined;
  });
}
