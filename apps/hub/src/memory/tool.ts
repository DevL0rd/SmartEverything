import { ApiError } from '@smarteverything/domain';
import type { AiMemoryToolArguments, AiMemoryToolResult } from '@smarteverything/domain';
import type { MemoryService } from './service';
import type { MemoryPrincipal } from './principal';

export async function runMemoryTool(
  service: MemoryService,
  who: MemoryPrincipal,
  args: AiMemoryToolArguments,
): Promise<AiMemoryToolResult> {
  if (!service.offered(who))
    throw new ApiError('forbidden', 'Memory is turned off for the person in this chat.');
  switch (args.action) {
    case 'view':
      return args.query === undefined
        ? {
            memories: service
              .list(who)
              .memories.filter((memory) => args.scope === undefined || memory.scope === args.scope)
              .map((memory) => service.toolLine(memory)),
          }
        : {
            memories: (await service.search(who, args.query, args.scope)).map((memory) =>
              service.toolLine(memory),
            ),
          };
    case 'add': {
      const { action: _action, ...input } = args;
      const added = await service.add(who, input);
      return { memory: service.toolLine(added.memory), outcome: added.outcome };
    }
    case 'edit': {
      const { action: _action, id, ...patch } = args;
      const changed = service.change(who, id, patch);
      return { memory: service.toolLine(changed.memory), outcome: changed.outcome };
    }
    case 'delete':
      service.remove(who, args.id);
      return { deleted: args.id };
  }
}
