import { Service } from '@deepseek-ai/cordis';
import type { Context } from '@deepseek-ai/cordis';
import type { AiMemoryAccess } from '@smarteverything/domain';
import { HarnessRuntimeError } from '../../host/errors';
import { renderRecall } from './recall';
import { MEMORY_TOOL, memoryTool } from './tool';

declare module '@deepseek-ai/cordis' {
  interface Context {
    memory: MemoryPlugin;
  }
}

export const name = 'memory';

const RECALL_CONTEXT = 'smarteverything-memory';

export class MemoryPlugin extends Service {
  static readonly inject = ['tools', 'systemPrompt'];

  private access: AiMemoryAccess | undefined;
  private registration: (() => void) | undefined;

  constructor(ctx: Context) {
    super(ctx, 'memory');
    this.install(ctx);
  }

  private install(ctx: Context): void {
    ctx.on('system-prompt/assemble', async (_assembly, assembly, next) => {
      const agent = assembly.agent;
      const access = this.access;
      if (access === undefined || agent === undefined) return next();
      await access.prepare(agent.id);
      const recall = renderRecall(await access.recall(agent.id), new Date());
      const result = await next();
      if (recall !== '')
        result.contexts.push({ name: RECALL_CONTEXT, text: recall, interpolate: false });
      if (!(await access.offered(agent.id)))
        result.tools = result.tools.filter((tool) => tool.name !== MEMORY_TOOL);
      return result;
    });
  }

  bind(access: AiMemoryAccess): () => void {
    this.release();
    this.access = access;
    this.registration = this.ctx.tools.register(memoryTool(() => this.access));
    return (): void => {
      if (this.access === access) this.release();
    };
  }

  private release(): void {
    this.registration?.();
    this.registration = undefined;
    this.access = undefined;
  }
}

export function bindMemory(ctx: Context, access: AiMemoryAccess): () => void {
  const service = ctx.get('memory');
  if (!(service instanceof MemoryPlugin))
    throw new HarnessRuntimeError('runtime_unavailable', 'Memory is unavailable.');
  return service.bind(access);
}

export async function mount(ctx: Context): Promise<void> {
  await ctx.plugin(MemoryPlugin);
}
